'use strict';

const config = require('../helpers/configHelper.cjs');
const socketService = require('./socketService.cjs');
const logHelper = require('../helpers/logHelper.cjs');

class GiteaService {
  constructor() {
    this.baseUrl = config.gitea.baseUrl;
    this.token = config.gitea.token;
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
  async listRepos() {
    const result = await this._request('/api/v1/repos/search?owner=myorg&limit=50');
    return result.data ?? [];
  }

  async getRepo(owner, repo) {
    return this._request(`/api/v1/repos/${owner}/${repo}`);
  }

  // ADR-0041: 빌드 실행은 Gitea Actions + Runner Pod가 전담, k8s_manager는 결과 조회만 담당.
  // /actions/tasks가 워크플로우 실행 단위(run)를 최신순으로 반환한다.
  async listActionRuns(owner, repo, limit = 10) {
    const result = await this._request(`/api/v1/repos/${owner}/${repo}/actions/tasks?limit=${limit}`);
    return result.workflow_runs ?? [];
  }

  async createWebhookIfMissing(owner, repo, webhookUrl) {
    const hooks = await this._request(`/api/v1/repos/${owner}/${repo}/hooks`);
    const exists = hooks.some((hook) => hook.config?.url === webhookUrl);
    if (exists) return null;
    return this._request(`/api/v1/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'gitea',
        active: true,
        events: ['push'],
        config: { url: webhookUrl, content_type: 'json' },
      }),
    });
  }

  // ADR-012, ADR-028: push 이벤트 수신 후 실제 CI/CD 트리거(빌드/배포) 로직은 대기 중 —
  // 현재는 이벤트 요약만 반환하고, 감사 로그·대시보드 알림까지만 연결한다.
  handlePushEvent(payload) {
    return {
      repo: payload.repository?.full_name,
      ref: payload.ref,
      commits: (payload.commits || []).map((commit) => commit.id),
    };
  }

  // Gitea Actions에는 "빌드 완료" 시점에 쏘는 웹훅이 없다(push뿐) — 그래서 push 웹훅을
  // 받은 시점부터 해당 커밋의 실행이 끝날 때까지만 짧게 폴링해서 상태 변화가 있을 때만
  // gitea:actions로 push한다. 상시 폴링이 아니라 push 트리거 후 한정된 시간(기본 2분)만.
  pollActionsUntilDone(owner, repo, sha, { intervalMs = 5000, maxAttempts = 24 } = {}) {
    let attempts = 0;
    let lastSnapshot = '';

    const tick = async () => {
      attempts += 1;
      let runs = [];
      try {
        const all = await this.listActionRuns(owner, repo, 20);
        runs = all.filter((run) => run.head_sha === sha);
        const snapshot = JSON.stringify(runs.map((run) => [run.id, run.status]));
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          socketService.emitDashboard('gitea:actions', { owner, repo, sha, runs });
        }
      } catch (err) {
        logHelper.warn('GiteaService', `빌드 상태 폴링 실패: ${err.message}`);
      }
      const allDone = runs.length > 0 && runs.every((run) => run.status === 'success' || run.status === 'failure');
      if (allDone || attempts >= maxAttempts) return;
      setTimeout(tick, intervalMs);
    };

    tick();
  }
}

module.exports = new GiteaService();
