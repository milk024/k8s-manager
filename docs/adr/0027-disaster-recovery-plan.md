# ADR-027. 재해복구(DR) 계획

- **Status**: 대기 중 — 서비스 등급·RTO/RPO 목표 수립
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #23". 재해복구(DR) 계획이 아직 수립되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- 관련: [0016](0016-backup-recovery-policy.md), [0022](0022-control-plane-spof-risk.md), [0023](0023-etcd-backup-policy.md), [0024](0024-pv-storage-redundancy.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 서비스 등급(Tier 1~3)과 RTO/RPO 목표는 [0045](0045-multinode-transition-rto-rpo.md)에서 정했다. 백업 자동화([0016](0016-backup-recovery-policy.md), [0023](0023-etcd-backup-policy.md))와 복구 리허설 전까지 이 수치는 목표이며 보장값이 아니다.
