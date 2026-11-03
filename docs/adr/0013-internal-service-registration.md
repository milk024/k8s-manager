# ADR-013. 내부 서비스 등록

- **Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #8". 관리서버가 조회/관리해야 할 "내부 서비스" 목록과 등록 절차가 아직 정의되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- `services/k8s/workload.cjs`가 다뤄야 할 대상 범위(어떤 Deployment/Service까지 관리 대상인지)를 이 결정 없이는 확정할 수 없음.
