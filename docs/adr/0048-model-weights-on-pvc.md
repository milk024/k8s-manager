# ADR-048. rag-server 모델 가중치: 이미지에 넣지 않고 PVC에 두고 마운트

- **Status**: 제안 (2026-11-05) — PVC 구성(전용 PVC vs `rag-storage-pvc` subPath) 결정 후 확정

## Context

- `rag-server`는 베이스 이미지 `rag-model-base`에 모델 가중치를 COPY해서 쓴다. bge-m3(4.3GB), bge-reranker-v2-m3(2.2GB)가 들어 있다. 여기에 PaddleOCR 모델(179MB)까지 넣은 v5는 23.6GB다(v4 21.5GB).
- 이 이미지를 개인 PC에서 빌드해 Gitea 레지스트리로 push하면 계속 실패했다. 2026-08-30에 세 번, 2026-11-05에 한 번이다. 원인은 레지스트리 용량이 아니다. Docker Desktop의 네트워크 계층(gvisor/vpnkit)이 업로드 도중 끊겼다(`serving vpnkit: rx: cannot read packet from socket: unexpected EOF`). Gitea 쪽에는 `500 context canceled`, 게이트웨이 쪽에는 `DC`(클라이언트 연결 끊김)로만 남았다.
- 모델을 바꾸려면 20GB가 넘는 베이스 이미지를 다시 빌드하고 push해야 한다. `rag-dev` Pod도 같은 이미지를 써서 따로 맞춰야 한다.
- OCR 모델은 처음 OCR을 할 때 외부(Baidu BOS)에서 내려받아 `rag-storage-pvc`의 `ocr-cache`에 쌓았다. 받는 시점이 운영 중이고, 받을 버전도 고정되어 있지 않다.
- 멀티노드로 전환하면 노드마다 20GB가 넘는 이미지를 pull해야 한다. [0045](0045-multinode-transition-rto-rpo.md)는 "모델 가중치 위치 확인"을 전환 전 선행 조건으로 둔다.

## Decision

### 1. 모델은 PVC에, 이미지에는 런타임만

| 위치 | 내용 |
|---|---|
| 베이스 이미지 `rag-model-base` | torch, FlagEmbedding, paddlepaddle·paddleocr·paddlex, 시스템 라이브러리(libgl1 등). 모델 없음 (약 6GB) |
| 모델 PVC (`nfs-csi`, ReadWriteMany) | bge-m3, bge-reranker-v2-m3, PaddleOCR 모델 |

PVC 구조:

```
/                              (rag-server 에서는 /app/models)
├── bge-m3/
├── bge-reranker-v2-m3/
└── paddlex/official_models/
    ├── PP-OCRv5_server_det
    ├── PP-OCRv5_server_rec
    └── korean_PP-OCRv5_mobile_rec
```

- `rag-server`와 `rag-dev`는 이 PVC를 `/app/models`에 **readOnly**로 마운트한다.
- `PADDLE_PDX_CACHE_HOME=/app/models/paddlex`로 둔다. 코드는 이미 `models/bge-m3` 같은 상대경로(WORKDIR `/app`)를 쓰므로 수정할 필요가 없다.

### 2. 모델 갱신은 정기 자동 실행이 아니라, 필요할 때 Job을 수동 실행

정기적으로 최신 모델을 받는 CronJob은 두지 않는다. 모델 파일이 조용히 바뀌면 아래처럼 에러 없이 결과가 틀어진다.

| 모델 | 바뀌면 생기는 일 |
|---|---|
| bge-m3 (임베딩) | DB(pgvector)의 문서 벡터는 이전 가중치로 만든 것이다. 새 질의 벡터와 맞지 않아 검색이 조용히 망가진다. 전체 재임베딩이 필요하다 |
| bge-reranker-v2-m3 | `DEFAULT_MIN_SCORE = 0.01`(`reranker_service.py`)은 지금 모델의 점수 분포로 잡은 값이다. 다시 측정해야 한다 |
| PaddleOCR | 같은 스캔 문서에서 다른 텍스트가 나온다 |

- `model-sync` Job이 고정된 버전을 PVC에 받는다. HF 모델은 `revision`(커밋 해시)으로, OCR 모델은 모델 이름과 paddlex 버전으로 고정한다.
- 처음 구축할 때 한 번 실행하고, 이후에는 모델을 바꾸기로 결정했을 때만 실행한다. 형태는 `suspend: true`인 CronJob을 두고 `kubectl create job --from=cronjob/model-sync`로 실행하거나, 일회성 Job으로 한다.

### 3. 모델 교체 절차

1. 새 버전을 **다른 폴더**에 받는다(예: `bge-m3@<revision>/`). 기존 폴더는 덮어쓰지 않는다.
2. 경로 env(`RAG_EMBEDDING_MODEL` 등)를 새 폴더로 바꾸고 재배포한다.
3. 임베딩 모델이 바뀌었으면 전체 문서를 재임베딩한다. 리랭커가 바뀌었으면 임계값을 다시 잰다.
4. 문제가 생기면 경로 env만 되돌린다(롤백). 확인이 끝나면 이전 폴더를 지운다.

덮어쓰지 않는 이유는 두 가지다. 실행 중인 Pod가 반쯤 바뀐 파일을 읽지 않게 하고, 롤백을 env 변경 하나로 끝내기 위해서다.

## Consequences

- 베이스 이미지가 약 23GB에서 약 6GB로 줄어서 빌드·push·pull이 가벼워진다. 모델을 바꿔도 이미지를 다시 빌드할 필요가 없다.
- 운영 중 외부(Baidu BOS, HF)에서 내려받는 일이 없어진다. 내려받기는 `model-sync` Job에서만 일어난다.
- `rag-server`가 NFS PVC에 의존하게 된다. NFS 장애([0043](0043-os-auto-update-disabled.md)) 때는 Pod를 새로 띄울 수 없다. 이미 떠 있는 Pod는 모델을 메모리에 올린 뒤라 영향이 작다. 이중화는 [0024](0024-pv-storage-redundancy.md)를 따른다.
- 이미지 태그만으로는 어떤 모델 버전이 쓰였는지 알 수 없다. 모델 폴더 이름(revision)과 경로 env를 Helm values에 남겨서 추적한다.
- 함께 바꿔야 할 것:
  - `rag-model-base`의 `Dockerfile.model-base`에서 모델 COPY와 OCR 모델 다운로드 단계를 지운다.
  - RagSystem `k8s/values.yaml`·`deployment.yaml`에서 `ocr-cache` 마운트를 모델 PVC 마운트로 바꾼다.
  - 모델 PVC와 `model-sync` Job 매니페스트를 추가한다.
- 남은 결정: 전용 PVC를 새로 만들지(권장: 모델만 따로 백업·권한 관리 가능), 기존 `rag-storage-pvc`에 `models/` subPath로 둘지.
- 관련: [0024](0024-pv-storage-redundancy.md), [0031](0031-storage-solution.md), [0033](0033-embedding-model-serving-feasibility.md), [0035](0035-large-model-operations.md), [0036](0036-container-registry-selection.md), [0045](0045-multinode-transition-rto-rpo.md)
