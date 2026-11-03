# ADR-022. Control Plane/Worker 단일 구성 SPOF 리스크 인지

- **Status**: 인지·대응 계획 수립 — 멀티노드 전환 계획([0045](0045-multinode-transition-rto-rpo.md))으로 이관
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #17". 현재 cp-01(Control Plane) 단일 구성이라 SPOF(단일 장애점) 리스크가 있음을 인지해야 함 — 별도 이중화 여부는 아직 결정되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- cp-01 장애 시 `services/k8s/client.cjs`가 kube-apiserver에 접근 못 하는 상황에 대한 재시도/알림 로직이 필요한지 여부가 이 결정에 좌우됨.
- 관련: [0023](0023-etcd-backup-policy.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 실제 구성은 노드 1대(`super`)가 Control Plane, Worker, NFS 서버를 모두 맡는 단일 노드 kubeadm 클러스터다. "cp-01/wk-01 분리"를 전제한 원 문서보다 SPOF 범위가 더 넓다.
- 2026-10-11 NFS 장애로 실제로 확인됐다. NFS 서버 프로세스 하나가 멈추자 PVC를 쓰는 모든 서비스(vkey API, rag DB, Gitea, Prometheus)가 동시에 멈췄다.
- 해소 방안은 [0045](0045-multinode-transition-rto-rpo.md)의 멀티노드 전환(CP 분리, Worker 추가)으로 다룬다.
