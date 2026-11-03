# ADR-035. 대용량 모델 운영 방식

- **Status**: 대기 중

## Context

모델 사이즈가 클 경우 배포/연동 시간이 오래 걸린다. 사전 로딩, 캐싱, 이미지 최적화 등 운영 방식이 아직 결정되지 않았다.

## Decision

미정 — 대기 중.

## Consequences

- `services/mirror`의 OCI 이미지 반입(`importOciImage`) 흐름에 사전 로딩/캐싱 단계가 추가될 수 있음.
- 관련: [0025](0025-model-data-license-review.md), [0029](0029-helm-chart-deployment-strategy.md)
