# ADR-012. Local Git 동기화 및 VS Code Server 구축 여부

- **Status**: 결정됨 (2026-08-11)

## Decision

**옵션 1 채택**: Gitea = 레포 저장 + CI/CD 트리거 전용

- VS Code Server(브라우저 기반 원격 개발 환경)는 구축하지 않음
- 개발자는 기존과 동일하게 Remote-SSH + Dev Container로 개발
- Gitea는 (1) 소스코드 저장소, (2) 컨테이너/패키지 레지스트리,
  (3) push 이벤트 기반 CI/CD 트리거 용도로만 사용

## Consequences

- `services/giteaService.cjs`의 웹훅 등록(`createWebhookIfMissing`) 및
  push 이벤트 처리(`handlePushEvent`) 로직은 이 결정 범위 내에서 이어서 구현 가능
- SSH 키 관리, VS Code Server 프록시 관련 설계는 불필요 (범위에서 제외)
- 접속 방식은 계속 Remote-SSH + Dev Container 유지
- CI/CD 트리거 실행 방식(직접 처리 vs Gitea Actions Runner)은 [0042](0042-cicd-runner-execution.md)에서 별도 결정.