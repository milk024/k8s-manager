# ADR-042. CI/CD 빌드 실행 방식 (Gitea Actions + Runner Pod)

- **Status**: 대체됨 — 빌드는 [0052](0052-jenkins-ci.md)(Jenkins, 2026-11-16), 배포는 [0051](0051-argocd-gitops-deployment.md)(ArgoCD). Runner 제거됨
- **이전 Status**: 확정

## Context

[0012](0012-local-git-vscode-server.md)에서 Gitea 연동 범위를 "레포 저장 + CI/CD 트리거"로
확정했다. 이제 그 트리거가 실제로 이미지 빌드를 어디서/어떻게 실행할지 결정이 필요했다.

## 선택지

1. `k8s_manager`(monitoring-server)가 Gitea Webhook을 받아 child_process로 직접
   `docker build`/`push` 실행
2. Gitea Actions + 별도 Runner Pod가 실행 (k8s_manager는 관여하지 않음)

## Decision

**옵션 2 채택**: Gitea Actions + Runner Pod

- Gitea Actions를 서버에서 활성화(`[actions] ENABLED = true`)
- `gitea/act_runner` 이미지 기반 Runner를 infra 네임스페이스에 별도 Pod로 배포
- 각 서비스 저장소에 `.gitea/workflows/build.yaml` 작성 (build → tag → push)
- `k8s_manager`는 빌드 실행에 관여하지 않고, 필요 시 Gitea Actions 결과를 조회/알림
  용도로만 소비 (감사 로그 연동은 후속 결정)
- **(추가 확정)** 결과 조회는 Gitea REST API `GET /repos/{owner}/{repo}/actions/tasks`를
  그대로 프록시하는 방식으로 구현한다 (`GiteaService.listActionRuns()` →
  `GET /api/gitea/repos/:owner/:repo/actions/runs`). 별도 상태 저장/폴링 없이 조회 시점에
  Gitea에 직접 질의만 하며, job/step 단위 로그 조회는 범위 밖(필요해지면 후속 ADR).

## Rationale

- 보안 격리: Docker 소켓/DinD 접근 권한을 Runner Pod에만 한정하고, K8s API 조회·
  NetworkPolicy 관리 권한을 가진 `k8s_manager`(monitoring-server)에는 부여하지 않는다.
  이는 [0002](0002-in-cluster-auth.md)·[0014](0014-rbac-networkpolicy-scope.md)에서
  정한 최소 권한 원칙과 일관된 방향이다.
- 동시성/큐잉을 직접 구현하지 않고 Gitea Actions의 기존 기능을 재사용한다.

## Consequences

- `services/giteaService.cjs`의 `handlePushEvent()`는 빌드를 트리거하는 책임을
  갖지 않는다 — Webhook은 감사 로그·대시보드 알림 용도로만 계속 사용 (기존 주석 유지).
- `package.json`의 `simple-git` 의존성은 CI/CD 빌드 트리거용이 아니라, 필요 시
  레포 메타데이터 조회 등 제한적 용도로만 검토한다. 사용처가 없다면 제거 검토.
- 신규 인프라 필요: Gitea Actions 활성화, Runner Pod Deployment, Runner 등록 토큰
  관리(Secret) — infra 네임스페이스 Phase 2에 작업 항목 추가.
- 서비스 저장소별 `.gitea/workflows/build.yaml` 작성은 각 서비스 개발자 또는
  Environment Developer가 템플릿을 제공하는 방식으로 진행 (개발 환경 가이드에 반영 필요).

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 적용 저장소: `k8s-manager`, `monitoring-web`, `rag-server`, `rag-web`, `vkey-server`, `vkey-web`
- 실적(2026-08-12 ~ 10-27, Gitea Actions 기록):
  - 파이프라인 304회, job 578건, deploy job 269회(성공 251회, 93%)
  - push → 배포 완료 중앙값 38초, p90 101초
  - 월별 job 실패율 8월 13.0% → 9월 3.4% → 10월 2.2%
- 빌드 결과는 `k8s_manager`가 `gitea:actions` socket 이벤트로 대시보드에 실시간 전달한다([0047](0047-realtime-socket-push.md)).
- 멀티노드 전환 시 Jenkins + Kaniko + ArgoCD로 바꾸는 계획이 있다([0045](0045-multinode-transition-rto-rpo.md)). 확정되면 이 ADR을 Superseded 처리한다.

## 현황 갱신 (2026-11-05)

- 2026-11-05 rag-server 빌드·배포(`f3736bf`)도 정상 수행됐다. 20GB 베이스 이미지 빌드도 서버에서 한다([0049](0049-rag-model-base-image.md)).
- **리스크**: Runner DinD의 `/var/lib/docker`가 노드 OS 디스크(HighPoint RAID, 881G 중 45% 사용)에 쌓인다. 이미지 120GB와 빌드 캐시 128GB가 있고, 그중 이미지 71GB와 빌드 캐시 56GB는 정리할 수 있다.
  - 조치 방향: 주기적 `docker builder prune --keep-storage`·`docker image prune`, 또는 DinD 저장소를 별도 볼륨으로 분리.

## 현황 갱신 (2026-11-12)

- 배포 단계를 ArgoCD GitOps로 바꿨다([0051](0051-argocd-gitops-deployment.md)). 6개 저장소 모두 CI는 빌드한 뒤 `ci/bump-deploy.sh`로 deploy 저장소의 이미지 태그만 커밋한다. CI에서 클러스터 자격 증명(`CD_KUBE_CONFIG_B64`)은 삭제했다.
- 빌드 실행(Gitea Actions + Runner)은 그대로다. Jenkins 전환은 보류한다.
- CI 계정을 `rag-ci`·`vkey-ci`·`infra-ci`로 나눴다([0050](0050-gitea-account-permission-split.md)).
