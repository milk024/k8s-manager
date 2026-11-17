# ADR-030. Gateway 연동 및 외부 접속 IP 방식

- **Status**: 확정 — `infra`용 IP(10.0.0.23) 실제 할당 완료 및 외부 접속 확인됨

## Context

외부에서 클러스터 내부 서비스로 접속하려면 Gateway 구성이 필요하고, 이때 사용할 외부 접속 IP를 확정해야 한다.

`서버 환경 테스트_20260803` 질의서에서 서비스별 필요 IP 개수를 아래와 같이 요청했다(전산실/호스팅 측 확인 대기, "추후 변경 소요 있음"이라 확정 아님).

| 구분 | Monitoring | RAG | vKey |
|---|---|---|---|
| IP 개수 | 1 | 2 | 2 |

`k8s_manager`(Gateway & Management Zone)는 이 표의 "Monitoring" 계열에 해당한다.

## 현황 (실제 클러스터 조회로 확인, 2026-08-10)

외부 IP는 수동 배정이 아니라 **MetalLB `IPAddressPool`에서 자동 할당(auto-assign)**되는 방식이다.

```
$ kubectl get ipaddresspool -A
NAMESPACE        NAME            AUTO ASSIGN   ADDRESSES
metallb-system   deepcell-pool   true          ["10.0.0.21-10.0.0.27"]
```

이 풀에서 이미 2개가 쓰이고 있다(`kserve-ingress-gateway` → `10.0.0.21`, `llm-serving/ai-gateway` → `10.0.0.22`). 총 7개 중 5개가 여유 — `infra` namespace에 `Gateway` 리소스를 만들면 자동으로 `.23`부터 하나 배정받게 된다. 즉 **"IP 개수를 신청해서 회신받는 방식"이 아니라, Gateway를 만드는 순간 풀에서 자동으로 나온다.**

## Decision

`infra` namespace 전용 `Gateway`(`infra-gateway`)가 실제로 생성되어 MetalLB `deepcell-pool`에서 **`10.0.0.23`을 할당받았고, 외부에서 HTTP로 정상 접속 확인함**(`curl http://10.0.0.23/` → Gitea 200 OK). `k8s_manager`는 이 Gateway를 새로 만들지 않고 재사용한다([0007](0007-ingress-controller-choice.md)). 풀 사용량은 3/7(`.21` kserve, `.22` llm-serving, `.23` infra)로, 질의서의 "Monitoring 1 + RAG 2 + vKey 2 = 5개" 요청이 그대로면 기존 사용분(3개, RAG/vKey 아직 미생성) 포함 향후 7개 소진 가능성은 그대로 유효.

## Consequences

- `k8s/values.yaml`의 `gateway.existingGatewayName: infra-gateway`로 기존 Gateway를 참조 — `k8s_manager`는 자체 `loadBalancerIP`나 새 `Gateway`를 만들지 않는다.
- 현재 TLS 없이 HTTP:80만 열려 있음([0006](0006-tls-certificate-authority.md) 참고) — hosts 파일 매핑 시 당장은 `10.0.0.23`을 도메인 없이 IP 그대로 써야 함.
- IP 풀 소진 리스크는 [0011](0011-datacenter-info-provisioning.md)(전산실 협의)에서 계속 추적.
- 관련: [0005](0005-domain-routing-strategy.md), [0006](0006-tls-certificate-authority.md), [0007](0007-ingress-controller-choice.md), [0008](0008-network-exposure-scope.md), [0040](0040-single-server-hardware-spec.md)
