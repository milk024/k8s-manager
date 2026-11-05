# ADR-036. 컨테이너 이미지 저장소 선정 (Docker Hub vs 자체 구축)

- **Status**: 확정 (운영 중) — 멀티노드 전환 시 Harbor로 재검토 예정
- **이전 Status**: 확정

## Context

개발한 애플리케이션은 컨테이너 이미지로 빌드해 컨테이너 리포지토리에 등록 후 배포한다. Docker Hub를 쓸지, 자체 구축(예: Gitea Registry/OCI)을 쓸지 트레이드오프를 정리해야 한다는 요청이 회의에서 있었다.

## 선택지

1. Docker Hub — 관리 부담 없음, 공개 저장소이므로 폐쇄망/보안 요구사항([0008](0008-network-exposure-scope.md))과 충돌 가능성
2. 자체 구축(Gitea Registry / OCI) — `k8s_manager`가 이미 `services/mirror`로 다루는 대상과 일치, 폐쇄망 내부에서 완결 가능

## Decision

**2번, Gitea Container Registry로 확정.** Docker Hub는 사용하지 않는다(`Docker 컨테이너 이미지 빌드 방식 가이드라인` 3-7항). 이미지 경로는 Gitea의 조직/저장소 사용자명을 그대로 따른다(예: `gitea.example.com/ourcompany/rag-server`) — **별도 포트(5000 등)가 아니라 Gitea 웹 서비스와 동일한 host:port**를 쓴다. 소스코드 저장소 권한이 이미지 레지스트리 권한에 그대로 상속되어 별도 계정 관리가 불필요하다.

태그 규칙: `v{major}.{minor}.{patch}`(예: `v1.0.0`). **운영 배포에 `latest` 태그만 쓰는 것은 금지**(롤백 불가능해짐) — 개발용 `dev`, 검증용 `rc1` 태그는 병행 가능.

## Consequences

- `k8s/values.yaml`의 `image.repository`를 `gitea.infra.svc.cluster.local:5000/infra/k8s-manager`(가정값, 없는 5000 포트)에서 실제 Gitea host:port 기준으로 수정하고, `image.tag`를 `latest`에서 `package.json`의 버전과 맞춘 semver 태그로 변경.
- `services/mirror`의 OCI 반입 대상도 Gitea Container Registry로 확정 — Docker Hub 풀 경로는 다루지 않음.
- npm/pip 패키지 미러도 Gitea Package Registry로 통합 가능(`.npmrc`의 `registry=https://<gitea>/api/packages/<org>/npm/`, pip의 `--index-url https://<gitea>/api/packages/<org>/pypi/simple/`) — 다만 외부 공개 패키지(react, express 등)까지 전부 미러링할지는 별도 결정 필요(트래픽/용량), 컨테이너 이미지 레지스트리 용도가 우선.
- 관련: [0025](0025-model-data-license-review.md), [0035](0035-large-model-operations.md), [0039](0039-docker-image-build-convention.md)

## 실제 배포 확인 (2026-08-11)

Gitea가 Helm Chart(`gitea-charts/gitea` v12.7.0, appVersion 1.27.1)로 실제 배포됐고, 조직 `myorg` 생성 + `docker login`/`push` 테스트까지 완료됨.

```
docker login 10.0.0.23:80          # Username: gitea_admin
docker tag hello-world 10.0.0.23:80/myorg/hello-world:test
docker push 10.0.0.23:80/myorg/hello-world:test   # 성공
```

- 실제 레지스트리 주소는 `10.0.0.23:80`(도메인·TLS 없이 IP:80, [0006](0006-tls-certificate-authority.md) PoC 결정과 동일 선상) — 이전 가정값(`gitea.infra.svc.cluster.local:...`)은 클러스터 **내부** DNS라 외부에서 docker login할 땐 못 쓰고, 이 IP:포트를 써야 함.
- 조직명은 `infra`가 아니라 **`myorg`** — `k8s/values.yaml`의 `image.repository`를 `10.0.0.23:80/myorg/k8s-manager`로 갱신함.
- HTTP(비TLS) 레지스트리라서, **클러스터 안(kubelet/containerd)에서 이 이미지를 pull하려면 각 노드의 containerd에 insecure registry 설정이 필요**할 수 있음 — 아직 미확인, `k8s_manager` Pod가 `ImagePullBackOff` 나면 이것부터 의심할 것.
- npm/pip 패키지 레지스트리도 Gitea 1.17+ 기본 활성화로 별도 `app.ini` 설정 없이 동작하는 것으로 확인(실제 push 테스트로 최종 검증 예정).

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 실제 레지스트리 주소는 `10.0.0.23:80/myorg/<서비스>`다. 운영 이미지 태그는 semver가 아니라 **git commit SHA**를 쓴다(예: `rag-server:3c04419...`). `latest` 금지 원칙은 지켜지고 있고, SHA로도 롤백할 수 있다.
- 멀티노드 전환 시 노드마다 이미지를 수동으로 적재하지 않으려면 공용 레지스트리가 필요하다. 그래서 Harbor 도입을 계획에 넣었다([0045](0045-multinode-transition-rto-rpo.md), 크리티컬 패스 CP-1). 확정되면 이 ADR을 Superseded 처리한다.

## 현황 갱신 (2026-11-05)

- 베이스 이미지 `rag-model-base`는 semver 태그(`v1`~`v5`)를 쓴다. v5는 2026-11-05 서버에서 빌드해 push했다([0049](0049-rag-model-base-image.md)). 앱 이미지는 계속 commit SHA 태그를 쓴다.
- Gitea 패키지 저장소 사용량은 약 29.7GB다. NFS에 용량 제한이 없어 PVC 요청값(10Gi)과 상관없이 쓸 수 있다. 실제 한계는 NFS 디스크(6.9T)다.
