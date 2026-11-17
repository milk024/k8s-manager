# ADR-047. 대시보드 실시간 데이터 전달: REST 폴링 대신 socket.io push

- **Status**: 확정 (2026-09-02, commit `dce898c`, `38e0353`)

## Context

`monitoring-web` 대시보드는 GPU 사용률, Pod 상태, 빌드 결과를 REST API로 받아왔다. 그래서 화면이 실시간으로 갱신되지 않았다. 예를 들어 namespace 페이지는 새로고침해야 바뀌었다. 빌드 결과도 Gitea가 "빌드 완료" webhook을 보내지 않아(push 이벤트만 있음) 알 수 있는 방법이 없었다.

## Decision

`k8s_manager`가 서버 측에서 폴링하고, 결과를 socket.io 이벤트로 push한다. payload는 기존 REST 응답 형태를 그대로 쓴다.

| 이벤트 | 내용 | 갱신 방식 |
|---|---|---|
| `monitor:gpu` | `{ namespace, gpus }`, `GET /api/monitor/gpu`와 동일 | 기존 monitor 폴링 주기 |
| `k8s:pods` | `GET /api/k8s/pods`와 동일(phase, restarts 포함) | 기존 monitor 폴링 주기 |
| `gitea:actions` | 해당 커밋의 job/status 목록 | push webhook 수신 → 5초 간격, 최대 약 2분 짧은 폴링. 상태가 바뀔 때만 전송하고, 모든 job이 success/failure가 되면 중단 |

## Consequences

- 브라우저 수와 상관없이 Kubernetes API·Prometheus·Gitea 조회는 서버 한 곳에서만 일어난다.
- REST 엔드포인트는 초기 로딩과 재연결용으로 유지한다.
- 2분 이상 걸리는 빌드는 `gitea:actions` 이벤트가 끝까지 오지 않을 수 있다. 화면에서는 REST 재조회로 보완한다.
- 관련: [0001](0001-monitoring-scope-pod-vs-host.md), [0004](0004-gui-deployment-strategy.md), [0042](0042-cicd-runner-execution.md)

## 현황 갱신 (2026-11-17)

- `gitea:actions` 이벤트는 없앴다. 빌드 결과는 Jenkins 커밋 상태를 Gitea `status` 웹훅으로 받아 `ci:build`로 보낸다(폴링 없음, [0052](0052-jenkins-ci.md)).
- `monitor:gpu`는 이미 5초마다 보내고 있었는데, 화면이 10초 REST 폴링도 같이 돌리고 있었다. 이제 소켓이 연결돼 있고 첫 이벤트가 오면 폴링을 멈춘다. 연결이 끊겼을 때만 REST로 대신한다.
- socket.io 연결에 로그인 토큰이 필요하다(`auth.token`, admin-manager JWT). 토큰이 없거나 틀리면 연결 단계에서 거절하고, 토큰 만료 시각에 서버가 끊는다([0053](0053-monitoring-web-access-and-ops-screens.md)).
- 현재 이벤트: `monitor:pods`, `monitor:gpu`, `k8s:pods`, `monitor:error`, `alert:triggered`, `gitea:push`, `ci:build`.
