# ADR-032. vLLM Replica 스케줄링 및 분산 처리 범위

- **Status**: 확정 — KServe LLMInferenceService(llm-d) 2 Replica로 운영 중
- **이전 Status**: 부분 확정

## Context

vLLM Pod를 K8s 상에서 Replica 단위로 스케줄링하는 것이 가능한지, 그리고 멀티 노드 분산 추론(분산 처리)까지 지원할지 검토했다.

## Decision

- Replica 단위 스케줄링(단일 노드 내 여러 vLLM Pod)은 K8s 기본 기능으로 지원 가능 — 확정. KServe(Gemma)도 이 Replica 스케줄링 방식으로 vLLM GPU 배분 3장 안에서 함께 처리([0040](0040-single-server-hardware-spec.md)).
- 멀티 노드 분산 추론(분산 처리)은 **이번 프로젝트 범위에서 제외**, 별도 검토 대상으로 분리.
- 실제 배포용 세부 가이드라인(Helm values의 replica 수, GPU 리소스 request/limit 등)은 추후 별도로 제공될 예정 — 수신 시 `llm-inference` Helm Chart(별도 저장소/범위)에 반영.

## Consequences

- `llm-inference` namespace의 vLLM 배포는 단일 노드 내 Replica 확장까지만 이번 범위에 포함.
- `k8s_manager`는 GPU를 직접 다루지 않으므로, 가이드라인 수신 후에도 이 저장소의 코드 변경은 없음 — `services/monitor`가 이미 namespace-agnostic하게 Prometheus GPU 메트릭(`DCGM_FI_DEV_GPU_UTIL`)을 조회하므로 `llm-inference` namespace가 실제로 배포되면 그대로 모니터링 대상에 포함됨.
- 관련: [0038](0038-namespace-deployment-phasing.md)(Phase 4 llm-inference 보류), [0040](0040-single-server-hardware-spec.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 실제 배포: `llm-serving` namespace(원 계획의 `llm-inference` 아님)에 `gemma-4-12b-it-kserve` 2 Replica가 GPU 1장씩 사용한다. 앞단에서 `llm-d-inference-scheduler`가 요청을 분배한다.
  - 이미지: `ghcr.io/llm-d/llm-d-cuda:v0.8.1`, scheduler `v0.8.0`
  - vLLM 옵션: `--max-model-len 100000`, `--gpu-memory-utilization 0.90`, prefix caching 사용
- 외부 진입점은 Envoy AI Gateway `llm-serving/ai-gateway`(10.0.0.22)다([0034](0034-litellm-proxy-role.md)).
- GPU 배분은 원 계획(vLLM 3 + RAG 1)과 다르다. 실제로는 vLLM 2 + rag-server 1 + 예비 1이다([0040](0040-single-server-hardware-spec.md)).
- 멀티노드 분산 추론은 여전히 범위 밖이다. 노드 장애 대비 Replica 분산은 [0045](0045-multinode-transition-rto-rpo.md)에서 다룬다.
