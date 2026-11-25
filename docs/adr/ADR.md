# ADR — k8s_manager 아키텍처 결정 기록 (인덱스)

번호는 작성 순서(파일명 고정)이고, 아래 목차는 주제별로 재구성한 것이다. 상태 열은 각 문서 Status의 요약이며, 세부 내용은 문서 본문의 `현황 갱신` 절을 본다.

- 최종 정리: 2026-11-12 (실제 클러스터 조회 기준으로 Status 갱신)
- 총 52건 — 확정 28 · 부분 확정 7 · 제안 2 · 대기/조사 15

## 우선 처리 필요 (리스크 높은 순)

| 순위 | 항목 | 관련 ADR |
|---|---|---|
| 1 | 커널 146 전환 전 HighPoint `hptnvme` 드라이버 재빌드 (미실시). 지금은 GRUB으로 136 고정이라 재부팅해도 136으로 정상 부팅, 146으로 부팅할 때만 실패. 보안 패치가 136에서 멈춘 상태 | [0044](0044-kernel-pin-highpoint-driver.md) |
| 2 | `ai-gateway`(.22), `kserve-ingress-gateway`(.21) 무인증 공개 노출 확인·차단 | [0008](0008-network-exposure-scope.md), [0034](0034-litellm-proxy-role.md) |
| 3 | Alertmanager receiver 연결, Prometheus를 NFS 밖으로 이전 | [0020](0020-logging-monitoring-system.md), [0017](0017-incident-response-sla.md) |
| 4 | etcd·Postgres·Gitea 백업 자동화 및 복구 리허설 | [0016](0016-backup-recovery-policy.md), [0023](0023-etcd-backup-policy.md) |
| 5 | ResourceQuota/LimitRange, DB Pod requests/limits 지정 | [0014](0014-rbac-networkpolicy-scope.md) |
| 6 | CI Runner DinD 이미지·빌드 캐시 정리 정책 (OS 디스크에 약 248GB 누적) | [0042](0042-cicd-runner-execution.md), [0049](0049-rag-model-base-image.md) |
| 7 | 월 1회 수동 패치 창 확정 | [0043](0043-os-auto-update-disabled.md) |

## 목차

1. [네트워크 & 접근 경로](#1-네트워크--접근-경로)
2. [인증 · 보안 · RBAC](#2-인증--보안--rbac)
3. [배포 아키텍처](#3-배포-아키텍처)
4. [개발 환경 & CI/CD](#4-개발-환경--cicd)
5. [모니터링 & 로깅](#5-모니터링--로깅)
6. [백업 · 복구 · DR](#6-백업--복구--dr)
7. [운영 · 패치 · 장애 대응](#7-운영--패치--장애-대응)
8. [운영 거버넌스 & 계약](#8-운영-거버넌스--계약)
9. [컴플라이언스](#9-컴플라이언스)
10. [인프라 배포(Helm/이미지/문서화)](#10-인프라-배포helm이미지문서화)
11. [스토리지](#11-스토리지)
12. [vLLM/서빙 · 모델 운영](#12-vllm서빙--모델-운영)
13. [하드웨어 사양](#13-하드웨어-사양)

---

## 1. 네트워크 & 접근 경로

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 005 | 접근 경로: 사설 도메인(hosts 파일 매핑) + Ingress Host/Path 라우팅 | 확정 | [0005-domain-routing-strategy.md](0005-domain-routing-strategy.md) |
| 006 | TLS 인증서 발급 주체 | 확정 | [0006-tls-certificate-authority.md](0006-tls-certificate-authority.md) |
| 007 | Ingress Controller 선택 | 확정 | [0007-ingress-controller-choice.md](0007-ingress-controller-choice.md) |
| 008 | 외부 네트워크 노출 범위 | 부분 확정 | [0008-network-exposure-scope.md](0008-network-exposure-scope.md) |
| 011 | 전산실 필요 정보 제공 | 대기 중 | [0011-datacenter-info-provisioning.md](0011-datacenter-info-provisioning.md) |
| 019 | 보안 인증/방화벽 정책 전산실 협의 | 대기 중 | [0019-security-firewall-policy-coordination.md](0019-security-firewall-policy-coordination.md) |
| 030 | Gateway 연동 및 외부 접속 IP 방식 | 확정 | [0030-gateway-external-ip.md](0030-gateway-external-ip.md) |

## 2. 인증 · 보안 · RBAC

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 002 | 실행 환경 및 인증 방식: in-cluster ServiceAccount | 확정 | [0002-in-cluster-auth.md](0002-in-cluster-auth.md) |
| 009 | 관리자 및 유지보수 권한에 대한 책임 소재 | 대기 중 | [0009-admin-maintenance-responsibility.md](0009-admin-maintenance-responsibility.md) |
| 014 | 내부 RBAC, Ingress & Egress, Network Policy 판단 | 부분 확정 | [0014-rbac-networkpolicy-scope.md](0014-rbac-networkpolicy-scope.md) |
| 046 | GITEA_TOKEN을 Helm 템플릿 밖의 별도 Secret으로 분리 | 확정 | [0046-helm-external-secret.md](0046-helm-external-secret.md) |
| 050 | Gitea 계정·권한 분리와 단일 주소(gpu.example.ac.kr/gitea) | 확정·운영 중 | [0050-gitea-account-permission-split.md](0050-gitea-account-permission-split.md) |

## 3. 배포 아키텍처

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 004 | Local Ops GUI 배포 방식: 별도 저장소 + 같은 namespace 별도 Pod | 확정 | [0004-gui-deployment-strategy.md](0004-gui-deployment-strategy.md) |
| 013 | 내부 서비스 등록 | 대기 중 | [0013-internal-service-registration.md](0013-internal-service-registration.md) |
| 021 | 개발/운영 환경 분리 여부 | 대기 중 | [0021-dev-prod-environment-separation.md](0021-dev-prod-environment-separation.md) |
| 022 | Control Plane/Worker 단일 구성 SPOF 리스크 인지 | 인지·대응 계획 수립 | [0022-control-plane-spof-risk.md](0022-control-plane-spof-risk.md) |
| 038 | Namespace 생성 및 배포 Phase 순서 | 완료 | [0038-namespace-deployment-phasing.md](0038-namespace-deployment-phasing.md) |

## 4. 개발 환경 & CI/CD

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 003 | 런타임 버전 고정 | 확정 | [0003-runtime-versions.md](0003-runtime-versions.md) |
| 012 | Local Git 동기화 및 VS Code Server 구축 여부 | 결정됨 | [0012-local-git-vscode-server.md](0012-local-git-vscode-server.md) |
| 028 | SSH(22포트) 및 code-server 코드 반영/동기화 방식 | 확정 | [0028-ssh-code-server-access-and-sync.md](0028-ssh-code-server-access-and-sync.md) |
| 041 | simple-git / child_process(GPU·npm·pip·helm) 연동 항목 폐기 | 확정 | [0041-simple-git-child-process-integration-discarded.md](0041-simple-git-child-process-integration-discarded.md) |
| 042 | CI/CD 빌드 실행 방식 (Gitea Actions + Runner Pod) | 대체됨 (빌드 052, 배포 051) | [0042-cicd-runner-execution.md](0042-cicd-runner-execution.md) |
| 051 | 서비스 배포를 ArgoCD GitOps로 전환 | 확정·운영 중 | [0051-argocd-gitops-deployment.md](0051-argocd-gitops-deployment.md) |
| 052 | CI를 Gitea Actions에서 Jenkins(Kaniko)로 전환, 팀별 빌드 네임스페이스 | 확정·운영 중 | [0052-jenkins-ci.md](0052-jenkins-ci.md) |
| 053 | 모니터링 웹 접근 통제(관리자 로그인)와 운영 화면 | 확정·운영 중 | [0053-monitoring-web-access-and-ops-screens.md](0053-monitoring-web-access-and-ops-screens.md) |

## 5. 모니터링 & 로깅

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 001 | 리소스 모니터링 대상: 호스트 레벨 대신 Pod 레벨 | 확정 | [0001-monitoring-scope-pod-vs-host.md](0001-monitoring-scope-pod-vs-host.md) |
| 020 | 로그/모니터링 체계(설계) | 부분 확정 | [0020-logging-monitoring-system.md](0020-logging-monitoring-system.md) |
| 047 | 대시보드 실시간 데이터 전달: REST 폴링 대신 socket.io push | 확정 | [0047-realtime-socket-push.md](0047-realtime-socket-push.md) |

## 6. 백업 · 복구 · DR

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 016 | 데이터 백업 및 복구 정책(설계) | 대기 중 | [0016-backup-recovery-policy.md](0016-backup-recovery-policy.md) |
| 023 | etcd 백업/스냅샷 정책 | 대기 중 | [0023-etcd-backup-policy.md](0023-etcd-backup-policy.md) |
| 024 | Persistent Volume/스토리지 이중화 방안 | 대기 중 | [0024-pv-storage-redundancy.md](0024-pv-storage-redundancy.md) |
| 027 | 재해복구(DR) 계획 | 대기 중 | [0027-disaster-recovery-plan.md](0027-disaster-recovery-plan.md) |
| 045 | 멀티노드 전환 계획 및 서비스 등급별 RTO/RPO 목표 | 제안 | [0045-multinode-transition-rto-rpo.md](0045-multinode-transition-rto-rpo.md) |

## 7. 운영 · 패치 · 장애 대응

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 017 | 장애 대응 주체 및 SLA 정의 | 대기 중 | [0017-incident-response-sla.md](0017-incident-response-sla.md) |
| 043 | OS 자동 업데이트 비활성화 및 수동 패치 정책 | 확정 | [0043-os-auto-update-disabled.md](0043-os-auto-update-disabled.md) |
| 044 | 커널 버전 고정 및 HighPoint RAID 드라이버 재빌드 선행 조건 | 부분 확정 | [0044-kernel-pin-highpoint-driver.md](0044-kernel-pin-highpoint-driver.md) |

## 8. 운영 거버넌스 & 계약

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 010 | 사업1, 사업2 솔루션 설명 | 대기 중 | [0010-solution-briefing.md](0010-solution-briefing.md) |
| 015 | 1안/2안 방향 결정 및 일정 조율 | 대기 중 | [0015-construction-plan-decision.md](0015-construction-plan-decision.md) |
| 018 | 외주업체 계약 종료 후 유지보수 범위(계약 조건) | 대기 중 | [0018-vendor-maintenance-scope.md](0018-vendor-maintenance-scope.md) |

## 9. 컴플라이언스

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 025 | 모델/데이터 라이선스 검토 | 대기 중 | [0025-model-data-license-review.md](0025-model-data-license-review.md) |
| 026 | 개인정보/데이터 거버넌스 검토 | 대기 중 | [0026-privacy-data-governance.md](0026-privacy-data-governance.md) |

## 10. 인프라 배포(Helm/이미지/문서화)

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 029 | 인프라 배포 방식: Helm Chart 채택 | 확정 | [0029-helm-chart-deployment-strategy.md](0029-helm-chart-deployment-strategy.md) |
| 036 | 컨테이너 이미지 저장소 선정 (Docker Hub vs 자체 구축) | 확정 | [0036-container-registry-selection.md](0036-container-registry-selection.md) |
| 037 | 문서화 방침 | 확정 | [0037-documentation-policy.md](0037-documentation-policy.md) |
| 039 | 컨테이너 이미지 빌드 컨벤션 (Node.js 서비스) | 확정 | [0039-docker-image-build-convention.md](0039-docker-image-build-convention.md) |

## 11. 스토리지

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 031 | 스토리지 솔루션 및 용량 계획 | 부분 확정 | [0031-storage-solution.md](0031-storage-solution.md) |

## 12. vLLM/서빙 · 모델 운영

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 032 | vLLM Replica 스케줄링 및 분산 처리 범위 | 확정 | [0032-vllm-replica-scheduling-scope.md](0032-vllm-replica-scheduling-scope.md) |
| 033 | 임베딩(EMB) 모델 서빙 가능 여부 | 부분 확인 | [0033-embedding-model-serving-feasibility.md](0033-embedding-model-serving-feasibility.md) |
| 034 | LiteLLM Proxy 기능/역할 확인 | 확정 | [0034-litellm-proxy-role.md](0034-litellm-proxy-role.md) |
| 035 | 대용량 모델 운영 방식 | 확정 | [0035-large-model-operations.md](0035-large-model-operations.md) |
| 048 | rag-server 모델 가중치: 이미지에 넣지 않고 PVC에 두고 마운트 | 제안 | [0048-model-weights-on-pvc.md](0048-model-weights-on-pvc.md) |
| 049 | RAG 모델(임베딩·리랭커·OCR)을 베이스 이미지에 포함하고 서버에서 빌드 | 확정·운영 중 | [0049-rag-model-base-image.md](0049-rag-model-base-image.md) |

## 13. 하드웨어 사양

| # | 제목 | 상태 | 파일 |
|---|---|---|---|
| 040 | 단일 서버 하드웨어 사양 (검토 요청) | 확정 | [0040-single-server-hardware-spec.md](0040-single-server-hardware-spec.md) |

---

## 변경 이력

- 2026-11-03: 번호 중복 해소 — `0041-cicd-runner-execution.md` → `0042-cicd-runner-execution.md`(0041은 simple-git 폐기 문서로 유지), 참조 링크 수정
- 2026-11-03: 0001~0042 중 24건 Status를 실제 클러스터 상태로 갱신(각 문서에 `이전 Status`와 `현황 갱신` 절 추가)
- 2026-11-03: 신규 0043~0047 추가(자동 업데이트 비활성화, 커널 고정, 멀티노드 전환 RTO/RPO, Helm Secret 분리, socket push)
- 2026-11-17: 신규 0053(모니터링 웹 접근 통제·운영 화면), 0047·0050·0051·0052 현황 갱신
- 2026-11-16: 신규 0052(Jenkins CI 전환), 0042 대체됨
- 2026-11-12: 신규 0050(Gitea 계정·권한 분리), 0051(ArgoCD GitOps 전환) 추가, 0014·0036·0042 현황 갱신
- 2026-11-05: 신규 0048(모델 가중치 PVC 이전, 제안)·0049(RAG 모델 베이스 이미지 포함·서버 빌드, 운영 중) 추가, 0035 확정, 0020·0031·0036·0042·0044 현황 갱신

## 출처 매핑

- `0001~0008`, `0028`: `k8s_manager` 자체 설계 논의에서 도출
- `0009~0027`(0012 제외 재확인): `시스템 구축 방안 검토 보고서`의 "구축 전 고려사항" 23개 항목 기반
- 보고서 항목 중 신규 ADR 없이 기존 항목으로 이미 커버된 것: #3(→0008), #6(→0008), #7(→0005/0008), #19(→0006/0007)
- `0029~0038`: 외부 회의(인프라 배포 전략 회의) 기록 기반
- `0039`: 별도 전달받은 `Docker 컨테이너 이미지 빌드 방식 가이드라인(초안)` 기반, `0036`은 같은 자료로 대기 중 → 확정으로 갱신
- `0040`: `서버 환경 테스트_20260803` 질의서 기반, `0030`은 같은 자료의 IP 개수 요청 표로 Context 보강
- `0041~0042`: 체크리스트 2-3, 2-6 재검토
- `0043~0044`: 2026-10-11 NFS 장애 대응 및 후속 조치
- `0045`: `멀티노드_전환_다운타임_RTO_RPO_v2.docx` 보고서
- `0046~0047`: `k8s_manager` 커밋 `46a36f4`, `dce898c`, `38e0353`
- `0050~0051`: 2026-11-10~12 Gitea 권한 분리·ArgoCD 전환 작업 (deploy-infra/rag/vkey 저장소, terraform_infra `rbac/dev-teams-no-deploy`)
- `0053`: 2026-11-17 운영 체크리스트 8번(monitoring-web) 작업 — k8s-manager·admin-manager·monitoring-web·deploy-infra 커밋
- `0048~0049`: rag-server 커밋 `f3736bf`, `rag-model-base:v5`, PC 빌드·push 실패 조사
