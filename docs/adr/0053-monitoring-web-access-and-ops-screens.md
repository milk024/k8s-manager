# ADR-053. 모니터링 웹 접근 통제(관리자 로그인)와 운영 화면

- **Status**: 확정·운영 중 (2026-11-17)
- 관련: [0047](0047-realtime-socket-push.md)(socket push), [0050](0050-gitea-account-permission-split.md)(admin-manager Gitea 관리), [0051](0051-argocd-gitops-deployment.md)(ArgoCD), [0052](0052-jenkins-ci.md)(Jenkins), [0014](0014-rbac-networkpolicy-scope.md)(RBAC)

## Context

- monitoring-web(`https://gpu.example.ac.kr/`)과 k8s-manager API(`/api-k8s-m`)는 학내망이면 누구나 열 수 있었다. 관리자 로그인은 `/admin` 화면에만 있었다.
- 그런데 k8s-manager API는 모든 네임스페이스의 Pod 목록과 Pod 로그를 돌려준다. 로그에는 내부 주소, 사용자 요청, 오류 메시지가 그대로 들어 있다.
- 운영 체크리스트 8번에 남은 화면이 있었다: ArgoCD 배포 상태, 네임스페이스 YAML 관리(ArgoCD 관리 리소스는 읽기 전용), Pod 상세(연관 리소스·에러 로그), 알람 그룹핑/침묵.
- admin-manager의 K8s 권한은 rag-system·vkey-system에만 있었다(RoleBinding). 그래서 YAML 화면에서 infra를 열면 K8s 403 원문이 보였다.

## Decision

1. **사이트 전체를 관리자 로그인 뒤에 둔다.**
   - 로그인은 admin-manager 관리자 로그인과 같다(JWT, HS256, 8시간). 토큰은 탭 단위 sessionStorage에 두고, 만료 시각에 화면이 자동 로그아웃한다.
   - 개발자용 별도 계정은 만들지 않는다. 개발자는 발급받은 kubeconfig(조회·디버깅 권한)와 ArgoCD·Gitea 화면을 쓴다.
2. **k8s-manager가 같은 토큰을 직접 검증한다.**
   - `JWT_SECRET`을 admin-manager와 공유한다(Secret `infra/admin-manager-app`을 `secretKeyRef`로 참조, 값은 복사하지 않음).
   - `/api/*`는 `Authorization: Bearer` 필수. 예외는 `/api/health`(프로브)와 `/webhook/*`(Gitea·Alertmanager, 각자 비밀값으로 검증)다.
   - socket.io는 연결할 때 `auth.token`을 검증하고, 토큰 만료 시각에 서버가 연결을 끊는다.
   - 검증은 Node 기본 crypto로 한다(alg는 HS256만 허용, 서명 비교는 timingSafeEqual). 새 라이브러리는 추가하지 않았다.
   - `JWT_SECRET`이 없으면 전부 거부한다(fail closed). `AUTH_REQUIRED=false`는 로컬 개발 전용이다.
3. **admin-manager 매니페스트 권한: 조회는 전체, 수정은 개발 네임스페이스만.**
   - 새 ClusterRole `admin-manager-read`(ClusterRoleBinding): Pod·Service·ConfigMap·PVC·Event·Deployment·ReplicaSet·NetworkPolicy·HTTPRoute의 get/list/watch. Secret은 없다.
   - 수정·삭제는 기존대로 `rbac.namespaces`(rag-system, vkey-system)의 RoleBinding만. admin-manager 코드도 `ISSUABLE_NAMESPACES` 밖이면 403과 이유를 먼저 돌려준다.
   - infra·kube-system에 쓰기를 주지 않는 이유: infra에는 admin-manager 자신과 Gitea가 있다. Gitea는 helm으로 배포돼 ArgoCD 읽기 전용 보호(409)도 받지 않는다. 관리 화면에서 관리 도구 자신을 고치거나 지울 수 있게 되기 때문이다.
4. **운영 화면을 추가한다.** 모두 k8s-manager·admin-manager의 읽기 API 위에 있다.

   | 화면 | 경로 | 데이터 |
   |---|---|---|
   | 빌드 상태 | `/builds` | k8s-manager `GET /api/gitea/builds` + `ci:build` 소켓 ([0052](0052-jenkins-ci.md) 현황 갱신) |
   | 배포 상태 | `/deploy-status` | k8s-manager `GET /api/k8s/argocd/apps` (Application CR 요약, 읽기 전용) + 빌드 대비 |
   | Pod 상세 | `/pods/:namespace/:name` | `GET /api/k8s/pods/:name/related`·`/logs?previous=&tailLines=`·`/events?pod=` |
   | 네임스페이스 YAML | `/namespaces/:namespace` | admin-manager `/api/manifests*` |

   - 배포 상태 화면 경로는 `/argocd`를 쓰지 않는다. 게이트웨이가 `/argocd`를 ArgoCD 본체로 보내서, 새로고침하면 ArgoCD UI가 열리기 때문이다.
   - k8s-manager ClusterRole `k8s-manager-read`에 읽기 권한을 더했다: replicasets get, services·httproutes list, `applications.argoproj.io` get/list. Secret은 없다(Pod 연관 리소스의 Secret은 Pod spec에서 이름만 꺼낸다).
   - Pod 로그 "에러만 보기"는 흔한 형식(ERROR, level=error, JSON level, Traceback, panic, klog E)과 그 뒤 스택 트레이스 줄을 남긴다.
5. **YAML 편집기는 Monaco를 앱 번들에 넣는다.**
   - `@monaco-editor/react` 4.7.0 + `monaco-editor` 0.57.0. 기본 동작(jsdelivr CDN 로드) 대신 `loader.config({ monaco })`로 앱에서 불러온다. 학내망·외부 의존을 피하기 위해서다.
   - 편집기를 열 때만 Monaco 청크(약 4MB)를 내려받는다. 첫 화면 번들 크기는 그대로다.
   - 저장은 확인 창, 삭제는 리소스 이름 입력, 동시 수정은 resourceVersion으로 막는다(서버). YAML 오류는 행 번호와 편집기 밑줄로 보인다.
6. **알람 그룹핑/침묵은 보류한다.** 싱글 노드라 알람 수가 적고, Alertmanager 알림 연결도 아직이다(SMTP 방식 결정 대기). 추후 고도화로 넘긴다.

## Consequences

- 로그인 없이 `/api-k8s-m`을 부르면 401이다. 실시간 소켓도 토큰이 없거나 틀리면 연결 단계에서 거절되고 데이터를 받지 못한다. 2026-11-17 운영에서 확인했다.
- 배포 순서: 프론트가 토큰을 먼저 보내게 배포(monitoring-web `8ddf284`) → `JWT_SECRET` 연결(deploy-infra `333d070`) → 차단 코드(k8s-manager `58b7b24`). 중간에 화면이 깨지는 구간은 없었다.
- **운영 주의**: admin-manager `JWT_SECRET`을 바꾸면 k8s-manager도 재시작해야 한다(env로 읽음). 그 전까지는 로그인해도 401이다.
- 관리자 계정이 곧 모니터링 웹 계정이다. 관리자 수가 늘면 조회 전용 역할을 따로 두는 것을 다시 검토한다. 대시보드 MFA는 체크리스트에 남아 있다.
- admin-manager가 모든 네임스페이스의 ConfigMap을 읽을 수 있다. 비밀값은 ConfigMap이 아니라 Secret에 둔다는 관례를 계속 지켜야 한다(Secret은 admin-manager·k8s-manager 둘 다 읽지 못한다).
- 빌드 산출물에 Monaco의 JSON·CSS·TypeScript worker 파일(약 9MB)이 같이 들어간다. YAML 편집에서는 내려받지 않아 화면 속도에는 영향이 없다.
- 커밋: k8s-manager `fe0ac07`·`58b7b24`·`6ee0179`, admin-manager `9b78422`, monitoring-web `9b2e4ff`·`dd7ac7f`·`9ad5962`·`8ddf284`·`0fb0eb6`·`9bf93b4`, deploy-infra `1b59e8f`·`cc13ec5`·`333d070`.
