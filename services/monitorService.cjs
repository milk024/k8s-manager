'use strict';

const k8sService = require('./k8sService.cjs');
const prometheusService = require('./prometheusService.cjs');
const socketService = require('./socketService.cjs');
const config = require('../helpers/configHelper.cjs');
const metricsParseHelper = require('../helpers/metricsParseHelper.cjs');
const logHelper = require('../helpers/logHelper.cjs');

class MonitorService {
  constructor() {
    this.pollTimer = null;
  }

  // ADR-001: Pod CPU/메모리 사용량 (Metrics API 경유).
  // namespace를 안 주면 클러스터 전체(모든 namespace)의 Pod를 대상으로 한다 — k8s_manager는
  // 특정 namespace가 아니라 전체 하드웨어 사용률을 모니터링해야 하므로 이게 기본 동작이다.
  async getPodUsage(namespace) {
    const metrics = await k8sService.getPodMetrics(namespace);
    return metrics.items.map((item) => ({
      namespace: item.metadata.namespace,
      pod: item.metadata.name,
      containers: item.containers.map((container) => ({
        name: container.name,
        cpuMillicores: metricsParseHelper.parseCpuMillicores(container.usage.cpu),
        memoryBytes: metricsParseHelper.parseMemoryBytes(container.usage.memory),
      })),
    }));
  }

  // namespace를 지정하면 그 namespace만, 안 지정하면(기본) 클러스터 전체를 폴링한다.
  startPolling(namespace) {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        const pods = await this.getPodUsage(namespace);
        socketService.emitDashboard('monitor:pods', { namespace: namespace || 'all', pods });
      } catch (err) {
        logHelper.warn('MonitorService', `폴링 실패: ${err.message}`);
        socketService.emitDashboard('monitor:error', { message: err.message });
      }
      try {
        // GET /api/monitor/gpu와 동일한 응답 형태(queryPromQL 결과 배열)를 그대로 push한다 —
        // 프론트엔드가 이미 REST 폴링으로 파싱하던 로직을 그대로 재사용할 수 있게.
        const gpus = await this.getGpuUtilization(namespace);
        socketService.emitDashboard('monitor:gpu', { namespace: namespace || 'all', gpus });
      } catch (err) {
        logHelper.warn('MonitorService', `GPU 폴링 실패: ${err.message}`);
        socketService.emitDashboard('monitor:error', { message: err.message });
      }
      try {
        // GET /api/k8s/pods와 동일한 응답(K8s Pod 객체 배열, phase/재시작 횟수 등 상태 포함)을
        // push한다. monitor:pods(사용량)와는 별개 — Pod 목록/상태 화면이 실시간이 아니라는
        // 문제를 해결하기 위한 것. Namespace 목록은 이 배열에서 프론트가 파생시키므로 같이 해결됨.
        const pods = await k8sService.listPods(namespace);
        socketService.emitDashboard('k8s:pods', { namespace: namespace || 'all', pods });
      } catch (err) {
        logHelper.warn('MonitorService', `Pod 목록 폴링 실패: ${err.message}`);
        socketService.emitDashboard('monitor:error', { message: err.message });
      }
    }, config.monitorPollIntervalMs);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  // v2 아키텍처: GPU·디스크I/O는 Prometheus 경유 (prometheusService에 위임).
  getGpuUtilization(namespace) {
    return prometheusService.getGpuUtilization(namespace);
  }

  getDiskIo(node) {
    return prometheusService.getDiskIo(node);
  }
}

module.exports = new MonitorService();
