# ADR-037. 문서화 방침

- **Status**: 확정

## Context

회의에서 배포 리소스 문서화 방침을 정했다.

## Decision

- Pod 단위로 정확한 명칭을 사용해 리스트화한다.
- 오픈소스 컴포넌트는 버전을 반드시 명시한다.
- 목록은 엑셀 표로 제작한다.

## Consequences

- `Chart.yaml`의 `appVersion`([0029](0029-helm-chart-deployment-strategy.md))으로 오픈소스 버전을 명시하는 것과 연결.
- `k8s_manager` 자체의 오픈소스 의존성(`README.md`에 이미 명시된 Node.js/express/socket.io/@kubernetes-client-node 버전)도 이 방침에 맞춰 계속 최신화 필요.
