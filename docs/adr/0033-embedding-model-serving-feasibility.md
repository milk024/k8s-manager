# ADR-033. 임베딩(EMB) 모델 서빙 가능 여부

- **Status**: 부분 확인 — 별도 임베딩 서빙 없음, rag-server가 GPU 1장 사용
- **이전 Status**: 조사 필요

## Context

vLLM/K8s 환경에서 임베딩 모델 서빙이 가능한지 아직 확인되지 않았다.

## Decision

미정 — 조사 필요.

## Consequences

- `rag-system` namespace의 임베딩 서버(services/monitor가 모니터링 대상으로 다룰 수 있는 Pod) 설계가 이 조사 결과에 좌우됨.
- 관련: [0034](0034-litellm-proxy-role.md), [0038](0038-namespace-deployment-phasing.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 클러스터에 별도 임베딩 서빙 Pod는 없다. `rag-server`가 GPU 1장(`nvidia.com/gpu: 1`)을 할당받아 질의 임베딩을 처리한다. 문서 벡터는 미리 적재되어 있고 질의문만 임베딩한다.
- vLLM으로 임베딩 모델을 분리 서빙할지는 RAG 동시 사용자 증가 추이를 보고 재검토한다.
