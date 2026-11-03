# ADR-017. 장애 대응 주체 및 SLA 정의

- **Status**: 대기 중 — 첫 장애 사례 발생, 알림 체계 부재 확인
- **이전 Status**: 대기 중

## Context

`시스템 구축 방안 검토 보고서`의 "구축 전 고려사항 #12". 장애 발생 시 대응 주체(내부 vs 외주업체)와 SLA(대응 시간, 복구 목표 등)가 아직 정의되지 않음.

## Decision

미정 — 대기 중.

## Consequences

- 관련: [0009](0009-admin-maintenance-responsibility.md), [0018](0018-vendor-maintenance-scope.md), [0020](0020-logging-monitoring-system.md)

## 현황 갱신 (2026-11-03, 실제 클러스터 조회 기준)

- 2026-10-11 NFS 장애가 26시간 19분 지속됐다. 장애를 감지한 수단은 사용자 신고였다.
  - 원인: Prometheus 저장소가 같은 NFS 위에 있어 함께 멈췄고, Alertmanager receiver가 `null`이라 알림이 갈 곳이 없었다.
- SLA를 정하려면 먼저 감지 체계([0020](0020-logging-monitoring-system.md))가 있어야 한다. 대응 주체(내부/외주) 결정은 여전히 대기 중이다.
- 관련: [0043](0043-os-auto-update-disabled.md)
