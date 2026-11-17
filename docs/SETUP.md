# k8s_manager

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
| `JWT_SECRET` | (없음) | 로그인 토큰 검증 키. admin-manager 와 같은 값(운영: Secret `admin-manager-app`). 없으면 `/api`·소켓 전부 거부 |
| `AUTH_REQUIRED` | `true` | `false` 면 인증 생략 (로컬 개발 전용) |

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
├── k8s/                        # 플랫폼 매니페스트(Gitea·ArgoCD values, Gateway, HTTPRoute 등, kubectl/helm 직접 관리). 앱 차트는 myorg/deploy-infra 로 이전
└── docs/
    ├── adr/                    # 아키텍처 결정 기록 (ADR.md가 인덱스)
    └── diagrams/                # draw.io 아키텍처 다이어그램
```

각 서비스/헬퍼는 클래스(`constructor`)로 상태를 캡슐화하고, 모듈은 싱글턴 인스턴스를 export한다.

## 빌드·배포 (ArgoCD, 2026-11-12~)

main 에 push 되면 Jenkins(`Jenkinsfile`, 팀 cloud `infra`, ADR-0052)가 자동으로 처리한다. 사람이 `helm` 이나 `kubectl` 로 배포하지 않는다.

1. 이미지 빌드 → `gpu.example.ac.kr/myorg/k8s-manager:<커밋 SHA>` push (`infra-ci`)
2. `ci/bump-deploy.sh` 가 **`myorg/deploy-infra` 의 `apps/k8s-manager/values.yaml` image.tag** 를 갱신 커밋
3. ArgoCD(Application `k8s-manager`, 자동 동기화)가 감지해 반영
4. 빌드 결과는 Gitea 커밋 상태 `jenkins/build` 로 남는다 (대시보드 빌드 이력의 원천)

- 배포 설정(env, replicas, 라우트 등)은 이 저장소가 아니라 **`myorg/deploy-infra` 의 `apps/k8s-manager/`** 에서 바꾼다. 이 저장소의 `k8s/` 차트는 그쪽으로 이전·삭제됐다.
- 클러스터에서 직접 고치면 ArgoCD 가 되돌린다. 비밀값은 어느 저장소에도 커밋하지 않는다(클러스터 Secret 으로 관리).

## API

**인증 (2026-11-17~)**: 모니터링 웹 로그인 = admin-manager 관리자 로그인. `/api/*` 는 `Authorization: Bearer <admin-manager JWT>` 가 필요하고(HS256, `JWT_SECRET` 공유), socket.io 는 연결 때 `auth.token` 을 보낸다(토큰 만료 시각에 서버가 끊음). 예외: `/api/health`, `/webhook/*`(Gitea·Alertmanager — 각자 비밀값 검증).

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/k8s/network-policies?namespace=` | NetworkPolicy 목록(namespace 생략 시 전체) |
| PUT/DELETE | `/api/k8s/network-policies/:name?namespace=` | NetworkPolicy 생성/수정/삭제(namespace 필수) |
| GET | `/api/k8s/deployments?namespace=`, `/pods?namespace=`, `/events?namespace=` | 워크로드 조회(namespace 생략 시 전체) |
| GET | `/api/k8s/pods/:name/logs?namespace=&container=&previous=true&tailLines=` | Pod 로그(namespace 필수). `previous=true` 는 직전에 죽은 컨테이너 로그, tailLines 10~5000(기본 500) |
| GET | `/api/k8s/pods/:name/related?namespace=` | Pod 연관 리소스: 소유 체인(ReplicaSet→Deployment), ConfigMap·Secret(이름만)·PVC·ServiceAccount, 이 Pod 를 고르는 Service, 그 Service 로 보내는 HTTPRoute, ArgoCD 앱 |
| GET | `/api/k8s/events?namespace=&pod=` | `pod` 를 주면 그 Pod 의 이벤트만 |
| GET | `/api/gitea/builds` | CI 저장소별 빌드 요약: main 최신 커밋(head), 최근 빌드(latestBuild), 최근 성공(lastSuccess). 최신 커밋부터 차례로 보다가 둘 다 찾으면 멈춤, 10초 캐시 |
| GET | `/api/k8s/argocd/apps` | ArgoCD Application 요약(sync·health·이미지·최근 동기화·리소스별 상태). 읽기 전용 |
| GET | `/api/gitea/repos`, `/repos/:owner/:repo` | Gitea 레포 조회 (`hasCi`: 기본 브랜치에 Jenkinsfile 있음, 5분 캐시) |
| GET | `/api/gitea/repos/:owner/:repo/builds?limit=&branch=` | Jenkins 빌드 이력 (main 최근 커밋 + 커밋 상태 `jenkins/build`, 상태 없으면 `none`) |
| POST | `/api/gitea/repos/:owner/:repo/webhook` | 웹훅 등록(없으면 생성, push·status 이벤트. 예전 push 전용 훅엔 status 추가) |
| GET | `/api/mirror/:kind/packages` | pip/npm 미러 패키지 목록 |
| POST | `/api/mirror/oci/import` | OCI 이미지 오프라인 반입 |
| GET | `/api/monitor/pods?namespace=`, `/gpu?namespace=`, `/disk-io?node=` | Pod/GPU/디스크I/O 사용량(namespace/node 생략 시 전체) |
| POST | `/webhook/alert` | Alertmanager 임계치 알람 인바운드 |
| POST | `/webhook/gitea` | Gitea 인바운드: push → `gitea:push`, status(jenkins/*) → `ci:build` |

socket.io는 `dashboard` room으로 `monitor:pods`(클러스터 전체 폴링 결과), `monitor:error`, `alert:triggered`, `gitea:push`, `ci:build`(Jenkins 빌드 상태 변화, Gitea status 웹훅 기반) 이벤트를 브로드캐스트한다.

## 설계 문서

- 아키텍처 결정 기록: [`docs/adr/ADR.md`](docs/adr/ADR.md) — 다수 항목이 **대기 중** 상태이며, 그 결정에 따라 `services/gitea` 및 RBAC 관련 세부 구현이 바뀔 수 있다.
- 아키텍처 다이어그램: [`docs/diagrams/`](docs/diagrams/) (draw.io)

## 참고

- `myorg/deploy-infra` 의 `apps/k8s-manager/templates/rbac.yaml`은 관리서버 자신이 클러스터 API를 호출할 권한(ServiceAccount)이지, API를 호출하는 **사용자**를 구분하는 인증/RBAC이 아니다. 후자는 아직 구현하지 않은 상태다(ADR-009, ADR-014 대기 중). 필요해지면 별도로 추가한다.
- 조회 API(Pod/Deployment/Event/NetworkPolicy 목록, Pod 메트릭)는 **k8s_manager가 모든 namespace를 모니터링해야 한다는 요구사항** 때문에 기본적으로 클러스터 전체를 대상으로 하며, RBAC도 이에 맞춰 `ClusterRole`/`ClusterRoleBinding`으로 구성되어 있다. NetworkPolicy 쓰기(생성/수정/삭제)만 예외적으로 배포 namespace로 한정된 `Role`을 쓴다(ADR-014 대기 중).
- `services/k8sService.cjs`는 `KUBERNETES_SERVICE_HOST` 환경변수 존재 여부로 in-cluster/로컬 실행을 판별한다 — `@kubernetes/client-node`의 `loadFromCluster()`는 서비스어카운트 파일이 없어도 예외를 던지지 않으므로 이 판별 로직을 임의로 바꾸지 않는다.
