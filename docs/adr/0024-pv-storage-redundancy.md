# ADR-024. Persistent Volume/스토리지 이중화 방안

- **Status**: 대기 중 — 단일 노드 loopback NFS 구성 확인, 이중화 없음
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #20". Gitea, Package Mirror Registry, RDBMS/Vector DB 등이 쓰는 PV가 단일 노드 로컬 스토리지인지, 이중화(복제) 방안이 있는지 아직 결정되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- `services/gitea`, `services/mirror`의 데이터 유실 위험도가 이 결정에 좌우됨.
- 관련: [0016](0016-backup-recovery-policy.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 현재 구성: `nfs-csi`(default StorageClass) → 같은 노드의 NFS 서버(`10.0.0.20:/data/nfs`, nvme0n1p1 7.6TB)를 루프백으로 마운트한다.
- PVC 10개, 총 1,419 GiB. 복제나 스냅샷은 없다. 디스크 1개와 NFS 프로세스 1개가 모든 상태 저장 서비스의 단일 장애점이다.
- 2026-10-11 장애로 위험이 실제로 드러났다([0043](0043-os-auto-update-disabled.md)). 이중화 방식은 멀티노드 전환([0045](0045-multinode-transition-rto-rpo.md))과 함께 결정한다.
