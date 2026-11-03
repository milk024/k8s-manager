# ADR-007. Ingress Controller 선택

- **Status**: 확정 — 실제 클러스터 확인 결과 Gateway API(Envoy Gateway)로 이미 구성됨

## Context

`/api`, `/socket.io` path 라우팅을 하려면 인그레스 계층이 필요한데, 어떤 걸 쓸지는 클러스터 구축 단계에서 결정되는 사항이라 이 프로젝트 범위 밖으로 보고 nginx-ingress를 가정으로 두고 있었다.

## 현황 (실제 클러스터 조회로 확인, 2026-08-10)

nginx-ingress는 클러스터 어디에도 없고, 대신 **Gateway API + Envoy Gateway**가 이미 설치·운영 중임을 확인했다.

```
$ kubectl get gatewayclass
NAME                            CONTROLLER                                      ACCEPTED
envoy                           gateway.envoyproxy.io/gatewayclass-controller   True
inference-pool-with-aigwroute   gateway.envoyproxy.io/gatewayclass-controller   True

$ kubectl get pods -n envoy-gateway-system
envoy-gateway-...                 Running   # 컨트롤러 본체, docker.io/envoyproxy/gateway:v1.8.1
envoy-kserve-kserve-ingress-gateway-...   Running   # kserve namespace 전용 데이터플레인
envoy-llm-serving-ai-gateway-...          Running   # llm-serving namespace 전용 데이터플레인
```

`kserve`, `llm-serving` namespace에 각각 자체 `Gateway` 리소스(`gatewayClassName: envoy`)가 있고, 각각 MetalLB로 외부 IP(10.0.0.21, .22)를 할당받아 정상 동작 중이다.

## Decision

`k8s_manager`(및 `infra` namespace의 다른 서비스)도 **classic `Ingress`가 아니라 Gateway API(`Gateway` + `HTTPRoute`)로 노출한다.** `gatewayClassName: envoy`를 그대로 재사용.

## Consequences

- `k8s/templates/ingress.yaml`(classic `networking.k8s.io/v1 Ingress`)을 Gateway API `HTTPRoute`로 교체.
- nginx 전용 annotation(`nginx.ingress.kubernetes.io/...`)은 전부 무의미 — 삭제.
- socket.io 웹소켓 업그레이드는 Envoy Gateway가 HTTP/1.1 upgrade를 기본 지원하므로 별도 timeout annotation 없이도 동작할 가능성이 높음 — 실제 배포 후 연결 유지 여부 확인 필요.

## 추가 확인 (2026-08-11) — `infra` namespace에 공용 Gateway가 이미 존재

Gitea 배포 과정에서 `infra` namespace 전용 `Gateway` 리소스(`infra-gateway`, `gatewayClassName: envoy`, listener는 HTTP:80만)가 **이미 kubectl로 직접 생성**되어 있었고, MetalLB가 `10.0.0.23`을 할당했다. Gitea의 HTTPRoute가 여기 붙어서 path `/` 전체를 Gitea로 라우팅 중이다.

**`k8s_manager`는 이 기존 Gateway를 재사용하고, 새 Gateway를 만들지 않는다** — `kserve`/`llm-serving`처럼 서비스마다 Gateway를 새로 만들면 MetalLB IP 풀(7개 중 이미 3개 사용)을 불필요하게 더 소진하게 됨. `k8s/templates/httproute.yaml`이 `infra-gateway`에 `/api`, `/socket.io`, `/webhook` 규칙만 추가한다.

## Consequences (추가)

- `k8s/templates/gateway.yaml`은 만들지 않음(삭제) — `k8s/templates/httproute.yaml`만 유지, `parentRefs.name`은 `values.yaml`의 `gateway.existingGatewayName`(기본값 `infra-gateway`)을 참조.
- Gitea의 HTTPRoute가 `/`(PathPrefix, 전체 매치)를 이미 점유 — GUI를 같은 IP의 `/`에 붙이려면 Gitea 라우팅과 경로/도메인을 분리해야 함(ADR-005 참고, 현재 GUI 라우트는 `gateway.exposeGui=false`로 비활성화해둠).
- 관련: [0005](0005-domain-routing-strategy.md), [0008](0008-network-exposure-scope.md), [0030](0030-gateway-external-ip.md)
