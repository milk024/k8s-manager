# ADR-050. Gitea 계정·권한 분리와 단일 주소(gpu.example.ac.kr/gitea)

- **Status**: 확정·운영 중 (2026-11-10 ~ 11-12)

## Context

- Gitea(조직 `myorg`)를 공용 계정 `gitea_admin` 하나로 모두 쓰고 있었다. 누가 무엇을 바꿨는지 구분할 수 없었다. 이 계정의 토큰이 CI와 서비스 곳곳에 들어 있어서, 하나만 새도 전체 저장소가 노출되는 구조였다.
- rag 모듈 12개는 GitHub 조직 `MyorgRagDocumentAssistant`에 있었다. 빌드 때마다 GitHub에서 받아 와서 기준 저장소가 두 곳이었다.
- Gitea는 IP(`10.0.0.23`) HTTP로 접속했다. 도메인은 추가로 받을 수 없어서 `gpu.example.ac.kr` 하나를 대시보드와 나눠 써야 했다.

## Decision

1. **사람 계정은 개인별로 만든다.**
   - 개인 계정: `dev1`~`dev8`. 초기 비밀번호는 무작위이고, 첫 로그인 때 바꿔야 한다.
   - `gitea_admin`: Owners 전용으로만 남긴다. 토큰은 0개로 유지한다.
2. **권한은 팀 단위로 준다.** 관리자 팀을 사업별로 나눈다.

   | 팀 | 구성원 | 권한 |
   |---|---|---|
   | `rag-maintainers` | dev2, dev5 | rag 서비스, 모듈 12개, `deploy-rag` 관리자 |
   | `vkey-maintainers` | dev3, dev5 | vkey 서비스, `deploy-vkey` 관리자 |
   | `infra-maintainers` | dev5 | `k8s-manager`, `monitoring-web`, `admin-manager`, `deploy-infra` 관리자 |
   | `rag-modules` | dev4, 6, 7, 8 | 모듈 12개 쓰기 |
   | `rag-deploy` | dev4, 6, 7, 8 | `rag-server`, `rag-web`, `deploy-rag`에 읽기와 PR |
   | `vkey-system` | dev1 | `vkey-server`, `vkey-web` 쓰기 |
   | `vkey-deploy` | dev1 | `deploy-vkey`에 읽기와 PR |

3. **main 브랜치 보호 규칙**
   - `rag-server`, `rag-web`, `deploy-rag`: 직접 push를 막는다. 해당 maintainers 1명이 승인해야 병합할 수 있다.
   - `deploy-vkey`: 같은 규칙에 vkey-maintainers 승인이 필요하다.
   - 병합 허용 목록에는 Owners도 넣는다(사용자 결정).
   - `deploy-infra`: 인프라 담당이 1~2명이라 승인 없이 직접 push한다. push는 `infra-ci`, infra-maintainers, Owners만 할 수 있다.
4. **자동화 계정은 용도별로 따로 두고, 권한은 최소로 준다.**
   - CI 토큰은 모든 CI job에 노출되므로 권한을 최소로 둔다.

     | 계정 | 권한 |
     |---|---|
     | `rag-ci`, `vkey-ci`, `infra-ci` | 코드 읽기 + 패키지(이미지) 쓰기 + 자기 `deploy-*` 저장소 push만 |

   - 런타임 서비스 계정은 넓은 권한을 받는 대신, 토큰을 클러스터 Secret에만 둔다.

     | 계정 | 용도 |
     |---|---|
     | `k8s-manager-svc` | 대시보드 연동 |
     | `gitea-mgmt-svc` | 계정 발급 자동화, site admin. admin-manager가 사용 (2026-11-17~, 아래 현황 갱신) |

5. **rag 모듈 기준 저장소를 Gitea로 옮긴다.** GitHub 모듈 12개를 `myorg/rag-*`로 옮기고, rag-server 빌드는 Gitea 모듈만 쓴다(2026-11-12 전환). GitHub 저장소는 보관(archive) 예정이다.
6. **접속 주소를 `https://gpu.example.ac.kr/gitea/`로 정한다.**
   - 경로는 대시보드 `/`, Gitea `/gitea`, k8s_manager API `/api-k8s-m`으로 나눈다.
   - 예전 HTTP 주소 `/myorg`는 새 주소로 301 리다이렉트한다.
   - 컨테이너 레지스트리 `/v2`는 경로 앞에 붙일 수 없어서 루트에 둔다.
7. **컨테이너 레지스트리는 Gitea 내장 레지스트리를 계속 쓴다.** Harbor는 도입하지 않는다(2026-11-12 결정, [0036](0036-container-registry-selection.md)).

## Consequences

- 변경 이력이 개인 계정으로 남는다. 자동화 토큰 하나가 새도 피해는 그 계정의 저장소 범위에서 멈춘다.
- **남은 위험**
  - Gitea 레지스트리의 패키지 쓰기 권한은 조직 전체 단위다. 그래서 어떤 CI 토큰으로든 `myorg`의 모든 이미지를 덮어쓸 수 있다.
  - 이미지 주소가 아직 `10.0.0.23:80/...`이라서 HTTP `/v2`를 닫지 못했다.
  - `gitea_admin` 비밀번호 변경과 2단계 인증 적용이 남아 있다.
- 사용자 안내 문서: `docs/gitea-permissions-notion.md`
- 관련: [0042](0042-cicd-runner-execution.md), [0051](0051-argocd-gitops-deployment.md), [0014](0014-rbac-networkpolicy-scope.md)

## 현황 갱신 (2026-11-12 저녁)

- **RAG 모듈 저장소 이름 규칙**: `rag-<대분류>-<소분류>`. 대분류는 system, network, database, embedding, util이다.
  - system: `rag-system-tc`, `rag-system-te`
  - network: `rag-network-router`, `rag-network-comm`
  - database: `rag-database-dbmanager`, `rag-database-data`
  - embedding: `rag-embedding-rag`, `rag-embedding-model`
  - util: `rag-util-parsers`, `rag-util-logs`(새로 만든 빈 저장소)
- `rag-api-data`·`rag-session-data`·`rag-request-board`는 `rag-database-data` 하나로 합쳤다. 커밋 이력은 보존했고 import 이름도 그대로다. 예전 두 저장소(api-data, request-board)는 보관(archive) 처리했다.
- `rag-hwpx-parser`는 삭제했다. 통합 파서 `rag-util-parsers`가 hwpx를 처리한다. 백업은 관리 PC의 `Desktop/repo-backup`에 mirror로 남겼다.
- **dev1~dev8 비밀번호(사용자 결정)**: 8명 모두 같은 비밀번호로 설정하고, 첫 로그인 때 비밀번호를 바꾸도록 강제하는 설정을 껐다.
  - 위험: 서로의 계정으로 로그인할 수 있다. 그러면 "다른 관리자 1명 승인" 규칙을 피할 수 있다.
  - 후속 조치: 각자 비밀번호를 바꾸도록 안내하고, 관리자 계정(dev2·dev3·dev5)에는 2단계 인증을 적용한다.
- CI·서비스 계정(`rag-ci`, `vkey-ci`, `infra-ci`, `k8s-manager-svc`, `gitea-mgmt-svc`)은 비밀번호 일괄 변경에서 뺐다.
- **팀 정리 (같은 날)**: `rag-deploy`, `vkey-deploy` 팀을 삭제했다. 배포 반영은 maintainers만 한다는 원칙에 맞춘 것이다.
  - rag 개발자(dev4·6·7·8)는 모듈 저장소에만 쓰기 권한을 가진다. rag-server·rag-web·deploy-rag에는 접근하지 않는다. 모듈 변경은 maintainers가 rag-server를 다시 빌드할 때 운영에 반영된다.
  - vkey-server·vkey-web의 main도 rag-server와 같은 규칙으로 보호한다: 직접 push 금지, vkey-maintainers 1명 승인, 병합은 Owners·vkey-maintainers만.
  - vkey 개발자(dev1)는 브랜치에 push하고 PR을 올린다. vkey는 모듈 저장소가 따로 없어서 개발자가 서비스 저장소에서 직접 작업하기 때문이다.

## 현황 갱신 (2026-11-17): admin-manager Gitea 관리

- admin-manager가 `gitea-mgmt-svc` 토큰(Secret `infra/admin-manager-gitea-mgmt`)으로 Gitea 사용자·팀을 관리한다. 화면은 monitoring-web `/admin` → Gitea 사용자 탭이다.
- **할 수 있는 것**: 사용자 생성(임시 비밀번호, 첫 로그인 때 변경 강제, 팀 지정), 로그인 차단/허용, 비밀번호 초기화, 팀 구성원 추가/제거.
- **하지 않는 것**: 사용자 삭제, 팀·저장소 생성/삭제, 팀 권한 변경. 이 작업은 Gitea 화면에서 `gitea_admin`으로 한다.
- **보호**: site admin(`gitea_admin`, `gitea-mgmt-svc`)과 보호 팀(`Owners`, `ci-*`, `svc-*`)의 구성원은 어떤 변경도 거부한다. 보호 팀의 구성원 추가/제거도 거부한다. 판정은 매 요청마다 Gitea의 현재 상태로 한다. 그래서 관리 화면이 탈취되더라도 CI·서비스 계정과 Owners는 건드릴 수 없다.
- 임시 비밀번호는 응답으로 한 번만 보여 주고, 저장·로그·이력에 남기지 않는다. 모든 변경은 admin-manager `audit_log`에 `gitea.*`로 기록한다.
- 남은 위험: maintainers 팀(저장소 admin)에는 이 화면에서 구성원을 넣을 수 있다. 관리자 로그인이 곧 maintainers 부여 권한이라는 뜻이므로, 대시보드 MFA를 다시 검토할 근거가 된다.
