'use strict';

const os = require('os');
const path = require('path');

function readEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

class ConfigHelper {
  constructor() {
    this.port = Number(readEnv('PORT', 8000));
    this.allowedOrigins = readEnv('ALLOWED_ORIGINS', '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    this.k8sNamespace = readEnv('K8S_NAMESPACE', 'infra');
    // 운영 배포(wk-01 Pod)는 in-cluster ServiceAccount(ADR-002)를 쓰지만,
    // 클러스터 밖 로컬 개발 시에는 표준 kubectl 위치(~/.kube/config)로 폴백한다.
    this.kubeconfigPath = readEnv('KUBECONFIG', path.join(os.homedir(), '.kube', 'config'));
    this.gitea = {
      baseUrl: readEnv('GITEA_BASE_URL', 'http://gitea-http.infra.svc.cluster.local:3000'),
      token: readEnv('GITEA_TOKEN', ''),
      webhookSecret: readEnv('GITEA_WEBHOOK_SECRET', ''),
    };
    this.prometheus = {
      baseUrl: readEnv('PROMETHEUS_BASE_URL', 'http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090'),
    };
    this.mirror = {
      registryUrl: readEnv('MIRROR_REGISTRY_URL', ''),
    };
    this.monitorPollIntervalMs = Number(readEnv('MONITOR_POLL_INTERVAL_MS', 5000));
  }
}

module.exports = new ConfigHelper();
