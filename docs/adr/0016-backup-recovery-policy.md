# ADR-016. 데이터 백업 및 복구 정책(설계)

- **Status**: 대기 중 — 목표치는 수립([0045](0045-multinode-transition-rto-rpo.md)), 백업 자동화는 미구현
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #11". 데이터(RDBMS, Vector DB, Gitea 레포, Registry 이미지 등) 백업/복구 정책이 아직 설계되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- 관련: [0023](0023-etcd-backup-policy.md), [0024](0024-pv-storage-redundancy.md), [0027](0027-disaster-recovery-plan.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 현재 백업 CronJob은 0건이다. etcd 스냅샷, Postgres 덤프, Gitea dump 모두 자동화되어 있지 않다.
- 2026-10-11 NFS 장애([0043](0043-os-auto-update-disabled.md)) 때 rag-postgres, gitea-postgresql이 강제 중단됐다. WAL 재생으로 데이터 손실 없이 복구됐지만, 백업이 아니라 운이 좋았던 결과다.
- 서비스별 RTO/RPO 목표치는 [0045](0045-multinode-transition-rto-rpo.md)에서 정했다. 이 ADR은 그 목표를 만족하는 백업 방식(도구·주기·보관 위치)을 결정하는 용도로 남긴다.
