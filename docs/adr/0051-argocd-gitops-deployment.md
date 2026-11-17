# ADR-051. 서비스 배포를 ArgoCD GitOps로 전환

- **Status**: 확정·운영 중 (2026-11-12, 서비스 6개 전환 완료)
- 이 ADR이 [0042](0042-cicd-runner-execution.md)의 배포 단계와 [0029](0029-helm-chart-deployment-strategy.md)의 수동 `helm upgrade` 운영을 대체한다.

## Context

- **배포가 CI 안에서 직접 이뤄졌다.**
  - rag·vkey 저장소 4개는 CI가 `CD_KUBE_CONFIG_B64` Secret의 kubeconfig로 `helm upgrade`를 실행했다.
  - 이 kubeconfig가 어느 계정인지 확인할 수 없었다. 후보는 개발자 SA 토큰이나 관리자 인증서였다.
  - 그 자격 증명은 모든 CI job에 노출돼 있었다.
- **infra(`k8s-manager`, `monitoring-web`)는 CI에 배포 단계가 없었다.** 사람이 `helm upgrade`를 수동으로 실행했다.
  - 클러스터에서 직접 고친 값과 차트 값이 어긋나서 업그레이드가 실패한 사고가 있었다([0046](0046-helm-external-secret.md)).
- **차트가 서비스 소스 저장소의 `k8s/`에 들어 있었다.**
  - 개발자가 배포 설정을 마음대로 바꿀 수 있었다.
  - vkey-server에는 평문 Secret 파일까지 커밋돼 있었다.

## Decision

1. **ArgoCD를 설치한다.**
   - 버전: chart `argo/argo-cd` 10.17.2 (v3.6.1), 네임스페이스 `argocd`
   - 노출 범위: ClusterIP만 둔다. 접속은 `kubectl port-forward -n argocd svc/argocd-server 8080:443`으로 한다.
   - 끄는 기능: dex, notifications, 웹 터미널(exec)
   - 설치 값: `k8s/argocd-values.yaml`
2. **배포 기준 저장소를 팀별로 나눈다.**
   - 저장소: `myorg/deploy-infra`, `myorg/deploy-rag`, `myorg/deploy-vkey`
   - 각 저장소에 `apps/<서비스>/` 차트와 운영 values를 두고, `argocd/`에 AppProject와 Application 매니페스트를 둔다.
   - 전환할 때 `kubectl diff`가 0인 것을 확인한 뒤 넘어갔다.
3. **ArgoCD는 저장소를 읽기만 한다.**
   - 저장소마다 읽기 전용 Deploy Key(ed25519)를 둔다.
   - 접속 주소는 클러스터 내부 SSH `gitea-ssh.infra.svc.cluster.local:2222`이고, 호스트 키는 values에 고정한다.
4. **CI는 이미지 태그만 갱신한다.**
   - 흐름: 빌드 → `ci/bump-deploy.sh <app> <sha>` → deploy 저장소의 `image.tag` 커밋 → ArgoCD 자동 동기화
   - 자동 동기화는 prune과 selfHeal을 켠다.
   - 커밋에 쓰는 `DEPLOY_REPO_TOKEN`은 `<팀>-ci` 계정 토큰이다. 이 토큰은 자기 deploy 저장소에만 push할 수 있다.
   - CI에서 클러스터 자격 증명을 완전히 없앴다. `CD_KUBE_CONFIG_B64`는 4개 저장소 모두에서 삭제했다.
5. **AppProject로 배포 범위를 묶는다.**
   - `rag`: `deploy-rag` → `rag-system`만. 클러스터 리소스, Role·RoleBinding, ResourceQuota·LimitRange는 만들 수 없다.
   - `vkey`: `deploy-vkey` → `vkey-system`만. 제한은 rag와 같다.
   - `infra`: `deploy-infra` → `infra`만. 클러스터 리소스는 ClusterRole·ClusterRoleBinding만 허용한다.
6. **ArgoCD 컨트롤러 권한은 축소를 보류한다.**
   - 지금은 helm 기본값인 클러스터 전체 권한을 그대로 둔다.
   - 관리할 네임스페이스가 늘어날 예정이라 보류했다. 범위 제한은 5번 AppProject가 맡는다([0014](0014-rbac-networkpolicy-scope.md)).
7. **ArgoCD 인증서는 내부 CA로 다시 발급하지 않는다.**
   - Harbor를 도입하지 않기로 해서 내부 CA를 재사용할 대상이 없다.
   - 접속은 port-forward로만 한다. 저장소 읽기도 SSH라서 서버 인증서에 의존하지 않는다.
   - 외부로 노출하게 되면 Gateway의 `gpu.example.ac.kr` 인증서로 TLS를 처리하고, ArgoCD는 `server.insecure`로 둔다.
8. **ArgoCD 밖에서 관리하는 리소스를 정한다.**
   - 대상: DB(postgres, pgadmin), Secret, PVC, 리다이렉트용 HTTPRoute
   - 이 리소스는 직접 `kubectl`로 관리한다.
   - vkey-server는 Secret을 바꾼 뒤 values의 `appSecretRevision`을 바꿔서 재시작을 유도한다.
9. **개발자 kubectl 권한을 조회와 디버깅으로 줄인다**(`rag-dev-role`, `vkey-dev-role`, [0014](0014-rbac-networkpolicy-scope.md)).

## Consequences

- **배포 이력이 남는다.** 배포 상태가 deploy 저장소의 git 이력으로 남는다. 클러스터를 직접 고치면 몇 초 안에 원래대로 되돌아간다(selfHeal 4~6초 확인).
- **배포 시간**
  - infra: push 후 약 20초
  - rag-web, vkey: 병합 후 약 6분
  - rag-server: 병합 후 약 9분 (빌드 포함)
- **운영 규칙이 바뀐다.**
  - 앱을 바꾸려면 deploy 저장소에 PR을 올린다. `helm upgrade`는 쓰지 않는다.
  - 기존 helm 릴리스 기록은 `owner=helm-archived` 라벨로 보존만 한다.
  - 소스 저장소의 `k8s/` 폴더는 안내용 README만 남기고 지웠다. `k8s_manager/k8s/`에는 플랫폼 매니페스트(gitea, argocd, gateway 등)만 남는다.
- **남은 위험·할 일**
  - ~~`default` AppProject가 모든 저장소와 대상을 허용한다.~~ 2026-11-12에 잠갔다(`k8s/argocd-default-project.yaml`).
  - ArgoCD admin 비밀번호를 바꾸고 `argocd-initial-admin-secret`을 지워야 한다.
  - vkey-server 저장소 이력에 평문 Secret 파일(LLM 관리자 키, DB·Oracle·SMTP 비밀번호)이 남아 있다. 키 교체가 필요하다.
  - `CD_KUBE_CONFIG_B64`가 관리자 인증서였다면 Secret 삭제만으로는 무효화되지 않는다. 그 경우 CA를 교체해야 한다.
- 관련: [0050](0050-gitea-account-permission-split.md), [0045](0045-multinode-transition-rto-rpo.md)

## 현황 갱신 (2026-11-12 오후)

- ArgoCD 웹 UI를 `https://gpu.example.ac.kr/argocd`로 공개했다(학내망 전용).
  - 구성: infra-gateway의 https 리스너 → HTTPRoute `infra/argocd`(argocd 네임스페이스 Service는 ReferenceGrant로 참조) → `argocd-server:80`
  - TLS는 Gateway가 처리한다. ArgoCD는 `server.insecure=true`, `server.rootpath`·`server.basehref`=`/argocd`로 동작한다. 결정 7의 "외부 노출 시" 방식 그대로다. helm revision 4.
  - 비상 접속: `kubectl port-forward -n argocd svc/argocd-server 8080:80` → http://localhost:8080/argocd
- 로그인은 아직 공용 `admin` 계정 하나뿐이다. 개발자에게도 열려면 Gitea OIDC(SSO)와 프로젝트별 RBAC를 붙여야 한다. 예: rag-maintainers는 `rag` 프로젝트만 Sync할 수 있게 한다.
- **vkey-server 이력 정리 (2026-11-12 밤)**: Gitea `myorg/vkey-server`의 전체 이력에서 비밀값을 지웠다(git-filter-repo).
  - 삭제한 파일: `k8s/vkey-app-secret.yaml`, `.env`
  - 다른 파일(`.env.example` 등)에 섞여 있던 비밀값 13종은 `***REMOVED***`로 치환했다.
  - 커밋은 207개에서 201개가 됐다. main은 `a635e08` → `ef136c3`로 바뀌었고, 파일 내용은 그대로다.
  - 반영: main을 강제 push했고, 서버 저장소의 `refs/pull/1/head`를 지운 뒤 gc로 옛 객체를 제거했다. 보호 규칙은 다시 적용했다.
  - 원본 백업은 관리 PC `Desktop/repo-backup/vkey-server-before-purge.git`에 있다. 이 백업에는 비밀값이 그대로 들어 있다.
  - GitHub `MYORG-Virtual-Key-Management-System/Server`(비공개)는 사용자 결정으로 손대지 않았다. main·test 브랜치와 과거 커밋에 비밀값이 남아 있다.
  - 이력 정리는 노출된 키를 무효로 만들지 않는다. 키 교체는 별도로 필요하다.

## 현황 갱신 (2026-11-17): https 저장소 주소 + Gitea 웹훅으로 즉시 반영

- **문제**: ArgoCD가 deploy 저장소를 폴링으로만 읽었다(180초 + 지터 60초). CI가 이미지 태그를 올려도 반영까지 최대 4분을 더 기다렸다.
- **원인**: ArgoCD 기본 웹훅은 payload의 저장소 주소(`https://gpu.example.ac.kr/gitea/myorg/deploy-*`)와 앱의 repoURL이 같아야 앱을 찾는다. 기존 repoURL은 SSH(`ssh://git@gitea-ssh.infra.svc.cluster.local:2222/...`)라서 일치하지 않았다.
- **결정**: 결정 3의 접속 방식을 바꿔, repoURL을 `https://gpu.example.ac.kr/gitea/myorg/deploy-<team>.git`으로 맞춘다. k8s-manager가 웹훅을 받아 앱을 새로고침해 주는 중계 방식도 검토했지만, 코드를 하나 더 유지해야 해서 택하지 않았다.
  - 자격 증명: Gitea 계정 `argocd-read`(제한된 사용자, 비밀번호 무작위)와 `read:repository` 토큰. 자격 증명 템플릿 Secret `argocd/repo-creds-gitea-deploy`(url 접두어 `https://gpu.example.ac.kr/gitea/myorg/deploy-`)에 넣는다.
  - 권한 범위: 팀 `ci-argocd-read`가 deploy-infra·deploy-rag·deploy-vkey의 코드 읽기만 받는다.
    - 조직 myorg에는 비공개로 설정되지 않은 저장소가 있다(예: rag-server). 이런 저장소는 일반 조직 구성원이면 누구나 읽을 수 있다. 그래서 `argocd-read`를 **제한된 사용자**로 만들어 팀이 받은 저장소만 보이게 했다.
    - 토큰으로 확인한 결과: deploy 3개는 200, rag-server·vkey-server는 404.
    - `ci-` 접두어라서 admin-manager에서도 보호 팀으로 취급한다([0050](0050-gitea-account-permission-split.md)).
  - 웹훅: deploy 저장소 3곳에 등록했다. push 이벤트만 보내고 대상 브랜치는 main이다.
    - 주소: `http://argocd-server.argocd.svc.cluster.local/argocd/api/webhook`
    - 서명: 무작위 비밀값. `argocd-secret`의 `webhook.github.secret`·`webhook.gogs.secret`에 같은 값을 넣는다. Gitea는 두 형식의 헤더를 모두 보낸다.
    - Gitea `ALLOWED_HOST_LIST`에 argocd-server를 추가했다(`k8s/gitea-values.yaml`).
  - TLS 의존: 결정 7의 "저장소 읽기도 SSH라서 서버 인증서에 의존하지 않는다"는 더 이상 맞지 않는다. 이제 ArgoCD의 저장소 읽기가 Gateway 인증서와 `gpu.example.ac.kr` 이름 해석에 의존한다.
- **확인**:
  - 앱 7개 모두 https 저장소에서 Synced/Healthy다.
  - k8s-manager CI 태그 bump(04:34:12Z) 3초 뒤 웹훅이 200으로 전달됐다. ArgoCD 로그에 `refreshing app from webhook`이 찍혔다.
  - deploy-rag·deploy-vkey PR #3 병합 push도 웹훅 200, 앱 새로고침이 확인됐다.
- **남은 정리**: AppProject `sourceRepos`에는 예전 SSH 주소가 아직 남아 있다. ArgoCD Secret `repo-deploy-*`(SSH 키)와 Gitea 배포 키도 그대로다. 전환이 안정되면 지운다.

## 현황 갱신 (2026-11-17 오후): 배포 상태 화면

- 모니터링 웹 "배포 상태"(`/deploy-status`)가 Application CR을 읽어 보여 준다: Sync·Health, 현재 이미지, 배포 저장소 커밋, 최근 동기화 결과, 앱별 관리 리소스. 읽기 전용이고 Sync·롤백은 ArgoCD UI에서 한다.
  - k8s-manager에 `applications.argoproj.io` get/list 권한을 더했다(deploy-infra `1b59e8f`). 화면 경로가 `/argocd`가 아닌 이유는 [0053](0053-monitoring-web-access-and-ops-screens.md) 참고.
  - 관리 리소스별 Health는 "-"로 나온다. ArgoCD가 리소스별 health를 Application status에 저장하지 않는 설정으로 보인다(확인 전). 앱 전체 Health는 정상 표시된다.
- 배포된 이미지 태그와 Jenkins 최근 성공 빌드를 비교하는 "빌드 대비" 칸이 있다([0052](0052-jenkins-ci.md) 현황 갱신).
