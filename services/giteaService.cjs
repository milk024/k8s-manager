'use strict';

const config = require('../helpers/configHelper.cjs');

const CI_CONTEXT = 'jenkins/build';
// 저장소에 Jenkinsfile 이 있는지(= Jenkins 빌드 대상) 캐시. rag 하위 모듈·deploy-* 저장소는 빌드하지 않는다
const CI_CACHE_MS = 5 * 60 * 1000;
const SUMMARY_CACHE_MS = 10 * 1000;

// 커밋 + jenkins/build 상태 → 대시보드 빌드 행
//   status: success | failure | error | pending | none(상태 없음)
//   buildNumber: 상태 설명 "Jenkins #12 SUCCESS" 에서 추출, url: Jenkins 빌드 화면
function toBuild({ owner, repo, branch, sha, message, committedAt, status }) {
  const buildNumber = Number(/#(\d+)/.exec(status?.description ?? '')?.[1]) || null;
  return {
    id: sha,
    owner,
    repo,
    branch,
    sha,
    title: (message ?? '').split('\n')[0],
    // 상태 API 는 값을 status 필드에, status 웹훅은 state 필드에 담는다
    status: status ? (status.state ?? status.status ?? 'none') : 'none',
    buildNumber,
    description: status?.description ?? null,
    url: status?.target_url || null,
    updatedAt: status?.updated_at ?? status?.created_at ?? committedAt ?? null,
  };
}

class GiteaService {
  constructor() {
    this.baseUrl = config.gitea.baseUrl;
    this.token = config.gitea.token;
    this.ciCache = new Map(); // full_name → { hasCi, at }
  }

  _authHeaders() {
    return this.token ? { Authorization: `token ${this.token}` } : {};
  }

  async _request(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...this._authHeaders(), ...options.headers },
    });
    if (!res.ok) {
      throw new Error(`Gitea API ${res.status}: ${await res.text()}`);
    }
    return res.status === 204 ? null : res.json();
  }

  // Gitea의 /repos/search는 배열이 아니라 { ok, data } 로 감싸서 응답한다 —
  // 다른 조회 API(예: /api/k8s/pods)와의 일관성을 위해 배열만 꺼내서 돌려준다.
  // 각 저장소에 hasCi(기본 브랜치에 Jenkinsfile 있음)를 붙인다. 대시보드는 hasCi 저장소만 기본으로 보여준다.
  async listRepos() {
    const result = await this._request('/api/v1/repos/search?owner=myorg&limit=50');
    const repos = result.data ?? [];
    return Promise.all(repos.map(async (repo) => ({ ...repo, hasCi: await this._hasJenkinsfile(repo) })));
  }

  async _hasJenkinsfile(repo) {
    const cached = this.ciCache.get(repo.full_name);
    if (cached && Date.now() - cached.at < CI_CACHE_MS) return cached.hasCi;
    let hasCi = false;
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/repos/${repo.full_name}/contents/Jenkinsfile?ref=${encodeURIComponent(repo.default_branch || 'main')}`,
        { method: 'GET', headers: this._authHeaders() },
      );
      hasCi = res.ok;
      await res.body?.cancel();
    } catch {
      return cached?.hasCi ?? false; // Gitea 일시 오류면 직전 값 유지
    }
    this.ciCache.set(repo.full_name, { hasCi, at: Date.now() });
    return hasCi;
  }

  async getRepo(owner, repo) {
    return this._request(`/api/v1/repos/${owner}/${repo}`);
  }

  // ADR-0052: 빌드는 Jenkins 가 하고, 결과를 Gitea 커밋 상태(context jenkins/build)로 남긴다.
  // 대시보드는 Jenkins 에 직접 붙지 않고(자격 증명 불필요) 이 커밋 상태를 읽는다.
  //   목록: main 의 최근 커밋 N개 + 커밋별 jenkins/build 상태
  //   실시간: Gitea status 웹훅 → /webhook/gitea → 'ci:build' 소켓 이벤트
  // 상태가 없는 커밋([skip ci] 등 빌드 안 함)은 status 'none' 으로 돌려준다.
  async listBuilds(owner, repo, limit = 10, branch = 'main') {
    const n = Math.min(Math.max(Number(limit) || 10, 1), 30);
    const commits = await this._request(
      `/api/v1/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&limit=${n}&stat=false&verification=false&files=false`,
    );
    return Promise.all(commits.map(async (commit) => {
      const combined = await this._request(`/api/v1/repos/${owner}/${repo}/commits/${commit.sha}/status`).catch(() => null);
      const status = (combined?.statuses ?? []).find((s) => s.context === CI_CONTEXT) ?? null;
      return toBuild({ owner, repo, branch, sha: commit.sha, message: commit.commit?.message, committedAt: commit.commit?.author?.date, status });
    }));
  }

  // 빌드 화면·배포 상태 화면용: Jenkinsfile 이 있는 저장소마다
  //   head        : main 최신 커밋 (빌드 안 한 [skip ci] 커밋이면 status 'none')
  //   latestBuild : 상태가 있는 가장 최근 커밋 (pending = 빌드 중)
  //   lastSuccess : 가장 최근 성공 빌드 → 배포된 이미지 태그(커밋)와 비교해 "배포 대기"를 판단
  // 커밋 상태를 한꺼번에 부르면 Gitea 가 몰려서 느리다(7 저장소 × 10 커밋 동시 호출에 ~55초).
  // 그래서 저장소마다 최신 커밋부터 하나씩 보다가 latestBuild·lastSuccess 를 찾으면 멈춘다 — 보통 저장소당 2번.
  // 10초 캐시, 동시 요청은 하나로 합친다. 실시간 변화는 'ci:build' 소켓으로 보완.
  // 캐시가 오래됐으면 직전 값을 바로 돌려주고 뒤에서 새로 고친다(stale-while-revalidate). 첫 호출만 기다린다(~5초).
  async listBuildSummaries(owner = 'myorg', perRepo = 10) {
    const now = Date.now();
    if (this.summaryCache && now - this.summaryCache.at < SUMMARY_CACHE_MS) return this.summaryCache.data;
    const refresh = this._refreshBuildSummaries(owner, perRepo);
    if (this.summaryCache) {
      refresh.catch(() => {});
      return this.summaryCache.data;
    }
    return refresh;
  }

  // 빌드 상태가 바뀌면(status 웹훅) 다음 조회 때 새로 고치게 한다
  invalidateBuildSummaries() {
    if (this.summaryCache) this.summaryCache.at = 0;
  }

  _refreshBuildSummaries(owner, perRepo) {
    if (this.summaryInFlight) return this.summaryInFlight;
    this.summaryInFlight = (async () => {
      const repos = (await this.listRepos()).filter((r) => r.hasCi && r.owner?.login === owner);
      const data = await Promise.all(repos.map((r) => this._buildSummary(owner, r, perRepo)));
      data.sort((a, b) => a.repo.localeCompare(b.repo));
      this.summaryCache = { at: Date.now(), data };
      return data;
    })().finally(() => {
      this.summaryInFlight = null;
    });
    return this.summaryInFlight;
  }

  async _buildSummary(owner, r, perRepo) {
    const branch = r.default_branch || 'main';
    const out = { owner, repo: r.name, url: r.html_url, head: null, latestBuild: null, lastSuccess: null };
    try {
      const commits = await this._request(
        `/api/v1/repos/${owner}/${r.name}/commits?sha=${encodeURIComponent(branch)}&limit=${perRepo}&stat=false&verification=false&files=false`,
      );
      for (const commit of commits) {
        const combined = await this._request(`/api/v1/repos/${owner}/${r.name}/commits/${commit.sha}/status`).catch(() => null);
        const status = (combined?.statuses ?? []).find((s) => s.context === CI_CONTEXT) ?? null;
        const build = toBuild({ owner, repo: r.name, branch, sha: commit.sha, message: commit.commit?.message, committedAt: commit.commit?.author?.date, status });
        if (!out.head) out.head = build;
        if (!out.latestBuild && build.status !== 'none') out.latestBuild = build;
        if (build.status === 'success') {
          out.lastSuccess = build;
          break;
        }
      }
    } catch (err) {
      out.error = err.message;
    }
    return out;
  }

  // Gitea status 웹훅 payload → 빌드 1건. jenkins/* 가 아닌 상태는 null.
  buildFromStatusEvent(payload) {
    if (!payload?.context?.startsWith('jenkins/')) return null;
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;
    if (!owner || !repo || !payload.sha) return null;
    return toBuild({
      owner,
      repo,
      branch: payload.branches?.[0]?.name ?? null,
      sha: payload.sha,
      message: payload.commit?.message,
      committedAt: payload.commit?.timestamp,
      status: {
        state: payload.state,
        description: payload.description,
        target_url: payload.target_url,
        updated_at: payload.updated_at,
        created_at: payload.created_at,
      },
    });
  }

  // 웹훅 이벤트: push(대시보드 push 피드) + status(Jenkins 빌드 결과). 예전에 push 만 등록된 훅은 status 를 더한다.
  async createWebhookIfMissing(owner, repo, webhookUrl) {
    const events = ['push', 'status'];
    const hooks = await this._request(`/api/v1/repos/${owner}/${repo}/hooks`);
    const existing = hooks.find((hook) => hook.config?.url === webhookUrl);
    if (existing) {
      if (events.every((e) => existing.events?.includes(e))) return null;
      return this._request(`/api/v1/repos/${owner}/${repo}/hooks/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: true, events: Array.from(new Set([...(existing.events ?? []), ...events])) }),
      });
    }
    return this._request(`/api/v1/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'gitea',
        active: true,
        events,
        config: { url: webhookUrl, content_type: 'json' },
      }),
    });
  }

  // push 이벤트 요약 (대시보드 push 피드·감사 로그용). 빌드 트리거는 Jenkins 가 자기 웹훅으로 받는다.
  handlePushEvent(payload) {
    return {
      repo: payload.repository?.full_name,
      ref: payload.ref,
      commits: (payload.commits || []).map((commit) => commit.id),
    };
  }
}

module.exports = new GiteaService();
