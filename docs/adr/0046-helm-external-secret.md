# ADR-046. GITEA_TOKEN을 Helm 템플릿 밖의 별도 Secret으로 분리

- **Status**: 확정 (2026-09-02, commit `46a36f4`)

## Context

`k8s_manager`의 `GITEA_TOKEN`은 Helm 차트가 템플릿으로 만드는 Secret 안에 있었다.

- `helm upgrade`가 부분 실패하거나 `--reuse-values`를 빠뜨리면 이 값이 빈 문자열로 덮어써진다. 그러면 Gitea 연동이 조용히 끊긴다.
- 실제 사고: 수동 `kubectl edit`으로 HTTPRoute를 고친 것과 충돌해 `helm upgrade`가 연속 실패했다(revision 17/18). 이 과정에서 토큰이 초기화되어 Gitea 연동이 중단됐다.

## 선택지

1. Helm values에 계속 두고 업그레이드 절차(`--reuse-values` 필수)를 문서로 강제
2. Helm이 관리하지 않는 별도 Secret으로 분리하고 Deployment에서 참조

## Decision

**2번.**

- `GITEA_TOKEN`은 외부에서 관리하는 Secret `k8s-manager-gitea-token`에 둔다. Deployment는 `optional` secretRef로 참조한다.
- 충돌한 HTTPRoute는 Helm 밖에서 깨끗하게 재생성했다. 이후 Helm이 관리하는 리소스는 `kubectl edit`으로 직접 고치지 않는다.

## Consequences

- Helm 업그레이드가 실패해도 토큰은 유지된다. 적용 이후 재발 0건.
- 토큰을 교체할 때는 Helm이 아니라 해당 Secret을 직접 갱신하고 Pod를 재시작한다.
- 토큰 값은 Git, 메신저, 로그에 평문으로 남기지 않는다. 노출되면 즉시 Gitea에서 폐기하고 재발급한다.
- 같은 문제가 다른 서비스 차트에도 있을 수 있다. 장기적으로는 ArgoCD + 외부 Secret 관리로 통일한다([0045](0045-multinode-transition-rto-rpo.md)).
- 관련: [0029](0029-helm-chart-deployment-strategy.md), [0042](0042-cicd-runner-execution.md)
