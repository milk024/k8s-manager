# ADR-049. RAG 모델(임베딩·리랭커·OCR)을 베이스 이미지에 포함하고 서버에서 빌드

- **Status**: 확정·운영 중 (2026-11-05, `rag-model-base:v5`, rag-server commit `f3736bf`) — 모델을 PVC로 옮기는 [0048](0048-model-weights-on-pvc.md)이 확정되면 Superseded

## Context

`rag-server`는 모델 세 종류를 쓴다.

| 모델 | 용도 | 크기 |
|---|---|---|
| `bge-m3` | 질의 임베딩 | 약 4.3GB |
| `bge-reranker-v2-m3` | 검색 결과 재정렬 | 약 2.2GB |
| PaddleOCR (`PP-OCRv5_server_det`, `PP-OCRv5_server_rec`, `korean_PP-OCRv5_mobile_rec`) | 문서 이미지 OCR | 약 98MB(PVC 캐시 기준), 179MB([0048](0048-model-weights-on-pvc.md) 기준) |

- 임베딩·리랭커 모델은 v1~v4 베이스 이미지(`rag-model-base`)에 이미 들어 있었다.
- OCR 모델은 이미지에 없었다. 그래서 첫 OCR 요청 때 외부(Baidu)에서 내려받아 `rag-storage-pvc`의 `ocr-cache` 하위 폴더(`/app/.cache/paddlex`)에 캐시했다. 이 때문에 첫 요청이 느렸고, 외부 다운로드에 의존했다.
- 베이스 이미지는 20GB가 넘는다(v4 21.5GB, v5 약 23.6GB). 개인 PC(Docker Desktop, WSL2 메모리 16GB + 스왑 8GB)에서 빌드해 push하면 반복해서 실패했다.
  - 사용자 관찰: 빌드 중 OOM
  - [0048](0048-model-weights-on-pvc.md)의 로그 분석: push 도중 Docker Desktop 네트워크 계층(vpnkit)이 끊김 (Gitea `500 context canceled`, 게이트웨이 `DC`)
  - 레지스트리 용량 문제는 아니다. NFS에 용량 제한이 없고 Gitea 패키지 설정도 무제한이다.
  - 두 원인 모두 PC 환경에서 생기므로, 빌드와 push를 서버로 옮기면 둘 다 피할 수 있다.

## 선택지

1. 모델을 PVC에 두고 마운트 (이미지는 약 6GB로 작아지지만, 모델 배포·버전 관리를 따로 해야 함 → [0048](0048-model-weights-on-pvc.md)에서 제안 중)
2. 모델을 전부 베이스 이미지에 포함하고, 빌드는 메모리가 충분한 서버에서 수행

당장 OCR 외부 다운로드와 PC 빌드 실패를 없애기 위해 2번을 먼저 적용했다. 1번은 PVC 구성과 `model-sync` Job이 준비되면 [0048](0048-model-weights-on-pvc.md)로 전환한다.

## Decision

**2번.**

- `rag-model-base:v5`에 PaddleOCR 런타임, 시스템 라이브러리(libGL 등), OCR 모델(`/app/models/paddlex`, 이미지 ENV `PADDLE_PDX_CACHE_HOME`)을 추가했다. 임베딩·리랭커 모델과 torch도 그대로 포함한다.
- 베이스 이미지는 개인 PC가 아니라 서버(Gitea Runner의 DinD, 노드 메모리 약 503GiB)에서 빌드해 레지스트리에 push한다.
- `rag-server`는 `FROM rag-model-base:v5`로 바꿨다. Dockerfile의 apt 설치, values의 `PADDLE_PDX_CACHE_HOME`, PVC `ocr-cache` 마운트는 제거했다.
- 베이스 이미지는 semver 태그(`v1`~`v5`)를 쓴다. 앱 이미지는 commit SHA 태그를 쓴다([0036](0036-container-registry-selection.md)).

## Consequences

- 첫 OCR 요청 때 외부에서 모델을 받지 않는다. Pod가 재시작돼도 캐시가 유지된다.
- `rag-storage-pvc`의 `ocr-cache` 폴더(97.4MB)는 새 Pod로 롤아웃이 끝난 뒤 삭제했다. 지금 이 PVC에는 `documents`, `images`만 있다.
- 모델을 바꾸려면 베이스 이미지를 새 태그(v6~)로 빌드하고 rag-server의 `FROM`을 올려야 한다. 모델 버전이 이미지 태그로 고정되므로 롤백도 태그만 되돌리면 된다.
- 이미지가 약 20GB라 노드에서 처음 pull할 때 시간이 걸린다. 멀티노드 전환 시 Harbor와 노드별 이미지 사전 pull이 필요하다([0045](0045-multinode-transition-rto-rpo.md)). 공유 스토리지에 모델을 두지 않아도 되는 대신 생기는 비용이다.
- 서버 빌드가 늘면서 Runner DinD의 이미지·빌드 캐시가 OS 디스크(HighPoint RAID)에 쌓이고 있다(2026-11-05 기준 이미지 120GB + 빌드 캐시 128GB). 정기 정리 정책이 필요하다([0042](0042-cicd-runner-execution.md)).
- vLLM(Gemma) 가중치는 이 결정과 별개로 PVC(`llm-serving/gemma-model-pvc`)에 둔다([0035](0035-large-model-operations.md)).
- 관련: [0033](0033-embedding-model-serving-feasibility.md), [0035](0035-large-model-operations.md), [0039](0039-docker-image-build-convention.md)
