# ADR-006. TLS 인증서 발급 주체

- **Status**: 확정 — 학교 발급 와일드카드 인증서로 HTTPS 적용 (일부 Gateway는 HTTP만)
- **이전 Status**: 부분 확정 — PoC 단계는 HTTP만, TLS는 도메인 확정 후로 연기

## Context

사설 도메인이라 공인 인증서 발급이 안 될 수 있다는 우려가 있었음.

## Decision

학교 내부망에서 사설→공인 인증서를 발급해주는 프로세스가 있어, 별도의 자체 서명 CA 구축은 하지 않음.

**PoC 단계 결정(2026-08-11)**: 도메인/인증서가 아직 확정되지 않아 `infra-gateway`는 당초 계획한 443(HTTPS)이 아니라 **80(HTTP)으로만** 우선 구성했다. TLS는 도메인이 확정된 뒤 적용 예정.

## Consequences

- 이 저장소(`k8s_manager`)에서는 TLS 인증서 발급/배포를 직접 다루지 않음. `k8s/values.yaml`의 `gateway.tlsSecretName`은 PoC 단계에서 빈 값 — TLS 도입 시 학교망에서 제공하는 인증서로 채운다.
- 현재 `Gateway`(`infra-gateway`)에 HTTPS 리스너 자체가 없음(HTTP:80만) — Gateway 리소스 자체를 재작업해야 TLS 적용 가능.
- 관련: [0005](0005-domain-routing-strategy.md), [0007](0007-ingress-controller-choice.md), [0030](0030-gateway-external-ip.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 학교에서 발급받은 인증서를 Secret으로 넣어 Gateway HTTPS(443) 리스너에 적용했다. cert-manager로 공인 인증서를 발급하지 않는다. cert-manager는 KServe webhook용 self-signed 인증서에만 쓴다.

| Gateway | 리스너 | 인증서 Secret |
|---|---|---|
| `infra-gateway` | 80, 443 | `wildcard-myorg-tls` |
| `vkey-gateway` | 80, 443, 8080 | `vkey-tls-secret` |
| `rag-gateway` | 80, 443, 8080 | `rag-tls-secret` |
| `kserve-ingress-gateway`, `ai-gateway` | 80만 | 없음 |

- **남은 이슈**: `ai-gateway`(.22)와 `kserve-ingress-gateway`(.21)는 HTTP만 열려 있고 인증(SecurityPolicy)도 없다. 노출 범위는 [0008](0008-network-exposure-scope.md)에서 다룬다.
- 인증서 만료일 추적과 갱신 절차가 정해져 있지 않다. 만료 알림이 필요하다([0020](0020-logging-monitoring-system.md)).
