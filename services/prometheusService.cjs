'use strict';

const config = require('../helpers/configHelper.cjs');

class PrometheusService {
  constructor() {
    this.baseUrl = config.prometheus.baseUrl;
  }

  // v2 아키텍처: services/monitor → Prometheus PromQL 쿼리 (GPU·디스크I/O).
  async queryPromQL(promql) {
    const url = new URL('/api/v1/query', this.baseUrl);
    url.searchParams.set('query', promql);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Prometheus query failed: ${res.status}`);
    }
    const body = await res.json();
    return body.data?.result ?? [];
  }

  // dcgm-exporter 기본 메트릭명. 주의: DCGM 메트릭의 namespace 라벨은 항상 exporter
  // 자신이 떠 있는 namespace(gpu-operator)를 가리킨다 — 실제 워크로드의 namespace는
  // honor_labels 스크랩 설정 때문에 exported_namespace 라벨에 들어있다. namespace=로
  // 필터링하면 매치되는 시계열이 없어서 항상 빈 배열이 나오는 버그가 있었다.
  async getGpuUtilization(namespace) {
    const filter = namespace ? `{exported_namespace="${namespace}"}` : '';
    return this.queryPromQL(`DCGM_FI_DEV_GPU_UTIL${filter}`);
  }

  // node-exporter 기본 메트릭명
  async getDiskIo(node) {
    const filter = node ? `{instance="${node}"}` : '';
    return this.queryPromQL(`rate(node_disk_io_time_seconds_total${filter}[5m])`);
  }
}

module.exports = new PrometheusService();
