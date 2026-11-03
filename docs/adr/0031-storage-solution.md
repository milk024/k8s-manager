# ADR-031. 스토리지 솔루션 및 용량 계획

- **Status**: 부분 확정 — nfs-csi(loopback NFS) 운영 중, PVC 10개·1,419GiB 사용
- **이전 Status**: 부분 확정 (StorageClass 확인됨, 용량 계획 미정)

## Context

모델 파일, 로그, 캐시 등을 위한 스토리지 방식(PV/PVC, StorageClass)이 필요하다. `kubectl get storageclass` 확인 결과 `nfs-csi`가 default StorageClass로 이미 구성되어 있음을 확인했다.

## Decision

StorageClass는 `nfs-csi`(default)를 사용하는 것으로 확정. 단, 서비스별 PVC 용량 계획(모델 파일 크기, 로그 보존 기간, 캐시 크기)은 아직 미정.

## Consequences

- `k8s_manager`이 관리하는 Gitea/Registry용 PVC를 추가할 경우 `nfs-csi`를 `storageClassName`으로 사용.
- 실제 용량 값이 정해지면 `k8s/pvc.yaml`(신규)로 반영.
- 관련: [0016](0016-backup-recovery-policy.md), [0024](0024-pv-storage-redundancy.md), [0029](0029-helm-chart-deployment-strategy.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- NFS 백엔드는 같은 노드의 `/data/nfs`(nvme0n1p1, 7.6TB)다. OS 디스크는 별도의 HighPoint NVMe RAID(`/dev/hptblock0n0p4`)다.
- 단일 NFS 프로세스 의존은 2026-10-11 장애의 직접 원인이었다([0043](0043-os-auto-update-disabled.md), [0024](0024-pv-storage-redundancy.md)).
