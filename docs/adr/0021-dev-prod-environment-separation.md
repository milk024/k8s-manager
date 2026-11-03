# ADR-021. 개발/운영 환경 분리 여부

- **Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #16". 개발 환경과 운영 환경을 분리할지(별도 namespace/클러스터) 아직 결정되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- 분리하기로 하면 `config/index.cjs`의 환경별 설정 분기(개발/운영 kubeconfig, 도메인 등)가 추가로 필요함.
