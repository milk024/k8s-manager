# ADR-003. 런타임 버전 고정

- **Status**: 확정
- **이전 Status**: 대기 중

## Context

라이브러리 버전/컴파일 방식을 먼저 확정해야 코드 작성이 가능하다는 판단.

## Decision

현재 개발 머신 기준으로 아래 버전 고정.

- Node.js `22.16.0`, npm `10.9.2`
- `@kubernetes/client-node` `1.4.0` (engines 제약 없음, Node 22 호환 확인)
- `express` `5.2.1`
- `socket.io` `4.8.3`

## Consequences

`@kubernetes/client-node`는 순수 JS(네이티브 바인딩 없음) → 별도 빌드 툴체인(node-gyp 등) 불필요. 컨테이너 이미지는 `node:22-slim` + `npm ci --omit=dev`로 충분.

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 이미지 베이스는 [0039](0039-docker-image-build-convention.md)의 `node:22.16.0-slim`으로 고정되어 이 결정과 일치한다.
