# ADR-045. 멀티노드 전환 계획 및 서비스 등급별 RTO/RPO 목표

- **Status**: 제안 (보고서 v2 작성 완료, 승인 대기) — 수치는 예측 목표이며 VM 리허설 실측 후 확정

## Context

- 현재는 단일 노드 kubeadm 클러스터다. 노드 `super` 1대가 Control Plane, Worker, NFS 서버, GPU 4장을 모두 맡는다([0022](0022-control-plane-spof-risk.md)).
- 2026-10-11 NFS 장애(26시간 19분, [0043](0043-os-auto-update-disabled.md))로 SPOF 위험이 실제로 확인됐다.
- 배포도 위험했다. Helm 업그레이드가 부분 실패하면서 GITEA_TOKEN이 초기화됐다([0046](0046-helm-external-secret.md)).
- 백업·복구 절차가 검증되지 않아 장애 시 복구 시점을 보장할 근거가 없다([0016](0016-backup-recovery-policy.md)).
- 노드를 추가하면 현재 방식(노드 로컬 `crictl import`, Gitea 레지스트리 HTTP)으로는 이미지를 배포할 수 없다.

## Decision

### 1. 전환 순서 (크리티컬 패스, 여유 시간 0)

CI/CD와 이미지 분배를 먼저 정비하고, 백업·복구를 검증한 뒤 노드를 나눈다. 두 작업을 동시에 하면 장애 원인을 구분할 수 없다.

| 단계 | 내용 | 시점 |
|---|---|---|
| CP-1 | Harbor 구축 (공용 이미지 레지스트리) | 1주 |
| CP-2 | Jenkins + Kaniko 파일럿 (비특권 빌드, CI 전용 계정 분리) | 2주 |
| CP-3 | 전체 저장소 파이프라인 전환, 전 워크로드 Harbor 이미지 사용 | 3주 |
| CP-4 | ArgoCD 도입, 매니페스트 저장소 분리 | 4주 |
| CP-5 | 백업 자동화(etcd, Postgres, Gitea) + 복구 리허설 | 5주 |
| CP-6 | VM 기반 멀티노드 리허설 | 6~7주 |
| CP-7 | 실제 전환(CP 분리, Worker 추가, GPU 노드 전환) | 8주 |

- 투입 인력: 2명(리드 1, 보조·학습 1) + AI 에이전트, 1인 1일 4시간. 총 약 8주(6~10주)
- 복구 수단이 확보되기 전(CP-5 완료 전)에는 서비스를 중단하는 작업을 하지 않는다.

### 2. 예상 다운타임 (보수적, 누적 최대 약 20~28시간)

| 작업 | 최대 다운타임 |
|---|---|
| 빌드·배포 파이프라인 전환 | 서비스당 8시간 |
| Gitea 이전 | 4시간 |
| 대시보드 | 2시간 |
| GPU 노드 전환 | 8시간 (GPU 서비스 전체) |
| 워크로드 이전 | 서비스당 1시간 (vLLM은 모델 로딩 포함 2시간) |
| Control Plane 분리 | 4시간 (API 서버 일시 불가) |
| 롤백 | 8시간 |

### 3. 서비스 등급

| 등급 | 대상 | 기준 |
|---|---|---|
| Tier 1 | llm-serving, rag-server, vkey-server, 서비스 DB(Postgres, pgvector) | 사용자 영향 즉시 발생, 데이터 손실 최소화 |
| Tier 2 | Gitea, Harbor, Jenkins, ArgoCD, admin_manager, k8s_manager | 개발·운영 업무 필수, 일시 중단 허용 |
| Tier 3 | Prometheus, Alertmanager, Loki, monitoring-web | 관측용, 일부 데이터 손실 허용 |

### 4. RTO/RPO 목표

| 대상 | 전환 중 RTO | 전환 중 RPO | 전환 후 RTO | 전환 후 RPO | 전환 후 달성 조건 |
|---|---|---|---|---|---|
| Postgres·pgvector | 4시간 | 작업 직전(0) | 1시간 | 15분 | WAL 아카이빙 또는 스트리밍 복제, 일 1회 이상 복구 검증 |
| vLLM / rag-server / vkey-server | 4시간 | 해당 없음(무상태) | 30분 (노드 1대 장애) | 해당 없음 | Worker 2대 이상, Pod 다중 복제, GPU 노드 배치 정책 |
| Gitea | 8시간 | 작업 직전(0) | 2시간 | 1시간 | 일 1회 dump + 볼륨 스냅샷 |
| Harbor | 8시간 | 24시간 | 2시간 | 24시간 | 스토리지 스냅샷, 프로젝트 설정 백업 |
| Jenkins / ArgoCD | 8시간 | 24시간 | 2시간 | 24시간 | 설정을 Git·Terraform으로 관리 |
| Prometheus / Loki | 24시간 | 24시간 | 4시간 | 24시간 | 영구 볼륨, 리텐션 정책 |
| etcd / Control Plane | 2시간 | 작업 직전(0) | 30분 (CP 1대 장애) | 1시간 | CP 3대(etcd 3), 시간당 etcd 스냅샷 |

※ 운영 목표는 Control Plane 3대, Worker 2대 이상이 전제다. CP 1대 구성에서는 etcd/CP 장애 시 RTO를 2시간 이상으로 잡는다.

### 5. 전환 전 필수 선행 조건

1. 모든 이미지를 Harbor에서 pull (노드 로컬 import 의존 제거) — CP-3
2. hostPath 등 노드 로컬 상태 의존 제거, 모델 가중치 위치 확인 — CP-5
3. Postgres 덤프·etcd 스냅샷 자동화, 복구 리허설 성공 — CP-5
4. GPU 워크로드에 `nvidia.com/gpu` 요청, 노드 셀렉터·테인트 선언 — CP-5

## Consequences

- 확정되면 [0036](0036-container-registry-selection.md)(Gitea Registry)과 [0042](0042-cicd-runner-execution.md)(Gitea Actions)가 Superseded 된다.
- 백업 방식 결정([0016](0016-backup-recovery-policy.md), [0023](0023-etcd-backup-policy.md))과 스토리지 이중화([0024](0024-pv-storage-redundancy.md))가 CP-5의 선행 결정이다.
- 백업 체계가 검증되기 전까지 RPO는 "목표"이지 "보장"이 아니다.
- 원본 보고서: `멀티노드_전환_다운타임_RTO_RPO_v2.docx`
- 관련: [0022](0022-control-plane-spof-risk.md), [0027](0027-disaster-recovery-plan.md), [0032](0032-vllm-replica-scheduling-scope.md), [0044](0044-kernel-pin-highpoint-driver.md)
