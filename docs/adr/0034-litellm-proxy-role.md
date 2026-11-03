# ADR-034. LiteLLM Proxy 기능/역할 확인

- **Status**: 확정 — LiteLLM 미사용, Envoy AI Gateway가 역할 대체
- **이전 Status**: 조사 필요

## Context

현재 사용 중인 것으로 추정되는 LiteLLM Proxy 컴포넌트의 기능과 역할이 아직 확인되지 않았다.

## Decision

미정 — 조사 필요.

## Consequences

- LiteLLM Proxy가 vLLM 앞단의 라우팅/로드밸런싱 역할을 한다면, `services/monitor`가 vLLM Pod 대신 LiteLLM Proxy를 통해 사용량을 집계해야 할 수 있음 — 조사 결과에 따라 `services/monitor`, `services/k8s`의 대상 범위 재검토 필요.
- 관련: [0033](0033-embedding-model-serving-feasibility.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 클러스터에 LiteLLM Proxy는 없다. vLLM 앞단 라우팅은 Envoy AI Gateway(`envoy-ai-gateway-system`)와 `llm-d-inference-scheduler`가 맡는다.
- AI Gateway가 토큰 사용량을 메트릭으로 집계하므로 사용량 집계 용도로 LiteLLM을 둘 필요가 없다.
- 남은 이슈: AI Gateway 인증 정책(SecurityPolicy) 적용 검토 중([0008](0008-network-exposure-scope.md)).
