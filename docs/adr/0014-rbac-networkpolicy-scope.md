# ADR-014. 내부 RBAC, Ingress & Egress, Network Policy 판단

- **Status**: 부분 확정 — 개발자 RBAC, 8080·DB NetworkPolicy 적용 / ResourceQuota 미적용
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #9". 클러스터 전체의 RBAC 정책, namespace 간 Ingress/Egress 허용 범위, NetworkPolicy 설계 방향이 아직 결정되지 않음. [0002](0002-in-cluster-auth.md)는 관리서버 자신의 ServiceAccount 인증 방식만 다루며, 이 항목은 클러스터 전체 거버넌스 차원의 더 넓은 결정임.

## Decision

미정 — 대기 중.

## Consequences

- `services/k8s/networkPolicy.cjs`가 생성/수정할 수 있는 정책의 허용 범위(어디까지 관리서버가 자동으로 바꿀 수 있는지)가 이 결정에 좌우됨.
- 관련: [0002](0002-in-cluster-auth.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- **RBAC**: 개발자 8명에게 서비스 namespace 범위 Role을 발급했다(`K8s 계정 관리 대장` 기준).
  - `rag-system`: `rag-dev-sa` 6명 / `vkey-system`: `vkey-dev-sa` 2명 / 관리자 `super` 2명
  - 권한: pods·logs·exec·portforward·services·configmaps·secrets·PVC·deployments·statefulsets·httproutes 등에 대한 get~delete
- **NetworkPolicy** (3건):
  - `envoy-gateway-system/rag-gateway-8080-restrict`, `vkey-gateway-8080-restrict`: 8080 포트 소스 IP 제한([0008](0008-network-exposure-scope.md))
  - `infra/gitea-postgresql`: Postgres 5432 ingress만 허용
- **미적용**: namespace 간 기본 차단(default-deny), Egress 제한, ResourceQuota/LimitRange, PriorityClass(시스템 기본 2개만 있음).
  - 영향: 한 서비스가 CPU·메모리를 과점하면 같은 노드의 다른 사업까지 영향을 받는다. DB Pod가 BestEffort라 메모리 압박 시 가장 먼저 축출될 수 있다.
