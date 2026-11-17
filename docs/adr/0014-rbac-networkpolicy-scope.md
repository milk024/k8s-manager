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
  - `rag-system`: `rag-dev-sa` 5명 / `vkey-system`: `vkey-dev-sa` 2명 / 관리자 `super`(kubeadm `kubernetes-admin` 인증서 공유) 2명 + 개별 관리자 SA 1명
  - 2026-11-05: dev5를 관리자로 승격. 공유 SA(`rag-dev-sa`)에 권한을 주면 rag 개발자 전원이 관리자가 되고, `kubernetes-admin` 인증서는 개별 회수가 안 되므로 전용 SA `kube-system/dev5-admin` + ClusterRoleBinding `dev5-admin`(cluster-admin) + TokenRequest 토큰(1년 만료)으로 발급했다. 회수는 ClusterRoleBinding과 SA 삭제. 기존 dev5용 `rag-dev-sa` 토큰은 다른 개발자와 공유라 개별 폐기하지 않았다.
  - 남은 과제: 관리자 2명도 공유 인증서 대신 개인별 SA(또는 개인별 인증서)로 바꿔야 누가 무엇을 했는지 감사 로그에서 구분할 수 있다.
  - 권한: pods·logs·exec·portforward·services·configmaps·secrets·PVC·deployments·statefulsets·httproutes 등에 대한 get~delete
- **NetworkPolicy** (3건):
  - `envoy-gateway-system/rag-gateway-8080-restrict`, `vkey-gateway-8080-restrict`: 8080 포트 소스 IP 제한([0008](0008-network-exposure-scope.md))
  - `infra/gitea-postgresql`: Postgres 5432 ingress만 허용
- **미적용**: namespace 간 기본 차단(default-deny), Egress 제한, ResourceQuota/LimitRange, PriorityClass(시스템 기본 2개만 있음).
  - 영향: 한 서비스가 CPU·메모리를 과점하면 같은 노드의 다른 사업까지 영향을 받는다. DB Pod가 BestEffort라 메모리 압박 시 가장 먼저 축출될 수 있다.

## 현황 갱신 (2026-11-12)

- **개발자 RBAC 축소**: 배포가 ArgoCD(`myorg/deploy-rag`, `myorg/deploy-vkey`)로 넘어가서 `rag-dev-role`, `vkey-dev-role`에서 배포 목적 권한을 회수했다(terraform `rbac_dev_teams.tf`).
  - 남긴 권한: pods get·list·watch·delete(재시작용), pods/log 조회, pods/exec·portforward, services·configmaps·PVC·events·deployments·replicasets·statefulsets·httproutes 조회
  - 회수한 권한: 위 리소스의 생성·수정·삭제, secrets 접근 전체
  - 위 2026-11-03 "권한" 항목은 이 변경 전 기준이다.
- **ArgoCD 컨트롤러 권한: 축소 보류**
  - 현재: helm 차트 기본값. `argocd-application-controller`, `argocd-server`가 ClusterRoleBinding으로 클러스터 전체 권한을 갖는다.
  - 보류 이유: 관리 대상 네임스페이스·서비스가 늘어날 예정이다. 지금 네임스페이스 단위 Role로 좁히면 확장할 때마다 Role·RoleBinding과 ArgoCD 클러스터 설정(namespaces 목록)을 함께 고쳐야 한다.
  - 대신 AppProject로 범위를 제한한다.
    - `rag`: `deploy-rag` → `rag-system`만, 클러스터 리소스 불가
    - `vkey`: `deploy-vkey` → `vkey-system`만, 클러스터 리소스 불가
    - `infra`: `deploy-infra` → `infra`, 클러스터 리소스는 ClusterRole·ClusterRoleBinding만
  - 남은 위험: `default` AppProject가 모든 저장소·네임스페이스·클러스터 리소스를 허용한다. Application을 만들 수 있는 사람(argocd 네임스페이스 쓰기 권한, ArgoCD admin)은 이를 통해 클러스터 전체에 배포할 수 있다.
  - 재검토 시점: 서비스 확장이 끝나 네임스페이스 목록이 안정되었을 때, 또는 ArgoCD UI를 외부(Gateway)로 노출할 때.
- **dev5-admin 폐기 (2026-11-12)**: 2026-11-05에 발급한 개인 cluster-admin SA `kube-system/dev5-admin`은 dev5 환경에서 끝내 동작하지 않아 폐기했다.
  - terraform 코드는 되돌렸다(`terraform_infra` 9bde08a, c37cfcc revert).
  - 클러스터의 SA·ClusterRoleBinding은 kubectl로 만든 것이라 직접 삭제한다.
  - 관리자 개인 계정 전환 과제(위 "남은 과제")는 그대로 남는다.
