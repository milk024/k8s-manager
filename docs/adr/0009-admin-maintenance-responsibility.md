# ADR-009. 관리자 및 유지보수 권한에 대한 책임 소재

- **Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #1". 관리자(운영자) 권한과 유지보수 권한을 누가 갖는지(내부 담당자 vs 외주업체) 책임 소재가 아직 판단되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- `middleware/auth.cjs`의 RBAC 역할(누가 어떤 API를 호출 가능한지) 설계가 이 결정에 좌우됨.
- 관련: [0002](0002-in-cluster-auth.md)
