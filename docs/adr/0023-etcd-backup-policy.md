# ADR-023. etcd 백업/스냅샷 정책

- **Status**: 대기 중 — 목표치만 수립
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #18". cp-01의 etcd 백업/스냅샷 정책이 아직 정해지지 않음.

## Decision

미정 — 대기 중.

## Consequences

- 관련: [0016](0016-backup-recovery-policy.md), [0022](0022-control-plane-spof-risk.md), [0027](0027-disaster-recovery-plan.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- etcd 스냅샷 CronJob은 없다.
- [0045](0045-multinode-transition-rto-rpo.md)의 목표: 전환 작업 중에는 각 단계 직전 스냅샷을 오프사이트에 보관한다. 전환 후에는 시간당 스냅샷을 찍는다(RPO 1시간).
