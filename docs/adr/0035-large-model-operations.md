# ADR-035. 대용량 모델 운영 방식

- **Status**: 확정 — LLM 가중치는 PVC, RAG 모델은 베이스 이미지에 포함
- **이전 Status**: 대기 중

## Context

모델 사이즈가 클 경우 배포/연동 시간이 오래 걸린다. 사전 로딩, 캐싱, 이미지 최적화 등 운영 방식이 아직 결정되지 않았다.

## Decision

미정 — 대기 중.

## Consequences

- `services/mirror`의 OCI 이미지 반입(`importOciImage`) 흐름에 사전 로딩/캐싱 단계가 추가될 수 있음.
- 관련: [0025](0025-model-data-license-review.md), [0029](0029-helm-chart-deployment-strategy.md)

## 현황 갱신 (2026-11-05)

- **LLM(Gemma 4 12B)**: 가중치는 `llm-serving/gemma-model-pvc`(50Gi, nfs-csi)에 두고 KServe가 로딩한다. 이미지에 넣지 않는다.
- **RAG 모델(임베딩·리랭커·OCR)**: `rag-model-base` 베이스 이미지(약 20GB)에 포함한다. 빌드는 서버에서 한다([0049](0049-rag-model-base-image.md)). 모델을 PVC로 옮기고 이미지에는 런타임만 남기는 안이 [0048](0048-model-weights-on-pvc.md)에서 제안 중이다.
- 기준: 서비스 간에 공유하거나 수십 GB인 LLM 가중치는 PVC에 둔다. 서비스 하나가 쓰고 버전을 코드와 같이 묶어야 하는 RAG 모델은 이미지에 넣는다.
