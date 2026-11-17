# ADR-052. CI를 Gitea Actions에서 Jenkins(Kaniko)로 전환

- **Status**: 확정·운영 중 (2026-11-16, 저장소 7개 전환 완료)
- 이 ADR이 [0042](0042-cicd-runner-execution.md)의 빌드 실행 방식(Gitea Actions + DinD Runner)을 대체한다. 배포는 그대로 [0051](0051-argocd-gitops-deployment.md)(ArgoCD)이다.

## Context

- Gitea Actions Runner는 DinD(privileged) 방식이었다. 빌드 캐시가 노드 OS 디스크에 쌓였고(약 248GB), privileged 컨테이너 하나가 모든 저장소 빌드를 처리했다.
- 로드맵은 Jenkins + Kaniko를 목표로 했다. 사용자 결정은 "파일럿 후 순차 전환"이었다.
- CI 토큰은 저장소 Secret에 있었다. 하지만 Runner가 하나라서 팀 간 격리가 실행 환경 수준에서 보장되지 않았다.

## Decision

1. **Jenkins 설치**
   - chart `jenkins/jenkins` 5.13.3 (Jenkins 2.580.2), 네임스페이스 `jenkins`
   - 설정은 `k8s/jenkins-values.yaml`의 JCasC에 코드로 둔다. Job도 JCasC 안의 job-dsl로 정의한다.
   - 웹 UI는 `https://gpu.example.ac.kr/jenkins`(학내망)다. Gateway에서 TLS를 처리하고, Service는 ClusterIP다.
   - admin 비밀번호는 직접 만든 Secret `jenkins-admin`에 둔다. 화면에서 바꾸면 재시작할 때 되돌아간다.
2. **빌드 방식**
   - Kaniko(`gcr.io/kaniko-project/executor:v1.23.2-debug`)를 쓴다. privileged와 DinD는 쓰지 않는다.
   - 빌드한 이미지는 `gpu.example.ac.kr/myorg/<앱>:<커밋 SHA>`로 push한다.
   - 그다음 기존 `ci/bump-deploy.sh`로 deploy 저장소의 태그를 갱신한다. 이후는 ArgoCD가 처리한다.
3. **팀별 격리** (`k8s/jenkins-teams.yaml`)
   - 빌드 Pod는 `jenkins-infra`, `jenkins-rag`, `jenkins-vkey` 네임스페이스에서만 뜬다.
   - 팀마다 Kubernetes cloud가 따로 있다(infra/rag/vkey). 각 cloud는 자기 네임스페이스에만 권한이 있는 SA(`jenkins-launcher`) 토큰으로 접속한다.
     - 그래서 Jenkinsfile이 네임스페이스를 바꿔 적어도 다른 팀 네임스페이스에는 Pod를 띄울 수 없다.
   - 폴더(infra/rag/vkey)는 자기 cloud만 쓸 수 있다(`usageRestricted` + `permittedClouds`). 기본 cloud는 어느 폴더도 쓸 수 없다.
   - 쓰기 토큰은 팀 네임스페이스 Secret에만 둔다: `registry`(이미지 push), `deploy-repo`(deploy 저장소 push), `gitea-read`(비공개 모듈 설치).
   - `jenkins` 네임스페이스에는 Jenkins 자격 증명으로 쓰는 읽기 전용 checkout 토큰(`gitea-<팀>-ci`)과 cloud 접속 토큰만 둔다.
4. **트리거**
   - Gitea 웹훅으로 받는다. 주소는 클러스터 내부 `jenkins.jenkins.svc.cluster.local:8080/jenkins/gitea-webhook/post`다.
   - Gitea의 `[webhook] ALLOWED_HOST_LIST`에는 Jenkins와 k8s-manager 내부 주소만 추가했다.
   - main 브랜치만 빌드한다.
5. **rag-server 이미지 토큰 검사**
   - 비공개 모듈 설치 토큰은 `--build-arg GITEA_TOKEN`에 이름만 넘긴다. 값은 환경변수에서 읽는다.
   - push한 뒤 `crane config`로 이미지 설정에 토큰이 남았는지 확인한다. 남아 있으면 태그를 지우고 빌드를 실패 처리한다.
6. **Gitea Runner 제거**
   - Runner의 Deployment, ConfigMap, 등록 토큰, Runner 등록 4건을 지웠다.
   - Gitea Actions 기능 자체는 켜 둔다. 지난 빌드 기록 조회용이고, 새 워크플로가 생겨도 실행할 Runner가 없다.

## Consequences

- 빌드 시간: infra 앱 약 1~2분, rag-server 첫 빌드 약 9분이다(20GB 베이스 이미지를 풀고 스냅샷하며, 캐시는 없다).
- 커밋 상태(Gitea 체크 표시, context `jenkins/build`)는 Jenkinsfile `post` 단계가 팀 네임스페이스의 CI 토큰으로 직접 기록한다(2026-11-16). 이를 위해 팀 `ci-<팀>-status`(코드 쓰기, 자기 소스 저장소만)를 두고, infra 소스 저장소 3개 main도 보호했다(push는 infra-maintainers·Owners). Gitea 플러그인 자체 알림은 공용 읽기 전용 자격 증명이라 계속 실패 로그를 남기지만 무시한다.
- Jenkins 로그인 SSO는 하지 않는다(관리자만 사용, 사용자 결정).
- cloud 접속 SA 토큰은 1년짜리다. CronJob `jenkins/launcher-token-rotation`이 매월 1일 03:00(KST)에 새 1년짜리로 바꾼다(`k8s/jenkins-token-rotation.yaml`).
- 구축 중 겪은 함정
  - JCasC가 `${...}`를 환경변수로 치환한다. 그래서 job-dsl 안에서는 문자열을 `+`로 잇는다.
  - 팀 cloud의 `kubernetesURL`을 빈 값으로 두면 차트 기본값으로 덮여서 CA 없이 PKIX 오류가 난다. 공백 한 칸(`" "`)으로 두면 클러스터 내부 설정을 쓴다.
  - Gitea CLI `--raw` 토큰 끝의 줄바꿈이 Secret에 들어가면 Jenkins가 401을 받는다. 발급할 때 `tr -d '\r\n'`로 지운다.
- 남은 일
  - Jenkins 로그인을 Gitea SSO로 바꾸고 팀 폴더별 권한을 나눈다(지금은 admin 하나).
  - 대시보드 빌드 이력(`gitea:actions` 소켓)을 Jenkins 기준으로 바꾼다.
- 관련: [0036](0036-container-registry-selection.md), [0050](0050-gitea-account-permission-split.md), [0051](0051-argocd-gitops-deployment.md)

## 현황 갱신 (2026-11-17): 대시보드 빌드 이력·빌드 중 상태

- 대시보드 빌드 이력은 Gitea Actions 대신 커밋 상태 `jenkins/build`를 읽는다. k8s-manager `GET /api/gitea/repos/:owner/:repo/builds`는 main 최근 커밋과 각 커밋의 상태를 돌려준다. Jenkins 자격 증명은 필요 없다.
- 실시간 반영은 Gitea `status` 웹훅을 쓴다. 7개 저장소 웹훅이 push와 status 이벤트를 받는다. status 이벤트는 `/webhook/gitea`에 도착해 `ci:build` 소켓 이벤트로 바뀐다. 예전 Gitea Actions 폴링(`gitea:actions`)은 없앴다.
- Jenkinsfile 첫 단계(`Report pending`)가 상태를 `pending`(빌드 중)으로 남기고, post 단계가 success/failure로 덮어쓴다. 7개 저장소 모두 적용했다.
- 참고: Jenkins는 커밋 메시지의 `[skip ci]`를 무시한다(Gitea Actions와 다르다). 문서만 바꾼 커밋도 빌드·배포된다. 빌드 결과는 같으니 해롭지는 않다.

## 현황 갱신 (2026-11-17 오후): 빌드 화면 분리와 배포 대비

- 빌드 이력을 Gitea 화면에서 떼어 모니터링 웹 "빌드" 화면(`/builds`)으로 옮겼다. 빌드 대상 앱 7개를 한 표로 보여 준다: 최근 빌드 상태, Jenkins 빌드 번호(링크), 커밋, 최근 성공. 행을 펼치면 main 빌드 이력이다.
- k8s-manager `GET /api/gitea/builds`: Jenkinsfile 있는 저장소마다 `head`(main 최신 커밋), `latestBuild`(상태가 있는 최근 커밋), `lastSuccess`(최근 성공).
  - 처음엔 저장소 7개 × 커밋 10개 상태를 동시에 불러 약 55초가 걸렸다(Gitea가 몰린 요청에 느림). 저장소마다 최신 커밋부터 하나씩 보다가 둘 다 찾으면 멈추게 바꿔 약 5초가 됐다.
  - 10초 캐시와 stale-while-revalidate(오래된 값을 바로 주고 뒤에서 새로 고침)를 쓴다. status 웹훅이 오면 캐시를 무효화한다. 서버 재시작 직후 첫 조회만 약 15초다.
- 배포 상태 화면(`/deploy-status`)에 "빌드 대비" 칸을 더했다. 배포된 이미지 태그(= 커밋 SHA, 이미지 이름 = 저장소 이름)를 최근 성공 빌드와 비교한다: 최신 반영 / 배포 대기 / 빌드 중 / 빌드 실패.
  - 확인(monitoring-web #14): push 12초 뒤 빌드 중 → 94초 빌드 성공·배포 대기 → ArgoCD 웹훅 반영 후 최신 반영.
