# ADR-043. OS 자동 업데이트 비활성화 및 수동 패치 정책

- **Status**: 확정 (2026-10-12 적용) — 정기 수동 패치 창 주기는 미정

## Context

2026-10-11 06:39(KST)에 `unattended-upgrades`가 보안 패키지(libxml2 등)를 자동으로 설치했다. 이어서 `needrestart`가 영향받는 서비스를 자동으로 재시작했고, 그중 `nfs-server`가 포함됐다.

- 재시작된 `rpc.nfsd`가 `errno 12 (Cannot allocate memory)`로 기동에 실패했다. 약 58일 무재부팅 운영으로 커널 메모리가 단편화된 상태였다.
- 이 노드는 NFS 서버이면서 동시에 클라이언트다(루프백 NFS, [0024](0024-pv-storage-redundancy.md)). NFS가 멈추자 PVC를 쓰는 Pod 전부가 I/O 대기에 걸렸다. load average는 약 9,100까지 올랐고 CPU 사용률은 2%였다.
- 영향: vkey API, rag-postgres, Gitea, Prometheus 동시 중단. **26시간 19분**(10-12 08:58 복구).
- 감지 실패: Prometheus도 같은 NFS 위에 있었고 Alertmanager receiver는 `null`이었다([0020](0020-logging-monitoring-system.md)).
- 복구: `systemctl daemon-reload` → `systemctl start nfs-server` → Error 상태 Pod 3개 삭제. gitea-postgresql은 WAL 재생으로 데이터 손실 없이 기동했다.
- 2026-10-12 SSH 접속 시 보인 `*** System restart required ***`는 누군가 재부팅했다는 뜻이 아니다. 자동 설치된 커널(6.8.0-146)과 libc6가 재부팅을 기다리고 있다는 안내다.

## 선택지

1. 자동 업데이트 유지 + needrestart만 목록 모드로 변경
2. 자동 업데이트와 서비스 자동 재시작 모두 중단, 관리자가 유지보수 창에서 수동 패치

## Decision

**2번.** 단일 노드가 모든 서비스를 담당하는 동안에는 예고 없이 서비스가 재시작되는 경로를 전부 막는다.

| 대상 | 설정 |
|---|---|
| needrestart | `/etc/needrestart/conf.d/90-no-auto-restart.conf`: `$nrconf{restart} = 'l';` (재시작 대상 목록만 표시) |
| unattended-upgrades | `/etc/apt/apt.conf.d/20auto-upgrades` 두 항목 모두 `"0"` |
| systemd | `apt-daily.timer`, `apt-daily-upgrade.timer`, `unattended-upgrades.service` disable (활성 타이머 0개 확인) |
| 커널 | 메타 패키지 hold + GRUB 기본 커널 고정 → [0044](0044-kernel-pin-highpoint-driver.md) |

## Consequences

- 보안 패치가 자동으로 들어오지 않는다. 관리자가 주기적으로 `apt list --upgradable`을 확인하고 유지보수 창에서 적용해야 한다. 권장 주기는 월 1회이며 아직 확정하지 않았다.
- 수동 패치 후 `needrestart`가 보여주는 재시작 대상 중 `nfs-server`, `containerd`, `kubelet`은 Pod 영향을 확인한 뒤 순서대로 재시작한다.
- 재발 현황: 적용 이후 같은 원인의 장애 0건(2026-10-12 ~ 11-03).
- 근본 원인(단일 NFS, 알림 부재)은 해소되지 않았다. [0020](0020-logging-monitoring-system.md)(알림·Prometheus 이전), [0024](0024-pv-storage-redundancy.md)(스토리지 이중화), [0045](0045-multinode-transition-rto-rpo.md)(멀티노드)에서 계속 다룬다.
- 진단 팁: "노드는 Ready인데 전 서비스가 응답 없음"이면 NFS부터 확인한다. 증상은 `node_nfsd_packets_total` 정지, `node_load1` 급증이다.
- 관련: [0017](0017-incident-response-sla.md), [0022](0022-control-plane-spof-risk.md), [0031](0031-storage-solution.md)
