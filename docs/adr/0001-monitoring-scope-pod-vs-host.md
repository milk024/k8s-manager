# ADR-001. 리소스 모니터링 대상: 호스트 레벨 대신 Pod 레벨

- **Status**: 확정 — metrics-server 배포 완료, GPU는 DCGM으로 별도 수집
- **이전 Status**: 대기 중

## Context

GPU 모니터링에 이어 CPU/메모리(DIMM) 사용량도 보여주고 싶다는 요구가 있었음. 처음에는 `systeminformation` 패키지로 호스트의 물리 DIMM 슬롯 정보(`si.memLayout()`, dmidecode 기반)까지 보여주는 안을 검토함.

## 선택지

1. 호스트 레벨 — DIMM 슬롯별 상세 정보 (dmidecode 필요, privileged 권한/hostPath 마운트 필요)
2. Pod 레벨 — namespace별 Pod의 CPU/메모리 사용량 (Kubernetes Metrics API)

## Decision

2번. GUI 대시보드가 "namespace별 Pod 안에서의 사용량"을 보여주는 용도이므로, 호스트 물리 슬롯 정보는 불필요하고 권한 문제도 없는 Metrics API 방식을 채택.

## Consequences

- `systeminformation` 불필요. `@kubernetes/client-node`의 `Metrics` 클라이언트(`getPodMetrics(namespace)`)만으로 충분.
- 단, 클러스터에 **metrics-server가 배포되어 있어야 함**(현재 미배포, 서버 모듈은 배포되어 있다는 전제로 개발 진행). 관련: [0002](0002-in-cluster-auth.md)
- **모니터링 기본 범위는 특정 namespace가 아니라 클러스터 전체**다 — `k8s_manager`는 특정 서비스가 아니라 모든 namespace/Pod의 하드웨어 사용률을 봐야 하므로, `namespace` 파라미터를 안 주면 `services/k8sService.getPodMetrics()`가 `metrics.k8s.io`의 전체 조회 경로(`/apis/metrics.k8s.io/v1beta1/pods`, namespace 세그먼트 없음)를 탄다. 이에 맞춰 RBAC도 조회 권한은 `ClusterRole`/`ClusterRoleBinding`으로 구성함(`k8s/templates/rbac.yaml`, [0002](0002-in-cluster-auth.md) 참고).

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- `kube-system/metrics-server`가 배포되어 동작 중이다. Consequences의 "현재 미배포" 전제는 해소됐다.
- GPU 사용률은 Metrics API가 아니라 Prometheus + dcgm-exporter(`DCGM_FI_DEV_GPU_UTIL`)로 수집한다. L40S 4장 모두 수집된다([0041](0041-simple-git-child-process-integration-discarded.md)).
