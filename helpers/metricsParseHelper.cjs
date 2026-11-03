'use strict';

const MEMORY_UNITS = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

// 상태 없는 순수 변환 로직이라 인스턴스가 필요 없어 static 메서드로 둔다.
class MetricsParseHelper {
  // Kubernetes Metrics API(metrics.k8s.io) quantity 문자열 파서.
  // CPU: "123456n"(nanocore) · "50m"(millicore) · "1"(core) 등.
  static parseCpuMillicores(quantity) {
    if (!quantity) return 0;
    const match = /^(\d+)([num]?)$/.exec(String(quantity));
    if (!match) return 0;
    const value = Number(match[1]);
    switch (match[2]) {
      case 'n':
        return value / 1e6;
      case 'u':
        return value / 1e3;
      case 'm':
        return value;
      default:
        return value * 1000;
    }
  }

  // Memory: "204800Ki" · "1Gi" · 순수 바이트 등.
  static parseMemoryBytes(quantity) {
    if (!quantity) return 0;
    const match = /^(\d+)([A-Za-z]*)$/.exec(String(quantity));
    if (!match) return 0;
    const value = Number(match[1]);
    const unit = match[2];
    if (!unit) return value;
    const multiplier = MEMORY_UNITS[unit];
    return multiplier ? value * multiplier : value;
  }
}

module.exports = MetricsParseHelper;
