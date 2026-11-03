# ADR-040. 단일 서버 하드웨어 사양 (검토 요청)

- **Status**: 확정 — GIGABYTE G493-SB1-AAP1 단일 서버
- **이전 Status**: 부분 확정 (GPU 배분 확정, CPU/RAM/SSD 총량은 전산실/호스팅 측 확인 대기)

## Context

`서버 환경 테스트_20260803` 질의서에서 단일 서버로 AI 서비스(RAG, vLLM, vKey, CI/CD·Monitoring)를 구축 가능한지 아래 사양으로 검토를 요청했다.

| 구분 | CPU | RAM | GPU | SSD |
|---|---|---|---|---|
| 서버 전체 | 64core 128thread | 512GB | L40S 4장 | 7TB (OS·K8s 1TB 포함) |
| RAG | 6core 12thread | 64GB (EMB 20GB + 44GB) | L40S 1장 | 3TB |
| vLLM | 32core 64thread | 180GB | L40S 3장 | 1TB |
| vKey | 8core 16thread | 128GB | - | 1.5TB |
| CI/CD·Monitoring | 4core 8thread | 16GB | - | 0.5TB |
| 합계 | 50core | 388GB | 4장 | 6TB(+OS 1TB=7TB) |

가용률(70% 기준): CPU 78.1%, RAM 75.8%, SSD 100%, GPU 100%.

같은 질의서에 OS/HTTPS·SSL/퍼블릭 도메인/K8s 클러스터 구축 여부 확인 요청(1.1~1.4)과, VS Code Remote-SSH·패키지 관리·소스 버전관리 방식 확인 요청(3.1~3.3)도 포함되어 있음 — 각각 기존 [0006](0006-tls-certificate-authority.md), [0005](0005-domain-routing-strategy.md), [0028](0028-ssh-code-server-access-and-sync.md), [0002](0002-in-cluster-auth.md)와 중복되는 질의라 별도 ADR 없이 해당 문서에서 계속 추적한다.

## 확인 필요 사항 (해결됨)

이 표의 GPU 배분(RAG 1장 + vLLM 3장 = 4장, 전체 소진)이 [0038](0038-namespace-deployment-phasing.md)에서 언급한 "GPU 4장 중 1장은 이미 KServe Gemma가 사용 중" 전제와 상충하는 것처럼 보였으나, **KServe는 vLLM 3장 배분 안에 포함되는 것으로 확인**됨 — 별도로 5번째 GPU가 필요한 게 아니라 "RAG 1장 + (KServe 포함) vLLM 3장 = 4장"으로 현재 하드웨어 사양과 정확히 맞는다.

## Decision

GPU 배분은 RAG 1장 + vLLM(KServe 포함) 3장 = 4장으로 확정. vLLM 쪽 Replica 스케줄링으로 처리할 예정이며, 세부 배포 가이드라인은 추후 별도로 제공됨([0032](0032-vllm-replica-scheduling-scope.md) 참고). 하드웨어 사양 자체(CPU/RAM/SSD 총량)는 여전히 전산실/호스팅 측 확인 대기.

## Consequences

- `k8s_manager`의 `services/k8s`가 다루는 리소스 요청/제한 값을 정할 때, GPU 관련 namespace(`llm-inference`, `rag-system`)의 실제 배분은 확정된 값(RAG 1장, vLLM 3장)을 참고.
- `k8s_manager` 자체는 GPU를 사용하지 않으므로 이 저장소의 `k8s/values.yaml`·`.cjs` 코드에는 변경 사항 없음 — GPU 리소스 request/limit은 `llm-inference`/`rag-system` namespace의 별도 Helm Chart(아직 이 저장소 범위 밖)에서 다룰 대상.
- 관련: [0038](0038-namespace-deployment-phasing.md), [0032](0032-vllm-replica-scheduling-scope.md), [0031](0031-storage-solution.md)(SSD 총량 7TB와 스토리지 용량 계획 연결)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 서버 모델: **GIGABYTE G493-SB1-AAP1** (Dell 750R 아님)
- 실측(K8s 노드 `super` 기준): CPU 128 thread, RAM 약 503 GiB, GPU NVIDIA L40S × 4, NFS 데이터 디스크 nvme 7.6TB, OS 디스크 HighPoint NVMe RAID
- OS / K8s: Ubuntu 24.04.4 LTS, 커널 6.8.0-136-generic(고정, [0044](0044-kernel-pin-highpoint-driver.md)), kubeadm v1.35.7
- GPU 실제 배분: vLLM 2장, rag-server 1장, 예비 1장([0032](0032-vllm-replica-scheduling-scope.md))
