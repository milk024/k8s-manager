# Gitea 계정·권한 안내

> 우리 팀 코드 저장소(Gitea)를 누가, 어디까지 쓸 수 있는지 정리한 문서입니다. (2026-11-12 기준)
> 접속 주소: **https://gpu.example.ac.kr/gitea/** (학내망에서만 접속됩니다)

---

## 1. 먼저 알아 둘 용어

| 용어 | 쉬운 설명 |
|---|---|
| **Gitea** | 우리 서버에 설치한 "코드 보관소". GitHub 와 같은 역할을 하는 사내용 서비스입니다. |
| **저장소 (Repository)** | 프로젝트 하나의 코드가 들어 있는 폴더. 예: `rag-server`, `vkey-web` |
| **조직 (Organization)** | 저장소들을 묶는 단위. 우리 저장소는 모두 `myorg` 조직 안에 있습니다. |
| **팀 (Team)** | 같은 권한을 받는 사람들의 묶음. 권한은 사람이 아니라 팀 단위로 줍니다. |
| **브랜치 (Branch)** | 코드의 작업 갈래. **`main` 은 실제 서비스에 배포되는 기준 갈래**이고, 개인 작업은 별도 브랜치에서 합니다. |
| **push** | 내 PC 의 코드 변경을 Gitea 저장소에 올리는 것 |
| **PR (Pull Request)** | "내 브랜치의 변경을 main 에 합쳐 주세요" 라는 요청. 다른 사람이 검토·승인한 뒤 합칩니다(병합). |
| **승인 / 병합** | 승인 = 변경 내용을 확인하고 OK 하는 것. 병합 = 실제로 main 에 합치는 것. |
| **CI/CD** | 코드가 main 에 들어가면 자동으로 프로그램을 만들고(빌드) 서버에 반영(배포)하는 과정 |

---

## 2. 권한 단계

| 권한 | 할 수 있는 일 |
|---|---|
| **읽기 (read)** | 코드 보기, 내려받기(clone) |
| **읽기 + 이슈·PR** | 코드 보기 + 문제 등록(이슈) + 변경 요청(PR) 올리기. **main 에 직접 반영은 불가** |
| **쓰기 (write)** | 코드를 저장소에 직접 올리기(push) |
| **관리자 (admin)** | 쓰기 + 저장소 설정 변경, PR 승인·병합 |
| **소유자 (owner)** | 조직 전체 관리 (팀·사람 추가/삭제 등) |

---

## 3. 저장소 구분

| 구분 | 저장소 | 설명 |
|---|---|---|
| **RAG 서비스** | `rag-server`, `rag-web` | 실제 서비스 프로그램. main 에 합쳐지면 **자동으로 운영 서버에 배포**됩니다. |
| **RAG 모듈** (10개) | system: `rag-system-tc`, `rag-system-te` · network: `rag-network-router`, `rag-network-comm` · database: `rag-database-dbmanager`, `rag-database-data` · embedding: `rag-embedding-rag`, `rag-embedding-model` · util: `rag-util-parsers`, `rag-util-logs` | rag-server 가 가져다 쓰는 부품 코드. 이름 규칙 `rag-대분류-소분류` (2026-11-12 변경, 아래 표 참고) |
| **vkey 서비스** | `vkey-server`, `vkey-web` | 실제 서비스 프로그램. 반영되면 자동 배포됩니다. |
| **인프라** | `k8s-manager`, `monitoring-web`, `admin-manager` | 서버 관리·모니터링 대시보드 |
| **배포 기준 저장소** | `deploy-rag`, `deploy-vkey`, `deploy-infra` | "지금 서버에 무엇이 어떤 설정으로 떠 있어야 하는지" 를 적어 둔 곳. 여기를 바꾸면 서버가 자동으로 그 상태로 맞춰집니다. |

### RAG 모듈 이름 변경 (2026-11-12)

| 예전 이름 | 새 이름 |
|---|---|
| `rag-task-controller` | `rag-system-tc` |
| `rag-task-executor` | `rag-system-te` |
| `rag-router` | `rag-network-router` |
| `rag-server-communication` | `rag-network-comm` |
| `rag-db-manager` | `rag-database-dbmanager` |
| `rag-session-data`, `rag-api-data`, `rag-request-board` | `rag-database-data` (하나로 통합, import 이름은 그대로) |
| `rag-modules` | `rag-embedding-rag` |
| `rag-embedde` | `rag-embedding-model` |
| `rag-parser` | `rag-util-parsers` |
| (새로 만듦) | `rag-util-logs` |
| `rag-hwpx-parser` | 삭제 (통합 파서 `rag-util-parsers` 사용) |

- 예전 주소로 clone·push 해도 Gitea 가 새 주소로 넘겨 주지만, 헷갈리지 않게 바꿔 두세요: `git remote set-url origin https://gpu.example.ac.kr/gitea/myorg/<새 이름>.git`
- `rag-api-data`, `rag-request-board` 는 보관(읽기 전용) 상태입니다. 수정은 `rag-database-data` 에서 하세요.

---

## 4. 사람별 권한

| 이름 | 계정 | 소속 팀 | 할 수 있는 일 |
|---|---|---|---|
| 양진형 | `gitea_admin` (공용) | Owners | 조직 전체 관리 (소유자) |
| 교수님 | `gitea_admin` (공용) | Owners | 조직 전체 관리 (소유자) |
| 담당자 E | `dev5` | rag·vkey·infra 관리자 | **모든 저장소 관리자** (후임 관리자). rag·vkey PR 승인, 인프라 배포 저장소 직접 수정 |
| 담당자 B | `dev2` | rag 관리자 | RAG 저장소 13개 관리자 (서비스·모듈·deploy-rag). rag PR 승인 |
| 담당자 C | `dev3` | vkey 관리자 | vkey 저장소 3개 관리자 (vkey-server·vkey-web·deploy-vkey). vkey PR 승인 |
| 담당자 D | `dev4` | rag 개발 | RAG 모듈 10개 쓰기 (rag-server·rag-web·deploy-rag 반영은 rag 관리자) |
| 담당자 F | `dev6` | rag 개발 | 위와 같음 |
| 담당자 G | `dev7` | rag 개발 | 위와 같음 |
| 담당자 H | `dev8` | rag 개발 | 위와 같음 |
| 담당자 A | `dev1` | vkey 개발 | vkey-server·vkey-web 쓰기 (브랜치 push + PR, main 반영은 vkey 관리자 승인) |

> 공용 계정 `gitea_admin` 은 관리자 전용입니다. 개발 작업은 **반드시 개인 계정(devN)** 으로 해 주세요.

---

## 5. 꼭 지켜야 하는 규칙

### rag-server · rag-web (RAG 서비스)
- **main 에 직접 올릴 수 없습니다.** 브랜치에서 작업 → PR 올리기 → **rag 관리자(담당자 B·담당자 E) 1명 승인** → 병합 → 자동 배포
- 본인이 올린 PR 은 본인이 승인할 수 없습니다. 같은 팀의 다른 관리자가 승인합니다.

### vkey-server · vkey-web (vkey 서비스)
- **main 에 직접 올릴 수 없습니다.** 브랜치에서 작업 → PR → **vkey 관리자(담당자 C·담당자 E) 1명 승인** → 병합 → 자동 배포 (2026-11-12 부터)

### RAG 모듈 10개
- rag 개발자는 **직접 push** 할 수 있습니다. (모듈은 바로 배포되지 않고, rag 관리자가 rag-server 를 다시 빌드할 때 반영됩니다)
- rag 개발자는 rag-server·rag-web·deploy-rag 에 접근하지 않습니다. 서비스 반영·배포는 rag 관리자가 합니다.

### 배포 기준 저장소 (deploy-*)
| 저장소 | 규칙 |
|---|---|
| `deploy-rag` | PR + rag 관리자 1명 승인 |
| `deploy-vkey` | PR + vkey 관리자 1명 승인 |
| `deploy-infra` | 인프라 담당(양진형·담당자 E)이 승인 없이 직접 수정 |

- 버전 번호(이미지 태그)는 자동화 계정이 알아서 바꿉니다. 사람이 손댈 일은 설정 변경 정도입니다.

### 공통
- **비밀번호·토큰 같은 비밀값은 절대 코드에 넣지 않습니다.**
- 서버에서 직접 설정을 고치지 마세요. 배포 기준 저장소 내용으로 몇 초 안에 자동으로 되돌아갑니다.

---

## 6. 사람이 아닌 계정 (자동화용)

사람 대신 정해진 일만 하는 계정입니다. 로그인용이 아니라 **토큰(전용 열쇠)** 으로만 동작합니다.

| 계정 | 하는 일 |
|---|---|
| `rag-ci` | RAG 서비스를 자동으로 빌드하고 결과물(이미지)을 올림 |
| `vkey-ci` | vkey 서비스를 자동으로 빌드하고 결과물을 올림 |
| `infra-ci` | 인프라 서비스를 자동으로 빌드하고, `deploy-infra` 의 버전 번호를 갱신 |
| `k8s-manager-svc` | 모니터링 대시보드가 저장소 목록·빌드 결과를 읽어 오는 용도 |
| `gitea-mgmt-svc` | 계정·팀 발급 자동화용 (관리 서버 준비 중, 아직 사용 안 함) |

> 각 계정은 **자기 일에 필요한 저장소만** 접근할 수 있게 나눠 두었습니다. 하나가 노출돼도 피해가 그 범위에서 멈추게 하기 위해서입니다.

---

## 7. 코드가 서버에 반영되는 흐름

```
① 개발자가 브랜치에서 작업 후 PR
② 관리자가 승인 → main 에 병합
③ 자동 빌드 (프로그램 이미지 생성)
④ 배포 기준 저장소의 버전 번호 갱신
⑤ ArgoCD(자동 배포 도구)가 감지해서 서버에 반영
```

- 모든 서비스(rag·vkey·인프라)가 ⑤ 까지 자동입니다. (2026-11-12 전환)
- 배포 설정(환경변수, 개수 등)을 바꾸려면 소스 저장소의 `k8s/` 폴더가 아니라 **배포 기준 저장소(deploy-rag / deploy-vkey / deploy-infra)** 에 PR 을 올립니다.

---

## 8. 처음 시작하기

1. 관리자에게 받은 **계정 이름(devN)과 초기 비밀번호**로 https://gpu.example.ac.kr/gitea/ 에 로그인
2. 첫 로그인 때 **비밀번호를 새로 정하기** (8자 이상). 바꾸기 전에는 코드 내려받기·올리기가 안 됩니다.
3. 내 PC 의 저장소 주소를 새 주소로 바꾸기 (저장소 폴더에서 실행)

```bash
git remote set-url origin https://gpu.example.ac.kr/gitea/myorg/<저장소이름>.git
```

4. 예전 공용 계정 로그인 정보가 PC 에 남아 있으면 지우기
   - Windows: 제어판 → 자격 증명 관리자 → Windows 자격 증명 → `git:http://10.0.0.23` 삭제

---

## 9. 자주 묻는 질문

**Q. main 에 push 했는데 거부돼요.**
rag-server·rag-web·vkey-server·vkey-web·deploy-rag·deploy-vkey 는 main 직접 push 가 막혀 있습니다. vkey 개발자는 새 브랜치에 올리고 PR 을 만들어 주세요. rag 개발자는 모듈 저장소에서만 작업합니다.

**Q. PR 승인은 누구에게 받나요?**
rag → 담당자 B 또는 담당자 E / vkey → 담당자 C 또는 담당자 E

**Q. 저장소가 안 보여요.**
소속 팀에 연결된 저장소만 보입니다. 필요한 저장소가 있으면 관리자에게 요청하세요.

**Q. 비밀번호를 잊어버렸어요 / 새 계정이 필요해요.**
관리자(양진형·담당자 E)에게 요청하세요.

**Q. 예전 GitHub(MyorgRagDocumentAssistant)에 올려도 되나요?**
안 됩니다. 2026-11-12 부터 RAG 모듈은 Gitea 기준으로 빌드됩니다. GitHub 에 올린 내용은 서비스에 반영되지 않습니다.
