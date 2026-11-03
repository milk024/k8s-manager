# ADR-041. simple-git / child_process(GPU·npm·pip·helm) 연동 항목 폐기

- **Status**: 확정 (폐기) — helm 자동배포는 Gitea Actions deploy job으로 해결
- **이전 Status**: 확정 (폐기, helm 자동배포만 후순위 보류)

## Context

체크리스트 2-3의 "simple-git | child_process(GPU·npm·pip·helm) 연동"이 미구현 상태로 남아있어서, 실제로 필요한지 대상별로 재검토했다.

## Decision

대상별로 아래와 같이 정리한다.

| 대상 | 결정 | 이유 |
|---|---|---|
| GPU (child_process) | **폐기** | 이미 Prometheus + dcgm-exporter 방식으로 구현됨(`services/prometheusService.getGpuUtilization`, [0001](0001-monitoring-scope-pod-vs-host.md)). child_process로 다시 만들면 중복. |
| Git (simple-git) | **폐기** | Gitea Actions Runner([0042](0042-cicd-runner-execution.md), 2-6 완료)가 체크아웃·빌드를 자기 컨테이너 안에서 직접 처리하므로 `k8s_manager`가 git 작업을 대신할 이유가 없어짐. |
| npm/pip (child_process) | **폐기(방향 전환)** | 실제 구현 시 셸에서 `npm`/`pip` 커맨드를 돌리는 대신, `services/giteaService.cjs`와 같은 패턴으로 Gitea Package Registry REST API를 호출하는 방식으로 대체. |
| helm (child_process) | **보류(후순위)** | "CI 빌드 후 `k8s_manager`가 자동으로 `helm upgrade`까지 실행"하는 자동배포 기능은 필요성 자체는 인정되나 지금 우선순위가 아님 — 별도 항목으로 남겨두고 나중에 착수. |

## Consequences

- 체크리스트 2-3의 이 항목은 종료 처리. `services/mirrorService.cjs`를 실제로 구현할 때는 REST API 방식을 기본으로 한다.
- 자동배포(helm) 기능은 별도로 필요해지면 새 ADR로 다시 다룬다 — `core/routers`에 `deployRouter.cjs`류를 추가하고 `services/k8sService.cjs`가 아니라 별도 `services/helmService.cjs`(child_process로 `helm upgrade` 실행, 또는 Helm SDK 대응 라이브러리 검토)를 만드는 방향이 유력.
- 관련: [0001](0001-monitoring-scope-pod-vs-host.md), [0028](0028-ssh-code-server-access-and-sync.md), [0036](0036-container-registry-selection.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 보류했던 "빌드 후 자동 배포"는 `k8s_manager`의 child_process가 아니라 각 서비스 저장소의 Gitea Actions deploy job으로 구현됐다.
  - 2026-08-12 ~ 10-27 기준 deploy job 269회, 성공 251회(93%), push → 배포 완료 중앙값 38초.
- 따라서 `services/helmService.cjs`는 만들지 않는다.
