# ADR-028. SSH(22포트) 및 code-server 코드 반영/동기화 방식

- **Status**: 확정 — Remote-SSH + Git push 경로로 운영 중 (code-server 미도입)
- **이전 Status**: 대기 중

## Context

[0012](0012-local-git-vscode-server.md)(Local Git 동기화 및 VS Code Server 구축 여부)의 후속 논의. VS Code로 서버 코드를 편집하는 방식과, 그 이전에 코드를 서버에 최초로 넣는 방법, 그리고 이 모든 것이 폐쇄망 정책과 어떻게 공존하는지를 정리함.

### 1. VS Code 접속 방식 두 가지

| 방식 | 설명 | 동기화 필요 여부 |
|---|---|---|
| **Remote-SSH** | 로컬 VS Code가 SSH(22번 포트)로 서버에 붙어서 서버 안의 폴더를 직접 열어 편집 | 파일이 처음부터 서버에만 존재 → 별도 동기화 절차 불필요 |
| **code-server** | SSH와 무관하게 HTTP/HTTPS로 브라우저에서 접속(예: `https://내부주소:8443`), Pod에 PV로 작업 디렉토리 마운트 | 마찬가지로 파일 이동 단계 없음 |

두 방식 모두 "서버 안에서 바로 편집"하는 구조라, 핵심 질문은 **"애초에 서버에 코드를 어떻게 넣느냐"**로 좁혀짐.

### 2. 서버에 코드를 최초로 넣는 방법 (실제 전송 수단)

| 방법 | 설명 |
|---|---|
| `scp` | `scp -r ./프로젝트 user@서버IP:/path/` — SSH 기반 1회성 복사 |
| `rsync` | `rsync -avz ./프로젝트/ user@서버IP:/path/` — 변경분만 재전송, 반복 동기화에 유리 |
| Git push | 로컬 → 내부 Gitea로 push, 이후 서버(code-server)에서 `git pull` — 협업 시 정석 |
| VS Code Remote-SSH 드래그앤드롭 | 내부적으로 SFTP(SSH 기반)로 자동 업로드, scp를 GUI로 하는 것과 동일 |

결론: 모든 방법은 **SSH 기반 파일 전송(scp/rsync/SFTP) 이거나 Git 프로토콜 push** 중 하나이며, Remote-SSH나 code-server는 "이미 서버에 있는 파일을 편집하는 도구"일 뿐 최초 진입점은 항상 전송 과정을 거쳐야 함.

### 3. 선행 조건 — K8s 인프라가 먼저 구축되어 있어야 함

1. 물리 서버 → K8s 클러스터(Control Plane + Worker) 구축
2. 그 위에 code-server를 Pod로 배포(PV 마운트, Ingress/NodePort로 접속경로 오픈)
3. Gitea도 Pod로 먼저 떠 있어야 push 가능

즉 현재는 "설계도" 단계이며, 실제 배포가 끝나야 코드 반영 단계로 넘어갈 수 있음.

### 4. "포트를 여러 개 여는 것"과 "폐쇄망 여부"는 별개

- 폐쇄망의 기준은 **"외부 인터넷 차단 여부"**이지 "내부 포트 개수"가 아님
- SSH(22), code-server(8443), Gitea, pgAdmin, K8s API(6443) 등은 전부 내부망(사설 IP, `192.168.x.x`) 안에서만 열리는 포트라 폐쇄망과 충돌하지 않음
- 폐쇄망을 실제로 깨는 것은 스타셀 견적서의 "공인 IP + 퍼블릭 도메인 + Let's Encrypt" 전환(외부 인터넷 노출)과 BMC 공인 IP 노출임

### 5. "내부망"의 실체 = 학교 교내망

- 서버 IP(`192.168.10.x`)는 학교 전산실이 관리하는 교내 LAN(사설 IP 대역)
- 교내망에 물린 PC는 접속 가능, 외부 인터넷(집·카페 등)에서는 사설 IP라 원천적으로 도달 불가
- 다이어그램 최상단 "외부 인터넷 | API 기본 차단"은 **교내망 ↔ 인터넷 사이의 경계(전산실 방화벽)**를 의미
- 단, 교내망도 보통 여러 서브넷(학생 Wi-Fi, 교직원망, 서버실 전용망)으로 나뉘므로, 개발자 PC가 있는 망에서 서버(`192.168.10.x`)로 실제 라우팅이 열려 있는지는 전산실 확인이 필요한 부분

## Decision

미정 — 대기 중. Remote-SSH와 code-server 중 어느 쪽(또는 둘 다)을 최종 도입할지는 [0012](0012-local-git-vscode-server.md)의 결정에 따름. 다만 아래 원칙은 확정된 전제로 채택:

- 코드 최초 반입 경로는 **SSH 기반 전송(scp/rsync/SFTP) 또는 Git push** 중 하나로 한정
- SSH(22)·code-server(8443 등)·Gitea·pgAdmin·kube-apiserver(6443) 포트는 전부 **내부망(사설 IP) 한정 개방**이며 폐쇄망 정책과 무관
- code-server/Gitea Pod 배포는 K8s 클러스터(Control Plane+Worker) 구축이 선행되어야 가능

## Consequences

- `services/gitea`([0012](0012-local-git-vscode-server.md))의 설계는 이 ADR의 "Git push 정석 경로"를 기본 흐름으로 반영해야 함.
- 개발자 PC가 속한 서브넷에서 `192.168.10.x`(서버 서브넷)로 라우팅이 열려 있는지는 전산실 확인이 필요 — [0011](0011-datacenter-info-provisioning.md), [0019](0019-security-firewall-policy-coordination.md)와 직결.
- code-server를 Pod로 배포할 경우 Ingress/NodePort 노출 경로가 필요하므로 [0007](0007-ingress-controller-choice.md), [0008](0008-network-exposure-scope.md)의 결정과 연동해야 함.
- 관련: [0012](0012-local-git-vscode-server.md), [0008](0008-network-exposure-scope.md), [0011](0011-datacenter-info-provisioning.md), [0019](0019-security-firewall-policy-coordination.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- [0012](0012-local-git-vscode-server.md) 결정대로 code-server는 도입하지 않았다. 개발자는 Remote-SSH로 접속하고 Gitea로 push한다. push하면 Gitea Actions가 빌드·배포한다([0042](0042-cicd-runner-execution.md)).
- 서버 IP는 원 문서의 가정(`192.168.10.x` 사설 대역)과 다르다. 실제로는 공인 대역 `10.0.0.20`이다. 외부 노출 통제는 Gateway 리스너와 NetworkPolicy로 한다([0008](0008-network-exposure-scope.md)).
