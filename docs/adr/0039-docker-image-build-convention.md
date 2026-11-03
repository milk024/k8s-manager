# ADR-039. 컨테이너 이미지 빌드 컨벤션 (Node.js 서비스)

- **Status**: 확정

## Context

`Docker 컨테이너 이미지 빌드 방식 가이드라인(초안)`에서 서비스 타입별 Dockerfile 표준을 정했다. `k8s_manager`는 Node.js 서비스로 분류된다.

## Decision

- 베이스 이미지: `node:22.16.0-slim` (버전 고정, `node:22`처럼 유동 태그 금지) — [0003](0003-runtime-versions.md)의 Node 22.16.0과 일치.
- 의존성 레이어와 코드 레이어 분리: `COPY package.json package-lock.json ./` → `npm ci --omit=dev` → `COPY . .` → `CMD`.
- `npm ci`(재현 가능한 설치, `package-lock.json` 기준)를 쓰고 `npm install`은 쓰지 않는다.
- `.dockerignore`로 `node_modules`, `.git`, `.env`, `*.log`, `logs/` 제외.
- 컨테이너는 root로 실행하지 않는다 — `node:*-slim` 이미지에 내장된 `node` 사용자로 `USER node` 지정.
- 이미지 push 대상은 Gitea Container Registry([0036](0036-container-registry-selection.md)).

## Consequences

- 저장소 루트에 `Dockerfile`, `.dockerignore` 추가.
- `k8s/values.yaml`의 `image.repository`/`image.tag`가 [0036](0036-container-registry-selection.md)에서 정한 실제 경로/태그 규칙을 따르도록 갱신.
- `helpers/auditHelper.cjs`가 쓰는 `logs/` 디렉터리는 `.dockerignore`에도 포함(빌드 컨텍스트에 로그 유입 방지).
