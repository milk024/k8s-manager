# ADR-004. Local Ops GUI 배포 방식: 별도 저장소 + 같은 namespace 별도 Pod

- **Status**: 확정 (배포 방식 및 노출 경로 확정, GUI 저장소 자체는 아직 미착수)

## Context

초기에는 `public/` 폴더에 React 빌드 산출물을 넣어 관리서버(express)가 직접 정적 서빙하는 안을 검토함.

## 선택지

1. 관리서버가 GUI 정적 파일을 직접 서빙 (`public/` + `gui.router.cjs`)
2. GUI를 별도 저장소로 관리하고, Vite 빌드 → 별도 컨테이너로 배포 (완전 분리된 도메인/서비스)
3. GUI를 별도 저장소로 관리하되, **같은 Namespace: infra 안의 별도 Pod/Deployment/Service**로 배포 (최종 결정)

## Decision

3번. 소스는 분리하지만 배포 단위(namespace)는 관리서버와 함께 묶어 관리.

## Consequences

- `public/`, `core/routers/gui.router.cjs` 제거. 관리서버는 REST API + socket.io만 제공.
- GUI Pod와 관리서버 Pod가 같은 namespace에 있어도, **브라우저가 두 Pod 각각에 Gateway를 거쳐 접근**하는 구조이므로(Pod 간 직접 통신 아님) CORS 설정과 토큰 기반 인증이 여전히 필요함(현재 미구현, ADR-009/014 대기 중).
- **GUI는 `/`가 아니라 `/dashboard`에서 서빙됨**([0005](0005-domain-routing-strategy.md) — Gitea가 이미 `/`를 점유) — Vite `vite.config.js`에 `base: '/dashboard/'` 설정, 클라이언트 라우터 basename도 `/dashboard`로 맞춰야 정적 자산 경로/라우팅이 깨지지 않음.
- Service 이름은 `local-ops-gui-svc`, 포트 `80`으로 만들어야 함 — `k8s_manager`의 `k8s/values.yaml`(`gateway.guiServiceName`/`guiServicePort`)이 이 이름을 그대로 참조하고 있음.
- 관련: [0005](0005-domain-routing-strategy.md)
