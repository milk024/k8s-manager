# ADR-020. 로그/모니터링 체계(설계)

- **Status**: 부분 확정 — kube-prometheus-stack + DCGM 운영, 알림·로그 수집은 미구성
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #15". 전체 시스템의 로그 수집·모니터링 체계가 아직 설계되지 않음. `services/monitor`([0001](0001-monitoring-scope-pod-vs-host.md))는 Pod 리소스 사용량만 다루며, 애플리케이션 로그/이벤트 로그의 중앙 수집 체계는 별개 사안임.

## Decision

미정 — 대기 중.

## Consequences

- `middleware/audit.cjs`(반입 이력·버전·해시 감사 로그)의 저장/조회 방식이 이 결정에 좌우됨.
- 관련: [0001](0001-monitoring-scope-pod-vs-host.md), [0017](0017-incident-response-sla.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- **구성됨**: `monitoring` namespace에 kube-prometheus-stack(Prometheus, Alertmanager, node-exporter, kube-state-metrics), `gpu-operator`의 dcgm-exporter. 대시보드는 `infra/monitoring-web` + `k8s-manager`.
- **미구성**:
  - Alertmanager receiver가 `null`이다. 알림이 어디로도 가지 않는다.
  - Prometheus 저장소가 nfs-csi(같은 노드의 NFS)에 있다. NFS 장애 시 모니터링도 같이 멈춘다.
  - vLLM 메트릭(ServiceMonitor) 미수집. 큐 길이, KV 캐시 사용률, TTFT를 볼 수 없다.
  - 중앙 로그 수집(Loki 등) 없음.
- 우선순위: ① Alertmanager receiver 연결 → ② Prometheus를 NFS 밖 로컬 볼륨으로 이전 → ③ vLLM ServiceMonitor → ④ 로그 수집.

## 현황 갱신 (2026-11-05)

- 2026-11-05 재확인: Alertmanager receiver는 여전히 `null` 하나뿐이다. Prometheus 저장소도 여전히 nfs-csi(보존 10일)다. vLLM ServiceMonitor는 없다. 앞의 우선순위는 그대로다.
