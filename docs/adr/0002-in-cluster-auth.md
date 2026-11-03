# ADR-002. 실행 환경 및 인증 방식: in-cluster ServiceAccount

- **Status**: 확정 — `infra/k8s-manager` Pod로 in-cluster 실행 중
- **이전 Status**: 대기 중

## Context

관리 서버(Node.js)가 kube-apiserver/metrics-server에 접근해야 함. 클러스터 안에서 도는지 밖에서 도는지에 따라 인증 방식이 달라짐.

## 선택지

1. K8s 클러스터 내부 Pod로 실행 → in-cluster 인증(ServiceAccount 토큰), kubeconfig 불필요
2. 클러스터 외부(로컬/관리머신) 실행 → kubeconfig 파일 기반 인증, RBAC 별도 구성 필요

## Decision

1번. 구성도상 wk-01 내부에서 도는 컨테이너로 확정.

## Consequences

- `services/k8sService.cjs`는 `KubeConfig.loadFromCluster()` 사용.
- RBAC은 `metrics.k8s.io` 리소스(`pods`, `nodes`)에 대한 `get/list` 권한을 포함해야 함(`k8s/templates/rbac.yaml`).
- **k8s_manager는 모든 namespace를 모니터링해야 하므로, 조회(get/list/watch) 권한은 namespace 범위 `Role`이 아니라 `ClusterRole`+`ClusterRoleBinding`으로 부여한다.** NetworkPolicy 쓰기(생성/수정/삭제)는 [0014](0014-rbac-networkpolicy-scope.md)가 아직 대기 중이라 별도의 namespace 범위 `Role`(`k8s-manager-write`)로 한정해둠 — 조회와 쓰기의 권한 범위를 분리한 것.
- 관련: [0001](0001-monitoring-scope-pod-vs-host.md), [0014](0014-rbac-networkpolicy-scope.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- `infra` namespace의 `k8s-manager` Deployment로 실제 운영 중이며, `loadFromCluster()` 기반으로 동작한다.
- NetworkPolicy 쓰기 권한 범위는 여전히 [0014](0014-rbac-networkpolicy-scope.md)의 결정에 따른다.
