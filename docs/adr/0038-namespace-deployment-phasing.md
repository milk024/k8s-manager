# ADR-038. Namespace 생성 및 배포 Phase 순서

- **Status**: 완료 — Phase 1~7 배포 완료 (namespace명 `llm-inference` → `llm-serving`)
- **이전 Status**: 확정 (Phase 4는 보류)

## Context

배포 순서를 Phase로 나눠 검토했다. `llm-inference`(vLLM) 관련 배포 방식이 아직 미정([0032](0032-vllm-replica-scheduling-scope.md), [0033](0033-embedding-model-serving-feasibility.md), [0034](0034-litellm-proxy-role.md))이라, 이 결정이 다른 Phase를 막는지 확인했다.

## Decision

| Phase | 내용 | 상태 | 이유 |
|---|---|---|---|
| 1 | Namespace 생성 (`infra`, `vkey-system`, `rag-system`) | 진행 가능 | `llm-inference`만 영향받음 |
| 2 | `infra` 구성 (Gitea 등) | 진행 가능 | vLLM 결정과 무관 |
| 3 | `vkey-system` 구성 | 진행 가능 | 무관 |
| 4 | `llm-inference` 구성 (vLLM) | ⏸ 보류 | 가이드라인 대기 |
| 5 | `rag-system` 구성 | 부분 영향 | GPU 수량 — 아래 참고 |
| 6, 7 | Gateway & 외부 반입 정책 | 진행 가능 | 무관 |

`llm-inference` namespace는 이름만 미리 만들어두거나 나중으로 미뤄도 무방.

## Phase 5(rag-system) 참고 사항 (해결됨)

당초 "GPU 4장 중 1장은 KServe Gemma가 별도로 사용 중"이라는 전제로 "vLLM 3대 병행" 시 `1 KServe + 3 vLLM + 1 rag-server = 5장` 필요해 GPU가 부족해질 수 있다고 우려했었다. 확인 결과 **KServe는 vLLM 3장 배분 안에 포함**되는 것으로 정리되어([0040](0040-single-server-hardware-spec.md)), 실제 필요량은 `vLLM(KServe 포함) 3장 + rag-server 1장 = 4장`으로 현재 GPU 4장과 정확히 일치한다. GPU 부족 리스크 없음.

## Consequences

- `services/k8s`가 다루는 namespace 목록에 `llm-inference`를 당장 포함하지 않아도 됨 — 나머지 3개(`infra`, `vkey-system`, `rag-system`) 기준으로 우선 진행.
- GPU 배분은 확정되었으나(위 참고), `llm-inference`의 실제 배포는 여전히 vLLM Replica 스케줄링 가이드라인 제공 전까지 보류.
- 관련: [0032](0032-vllm-replica-scheduling-scope.md), [0013](0013-internal-service-registration.md), [0040](0040-single-server-hardware-spec.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 현재 namespace 17개. 서비스 namespace는 `infra`, `vkey-system`, `rag-system`, `llm-serving`, `kserve`, `monitoring`이다.
- Phase 4(vLLM)는 `llm-inference`가 아니라 `llm-serving`으로 배포됐다([0032](0032-vllm-replica-scheduling-scope.md)).
