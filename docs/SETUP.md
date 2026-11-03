# k8s_manager 설치·배포 가이드

`Namespace: infra` 통합 관리 서버 — K8s 클러스터 관리, Gitea, Package Mirror, Pod/GPU/디스크 리소스 모니터링을 하나의 관리서버(REST API + socket.io)로 묶는다.

관리서버는 wk-01 Pod 내부에서 in-cluster ServiceAccount로 kube-apiserver·metrics-server에 접근하고, Local Ops GUI(별도 저장소, React/Vite)는 같은 namespace의 별도 Pod로 붙어 이 서버의 API/소켓만 소비한다.

## 요구 사항

- Node.js `>=22`
- npm
- (선택) 클러스터 밖 로컬 개발 시: `~/.kube/config`에 접근 가능한 kubeconfig — `KUBECONFIG` 환경변수로 다른 경로 지정 가능

## 설치 및 실행

```bash
npm install
cp .env.example .env   # 필요한 값 채우기
npm start               # node main.cjs
npm run dev             # node --watch main.cjs (파일 변경 시 자동 재시작)
```

기동하면 콘솔에 kube-apiserver / Gitea / Prometheus 헬스체크 결과가 출력되고, 이어서 **클러스터 전체(모든 namespace) Pod CPU/메모리** 폴링이 백그라운드로 시작된다.

## 환경변수 (`.env`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8000` | 관리서버 리스닝 포트 |
| `ALLOWED_ORIGINS` | (비어있으면 전체 허용) | GUI가 다른 origin에서 붙을 경우 CORS 화이트리스트 |
| `K8S_NAMESPACE` | `infra` | Helm 배포 대상 namespace(모니터링 API 자체는 기본적으로 모든 namespace를 조회하며, 이 값에 한정되지 않음) |
| `KUBECONFIG` | `~/.kube/config` | 클러스터 밖 로컬 개발용 kubeconfig 경로 (in-cluster 환경에서는 무시됨) |
| `GITEA_BASE_URL` | `http://gitea-http.infra.svc.cluster.local:3000` | Gitea REST API 엔드포인트 |
| `GITEA_TOKEN` | (없음) | Gitea API 인증 토큰 |
| `GITEA_WEBHOOK_SECRET` | (없음) | Gitea push 웹훅 서명 검증용 시크릿 |
| `PROMETHEUS_BASE_URL` | `http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090` | GPU/디스크I/O PromQL 조회 대상 |
| `MIRROR_REGISTRY_URL` | (없음) | Package Mirror Registry(OCI) 주소 |
| `MONITOR_POLL_INTERVAL_MS` | `5000` | Pod 리소스 폴링 주기 |

## 폴더 구조

```
k8s_manager/
├── main.cjs                  # 진입점 — http 서버 기동, 헬스체크, 백그라운드 폴링 시작
├── core/
│   ├── app.cjs                # express 앱 조립 (cors, 라우터 마운트, 에러 핸들러)
│   ├── controller.cjs          # 기동 시 헬스체크 + 백그라운드 잡 오케스트레이션
│   └── routers/
│       ├── k8sRouter.cjs       # NetworkPolicy · Deployment · Pod 로그/이벤트
│       ├── giteaRouter.cjs     # Gitea 레포/웹훅
│       ├── mirrorRouter.cjs    # pip · npm · OCI 미러
│       ├── monitorRouter.cjs   # Pod/GPU/디스크I/O 사용량 조회
│       └── webhookRouter.cjs   # Alertmanager · Gitea 인바운드 웹훅
├── services/
│   ├── k8sService.cjs          # @kubernetes/client-node 클라이언트 (in-cluster/로컬 kubeconfig)
│   ├── giteaService.cjs        # Gitea REST 클라이언트
│   ├── mirrorService.cjs       # 오프라인 패키지 미러 관리
│   ├── monitorService.cjs      # Pod 사용량 폴링 + GPU/디스크I/O 위임
│   ├── prometheusService.cjs   # PromQL 조회
│   └── socketService.cjs       # socket.io 서버 + 대시보드 브로드캐스트
├── helpers/
│   ├── configHelper.cjs        # 환경변수 로드
│   ├── logHelper.cjs           # 콘솔 로그 포맷 통일
│   ├── auditHelper.cjs         # 반입 이력/알림 감사 로그 (로컬 파일 append)
│   └── metricsParseHelper.cjs  # Metrics API quantity 문자열 파서 (CPU/메모리)
├── k8s/                        # Helm Chart (ADR-029) — 클러스터 배포용
│   ├── Chart.yaml
│   ├── values.yaml              # 이미지/replica/env/ingress/persistence 기본값
│   └── templates/
│       ├── rbac.yaml             # ServiceAccount + ClusterRole(조회, 전체 namespace) + Role(NetworkPolicy 쓰기, 배포 namespace만) (ADR-002)
│       ├── configmap.yaml        # 비-시크릿 환경변수 (.env.example과 1:1 대응)
│       ├── secret.yaml           # 시크릿 템플릿 — 실제 값은 커밋하지 않음
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── pvc.yaml              # persistence.enabled=true일 때만 생성 (ADR-031)
│       └── httproute.yaml        # Gateway API HTTPRoute — gateway.enabled=true일 때만 생성, 기존 infra-gateway에 부착 (ADR-005/007)
├── k8s/infra-gateway.yaml       # infra namespace 공용 Gateway (Helm 밖, kubectl apply로 직접 관리, 실제 배포 완료: 10.0.0.23)
└── docs/
    ├── adr/                    # 아키텍처 결정 기록 (ADR.md가 인덱스)
    └── diagrams/                # draw.io 아키텍처 다이어그램
```

각 서비스/헬퍼는 클래스(`constructor`)로 상태를 캡슐화하고, 모듈은 싱글턴 인스턴스를 export한다.

## 이미지 빌드 (ADR-036, ADR-039)

Gitea Registry가 실제로 배포되어 있음 — 조직 `myorg`, 주소 `10.0.0.23:80`(PoC 단계, TLS 없음).

```bash
docker build -t 10.0.0.23:80/myorg/k8s-manager:v0.1.0 .
docker login 10.0.0.23:80
docker push 10.0.0.23:80/myorg/k8s-manager:v0.1.0
```

- 이미지 저장소는 **Gitea Container Registry로 확정**(Docker Hub 사용 안 함).
- 태그는 `v{major}.{minor}.{patch}`로 고정, 운영 배포에 `latest` 단독 사용 금지(롤백 불가능해짐). `k8s/values.yaml`의 `image.tag`를 배포할 버전에 맞춰 갱신.
- `Dockerfile`은 `node:22.16.0-slim` 고정 태그 + 의존성/코드 레이어 분리, `npm ci --omit=dev`, non-root(`USER node`) 구조를 따른다.
- **HTTP(비TLS) 레지스트리**라서 클러스터 노드(containerd)에서 이 이미지를 pull하려면 insecure registry 설정이 필요할 수 있음 — 아직 미확인.

## 클러스터 배포 (Helm)

```bash
# 렌더링만 확인 (실제 적용 안 함)
helm template k8s-manager ./k8s -n infra

# 실제 배포 — 시크릿은 values.yaml에 커밋하지 말고 --set-string으로 전달
helm install k8s-manager ./k8s -n infra --create-namespace \
  --set-string secret.GITEA_TOKEN=... \
  --set-string secret.GITEA_WEBHOOK_SECRET=...

# 값 변경 후 재배포
helm upgrade k8s-manager ./k8s -n infra
```

- `values.yaml`의 `config.*` 키는 `.env.example`과 동일하게 유지한다 — 환경변수를 추가/변경하면 양쪽 다 갱신할 것.
- `gateway.enabled`는 기본 `false` — `infra` namespace에는 이미 공용 Gateway(`infra-gateway`, `k8s/infra-gateway.yaml`, `10.0.0.23:80`)가 떠 있고 Gitea HTTPRoute가 `/`를 이미 점유하고 있으므로, `k8s_manager`는 새 Gateway를 만들지 않고 이 기존 Gateway에 `/api`·`/socket.io`·`/webhook` HTTPRoute만 추가한다(ADR-007). GUI 노출(`gateway.exposeGui`)은 `/` 경로 충돌이 해결되기 전까지 비활성화(ADR-005).
- `persistence.enabled`는 ADR-031(스토리지 용량 계획)이 확정되기 전까지 기본 `false`.
- 이미지 저장소는 ADR-036에서 Gitea Container Registry로 확정, 실제 주소(`10.0.0.23:80/myorg/...`)까지 확인됨.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/k8s/network-policies?namespace=` | NetworkPolicy 목록(namespace 생략 시 전체) |
| PUT/DELETE | `/api/k8s/network-policies/:name?namespace=` | NetworkPolicy 생성/수정/삭제(namespace 필수) |
| GET | `/api/k8s/deployments?namespace=`, `/pods?namespace=`, `/events?namespace=` | 워크로드 조회(namespace 생략 시 전체) |
| GET | `/api/k8s/pods/:name/logs?namespace=` | Pod 로그(namespace 필수 — 클러스터 전체에서 Pod 이름만으로는 특정 불가) |
| GET | `/api/gitea/repos`, `/repos/:owner/:repo` | Gitea 레포 조회 |
| POST | `/api/gitea/repos/:owner/:repo/webhook` | 웹훅 등록(없으면 생성) |
| GET | `/api/mirror/:kind/packages` | pip/npm 미러 패키지 목록 |
| POST | `/api/mirror/oci/import` | OCI 이미지 오프라인 반입 |
| GET | `/api/monitor/pods?namespace=`, `/gpu?namespace=`, `/disk-io?node=` | Pod/GPU/디스크I/O 사용량(namespace/node 생략 시 전체) |
| POST | `/webhook/alert` | Alertmanager 임계치 알람 인바운드 |
| POST | `/webhook/gitea` | Gitea push 이벤트 인바운드 |

socket.io는 `dashboard` room으로 `monitor:pods`(클러스터 전체 폴링 결과), `monitor:error`, `alert:triggered`, `gitea:push` 이벤트를 브로드캐스트한다.

## 설계 문서

- 아키텍처 결정 기록: [`docs/adr/ADR.md`](adr/ADR.md) — 다수 항목이 **대기 중** 상태이며, 그 결정에 따라 `services/gitea` 및 RBAC 관련 세부 구현이 바뀔 수 있다.
- 아키텍처 다이어그램: [`docs/diagrams/`](diagrams/) (draw.io)

## 참고

- `k8s/templates/rbac.yaml`은 관리서버 자신이 클러스터 API를 호출할 권한(ServiceAccount)이지, API를 호출하는 **사용자**를 구분하는 인증/RBAC이 아니다. 후자는 아직 구현하지 않은 상태다(ADR-009, ADR-014 대기 중). 필요해지면 별도로 추가한다.
- 조회 API(Pod/Deployment/Event/NetworkPolicy 목록, Pod 메트릭)는 **k8s_manager가 모든 namespace를 모니터링해야 한다는 요구사항** 때문에 기본적으로 클러스터 전체를 대상으로 하며, RBAC도 이에 맞춰 `ClusterRole`/`ClusterRoleBinding`으로 구성되어 있다. NetworkPolicy 쓰기(생성/수정/삭제)만 예외적으로 배포 namespace로 한정된 `Role`을 쓴다(ADR-014 대기 중).
- `services/k8sService.cjs`는 `KUBERNETES_SERVICE_HOST` 환경변수 존재 여부로 in-cluster/로컬 실행을 판별한다 — `@kubernetes/client-node`의 `loadFromCluster()`는 서비스어카운트 파일이 없어도 예외를 던지지 않으므로 이 판별 로직을 임의로 바꾸지 않는다.
