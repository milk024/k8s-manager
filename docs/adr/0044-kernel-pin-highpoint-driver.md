# ADR-044. 커널 버전 고정 및 HighPoint RAID 드라이버 재빌드 선행 조건

- **Status**: 부분 확정 — 커널 고정 적용 완료, 6.8.0-146용 드라이버 재빌드와 재부팅은 미실시

## Context

[0043](0043-os-auto-update-disabled.md)의 자동 업데이트로 커널 `6.8.0-146-generic`이 설치됐고 재부팅을 기다리는 상태다. 이 서버로 재부팅하면 아래 두 가지 위험이 있다.

1. **OS 디스크 인식 실패**
   - OS 디스크가 HighPoint NVMe RAID(`/dev/hptblock0n0p4`)에 있다. 이 RAID는 커널 기본 모듈이 아니라 별도 설치한 `hptnvme.ko`로 동작한다.
   - `hptnvme.ko`는 현재 커널 136에만 있다. 146의 모듈 디렉터리와 initramfs에는 없다.
   - 146으로 부팅하면 루트 파일시스템을 찾지 못해 부팅이 실패한다. 콘솔 접근 없이는 복구할 수 없다.
2. **GPU 드라이버 재빌드**
   - gpu-operator ClusterPolicy는 driver `580.126.20`, `usePrecompiled=false`로 설정되어 있다. 새 커널로 부팅하면 커널 헤더를 받아 드라이버를 다시 컴파일한다.
   - 2026-08에 DNS 문제로 헤더 다운로드가 실패해 nvidia-driver Pod가 219회 재시작된 이력이 있다.

## Decision

- **커널을 136으로 고정한다.**
  - `/etc/default/grub`: `GRUB_DEFAULT="Advanced options for Ubuntu>Ubuntu, with Linux 6.8.0-136-generic"` → `update-grub` (grub.cfg에 반영 확인)
  - `apt-mark hold linux-generic linux-image-generic linux-headers-generic`
- **146으로 전환하는 조건**(모두 충족 전 재부팅 금지):
  1. `/boot`의 initrd와 grub 설정 백업(`/root/boot-backup-<날짜>`)
  2. `sudo /usr/sbin/hptdrv-rebuild 2>&1 | tee ~/hptdrv-rebuild-<날짜>.log`
  3. `/lib/modules/6.8.0-146-generic`에 `hptnvme.ko` 존재 확인
  4. 136, 146 두 initramfs 모두 `lsinitramfs`로 `hptnvme` 포함 확인
  5. `hptdrv-rebuild`의 fixboot가 GRUB 기본값을 바꿨는지 확인하고, 필요하면 다시 고정
  6. BMC/콘솔 접근이 가능한 유지보수 창에서 재부팅. 사전 공지 필수(전 서비스 중단)
  7. 부팅 후 nvidia-driver Pod 정상 기동과 GPU 4장 인식 확인

## Consequences

- 커널 보안 패치가 136에서 멈춰 있다. 전환 작업은 위 조건대로 계획된 유지보수 창에서만 한다.
- `libc6` 업데이트도 재부팅 대기 중이다. 같은 유지보수 창에서 함께 처리한다.
- 장기적으로는 gpu-operator `usePrecompiled=true` 또는 드라이버 버전 고정(`autoUpgrade=false`)을 검토해 부팅 시 외부 다운로드 의존을 없앤다([0008](0008-network-exposure-scope.md)의 아웃바운드 0개 원칙과 연결).
- 멀티노드 전환 시 신규 노드는 HighPoint RAID에 의존하지 않는 구성(기본 커널 모듈로 인식되는 디스크)을 권장한다([0045](0045-multinode-transition-rto-rpo.md)).
- 관련: [0040](0040-single-server-hardware-spec.md), [0043](0043-os-auto-update-disabled.md)

## 현황 갱신 (2026-11-05)

- 2026-11-05 기준 노드 커널은 `6.8.0-136-generic`으로 유지되고 있다(K8s 노드 정보로 확인). 146용 HighPoint 드라이버 재빌드 여부는 호스트에서 직접 확인해야 하며, 확인 전까지는 미실시로 본다.

## 현황 갱신 (2026-11-18)

- 호스트에서 직접 확인했다. 146용 드라이버 재빌드는 **미실시**다.
  - `/lib/modules/6.8.0-146-generic`에 `hptnvme.ko`가 없다.
  - initramfs: 136에는 `hptnvme.ko`가 있고, 146에는 없다.
  - `/root/boot-backup-*` 백업과 `hptdrv-rebuild` 로그가 없다. 전환 조건 1~2단계를 아직 시작하지 않았다.
  - `GRUB_DEFAULT`는 136으로 고정된 상태를 유지하고 있다. 노드는 2026-08-15 이후 재부팅하지 않았다.
- 따라서 지금 재부팅해도 136으로 정상 부팅한다(136 initramfs에 드라이버 포함). 부팅 불가 위험은 GRUB 고정을 풀거나 146을 직접 골라 부팅할 때만 생긴다. 남은 문제는 커널 보안 패치가 136에서 멈춰 있다는 점이다.
