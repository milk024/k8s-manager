# ADR-005. 접근 경로: 사설 도메인(hosts 파일 매핑) + Ingress Host/Path 라우팅

- **Status**: 확정 — 학교 도메인 발급 완료, hosts 파일 매핑 불필요
- **이전 Status**: 확정 (GUI는 `/dashboard`, 도메인 자체는 아직 IP로 대체 중)

## Context

사용자 PC의 hosts 파일 수정으로 사설 도메인을 매핑해 접속하는 방식을 사용하기로 함. GUI와 관리서버 API를 어떻게 분기할지 결정 필요.

## 선택지

1. 서브도메인 분리 (`api.ops.internal` / `gui.ops.internal`) → CORS 필수, 인증 쿠키 SameSite 정책 별도 고려 필요
2. 같은 도메인 + path 분리 (`ops.internal/` → GUI, `ops.internal/api`, `/socket.io` → 관리서버) → 동일 origin이라 CORS 불필요

## Decision

2번(같은 도메인 + path 분리)을 기본 전제로 진행. 단, 도메인 구성이 최종 확정되지 않았으므로 코드는 두 방식 모두 대응 가능하게 작성.

## Consequences

- `helpers/configHelper.cjs`에 `ALLOWED_ORIGINS`를 환경변수로 분리 — 값이 없으면(같은 origin 상황) 전체 허용, 값이 있으면(서브도메인 분리 상황) 화이트리스트로 제한.
- [0007](0007-ingress-controller-choice.md) 확정에 따라 path 기반 라우팅은 classic Ingress가 아니라 **Gateway API `HTTPRoute`**(`k8s/templates/httproute.yaml`)로 구현 — `/api`, `/socket.io`, `/webhook` 규칙은 동일하게 유지.
- 실제 도메인(hosts 파일에 매핑할 값)은 [0030](0030-gateway-external-ip.md)에서 MetalLB가 할당한 IP(`10.0.0.23`)로 확정 — 아직 도메인 자체는 없어서 당장은 IP를 그대로 씀.

## 충돌 발견 (2026-08-11) — GUI `/`와 Gitea `/`가 같은 IP에서 겹침

Gitea Helm Chart가 만든 HTTPRoute가 이미 `infra-gateway`의 path `/`(PathPrefix, 전체 매치)를 점유하고 있다. `k8s_manager`가 애초 계획했던 "GUI는 `/`, API는 `/api`" 구조를 그대로 쓰면 **GUI의 `/`가 Gitea의 `/`와 같은 IP·같은 우선순위에서 충돌**한다. 도메인이 없는 PoC 단계라 호스트명으로 구분할 수도 없는 상태.

**해결 확정 (2026-08-11)**: 3가지 선택지(서브도메인 분리 / GUI를 다른 prefix로 / Gitea를 `/git`으로) 중 **GUI를 `/dashboard`로 옮기는 방식**을 채택. 도메인이 아직 없는 PoC 단계에서 바로 적용 가능하고(서브도메인 분리는 도메인 필요), Gitea 쪽 기존 설정(`ROOT_URL`, 이미 발급된 링크/토큰)을 건드리지 않아도 되기 때문(Gitea를 `/git`으로 옮기는 안보다 리스크가 낮음). 도메인이 생기면 서브도메인 분리로 다시 옮길 수도 있음 — 그때 재검토.

- `k8s/values.yaml`의 `gateway.guiPathPrefix: /dashboard`로 반영, `k8s/templates/httproute.yaml`이 이 값을 사용.
- `gateway.exposeGui`는 GUI 저장소(local-ops-gui-svc, ADR-004) 자체가 아직 없어서 기본 `false` — 그 저장소가 준비되면 `true`로 켜면 됨.
- **GUI 빌드 시 주의**: Vite로 빌드하는 GUI([0004](0004-gui-deployment-strategy.md))는 루트(`/`)가 아니라 `/dashboard`에서 서빙되므로, `vite.config.js`의 `base: '/dashboard/'`와 클라이언트 라우터의 basename을 반드시 맞춰야 함 — 안 하면 정적 자산(JS/CSS) 경로가 깨짐.
- `/api`, `/socket.io`, `/webhook`는 Gitea의 `/`보다 더 구체적인 prefix라 Gateway API 우선순위 규칙(긴 prefix 우선)상 정상적으로 먼저 매치되므로 문제없음.

- 관련: [0004](0004-gui-deployment-strategy.md), [0007](0007-ingress-controller-choice.md), [0030](0030-gateway-external-ip.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 서비스별 공식 도메인이 발급되어 Gateway 리스너에 hostname으로 걸려 있다. hosts 파일 수정 없이 접속한다.

| 도메인 | Gateway | 외부 IP |
|---|---|---|
| `gpu.example.ac.kr` | `infra/infra-gateway` | 10.0.0.23 |
| `aikey.example.ac.kr` | `vkey-system/vkey-gateway` | 10.0.0.24 |
| `rag.example.ac.kr` | `rag-system/rag-gateway` | 10.0.0.25 |

- GUI `/dashboard`, API `/api`, `/socket.io`, `/webhook`의 path 분리 구조는 그대로 유지된다.
