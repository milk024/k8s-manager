'use strict';

const fs = require('fs');
const k8s = require('@kubernetes/client-node');
const config = require('../helpers/configHelper.cjs');
const logHelper = require('../helpers/logHelper.cjs');

class K8sService {
  constructor() {
    this.kubeConfig = new k8s.KubeConfig();
    this._loadKubeConfig();

    this.coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.networkingApi = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
    this.metricsClient = new k8s.Metrics(this.kubeConfig);
  }

  // ADR-002: 운영 배포(wk-01 Pod)는 in-cluster ServiceAccount로 인증한다.
  // 클러스터 밖 로컬 개발 환경에서는 config.kubeconfigPath로 폴백한다.
  //
  // 주의: @kubernetes/client-node의 loadFromCluster()는 서비스어카운트 파일이
  // 없어도 예외를 던지지 않고 조용히 무효한 설정을 만든다. 그래서 try/catch가 아니라
  // kubelet이 실제 Pod에만 주입하는 KUBERNETES_SERVICE_HOST 환경변수로 in-cluster
  // 여부를 직접 판별한다.
  _loadKubeConfig() {
    const isInCluster = Boolean(process.env.KUBERNETES_SERVICE_HOST);
    if (isInCluster) {
      this.kubeConfig.loadFromCluster();
      logHelper.info('K8sService', 'in-cluster ServiceAccount 인증 사용');
      return;
    }
    if (fs.existsSync(config.kubeconfigPath) && fs.statSync(config.kubeconfigPath).size > 0) {
      this.kubeConfig.loadFromFile(config.kubeconfigPath);
      logHelper.info('K8sService', `로컬 kubeconfig 폴백: ${config.kubeconfigPath}`);
    } else {
      logHelper.warn('K8sService', `in-cluster 환경 아님 & kubeconfig(${config.kubeconfigPath}) 없음/비어있음 — K8s API 호출은 실패함`);
    }
  }

  // 모니터링/조회용 목록 API는 namespace를 안 주면 클러스터 전체(모든 namespace)를 대상으로 한다.
  // RBAC도 이에 맞춰 ClusterRole/ClusterRoleBinding으로 구성돼 있어야 함(k8s/templates/rbac.yaml).
  async listNetworkPolicies(namespace) {
    if (namespace) {
      const res = await this.networkingApi.listNamespacedNetworkPolicy({ namespace });
      return res.items;
    }
    const res = await this.networkingApi.listNetworkPolicyForAllNamespaces();
    return res.items;
  }

  async upsertNetworkPolicy(namespace = config.k8sNamespace, manifest) {
    try {
      return await this.networkingApi.replaceNamespacedNetworkPolicy({
        namespace,
        name: manifest.metadata.name,
        body: manifest,
      });
    } catch (err) {
      if (err.code !== 404) throw err;
      return this.networkingApi.createNamespacedNetworkPolicy({ namespace, body: manifest });
    }
  }

  async deleteNetworkPolicy(namespace = config.k8sNamespace, name) {
    return this.networkingApi.deleteNamespacedNetworkPolicy({ namespace, name });
  }

  async listDeployments(namespace) {
    if (namespace) {
      const res = await this.appsApi.listNamespacedDeployment({ namespace });
      return res.items;
    }
    const res = await this.appsApi.listDeploymentForAllNamespaces();
    return res.items;
  }

  async listPods(namespace) {
    if (namespace) {
      const res = await this.coreApi.listNamespacedPod({ namespace });
      return res.items;
    }
    const res = await this.coreApi.listPodForAllNamespaces();
    return res.items;
  }

  // Pod 로그는 namespace가 없으면 어느 Pod인지 특정할 수 없으므로 명시적으로 요구한다.
  async getPodLog(namespace, podName, container) {
    if (!namespace) {
      throw new Error('getPodLog에는 namespace가 필요합니다 (클러스터 전체에서 Pod 이름만으로는 특정 불가)');
    }
    return this.coreApi.readNamespacedPodLog({ namespace, name: podName, container, tailLines: 500 });
  }

  async listEvents(namespace) {
    if (namespace) {
      const res = await this.coreApi.listNamespacedEvent({ namespace });
      return res.items;
    }
    const res = await this.coreApi.listEventForAllNamespaces();
    return res.items;
  }

  // ADR-001: 호스트 레벨(DIMM 등)이 아닌 Pod 레벨 CPU/메모리만 다룬다.
  // namespace 미지정 시 metrics.k8s.io의 클러스터 전체 조회 경로(/apis/metrics.k8s.io/v1beta1/pods)를 탄다.
  async getPodMetrics(namespace) {
    return this.metricsClient.getPodMetrics(namespace);
  }

  // 아래는 Deployment/Pod "관리"(조작) 기능 — 전부 대상 namespace를 명시적으로 요구한다
  // (모니터링용 조회 API와 달리, 실수로 클러스터 전체에 조작이 나가면 안 되기 때문).
  _requireNamespace(namespace, opName) {
    if (!namespace) {
      throw new Error(`${opName}에는 namespace가 필요합니다`);
    }
  }

  async getDeployment(namespace, name) {
    this._requireNamespace(namespace, 'getDeployment');
    return this.appsApi.readNamespacedDeployment({ namespace, name });
  }

  async scaleDeployment(namespace, name, replicas) {
    this._requireNamespace(namespace, 'scaleDeployment');
    const deployment = await this.getDeployment(namespace, name);
    deployment.spec.replicas = replicas;
    return this.appsApi.replaceNamespacedDeployment({ namespace, name, body: deployment });
  }

  // `kubectl rollout restart`와 동일한 방식 — Pod 템플릿에 재시작 타임스탬프 annotation을 심어서
  // 새 ReplicaSet 롤아웃을 유도한다(이미지/스펙 변경 없이 Pod만 새로 띄움).
  async restartDeployment(namespace, name) {
    this._requireNamespace(namespace, 'restartDeployment');
    const deployment = await this.getDeployment(namespace, name);
    if (!deployment.spec.template.metadata) {
      deployment.spec.template.metadata = {};
    }
    if (!deployment.spec.template.metadata.annotations) {
      deployment.spec.template.metadata.annotations = {};
    }
    deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
    return this.appsApi.replaceNamespacedDeployment({ namespace, name, body: deployment });
  }

  async updateDeploymentImage(namespace, name, containerName, image) {
    this._requireNamespace(namespace, 'updateDeploymentImage');
    const deployment = await this.getDeployment(namespace, name);
    const containers = deployment.spec.template.spec.containers;
    const target = containerName
      ? containers.find((container) => container.name === containerName)
      : containers[0];
    if (!target) {
      throw new Error(`컨테이너를 찾을 수 없습니다: ${containerName}`);
    }
    target.image = image;
    return this.appsApi.replaceNamespacedDeployment({ namespace, name, body: deployment });
  }

  // 특정 Pod만 재시작하고 싶을 때(예: 하나만 이상 동작) — 상위 컨트롤러가 자동으로 새 Pod를 만든다.
  async deletePod(namespace, name) {
    this._requireNamespace(namespace, 'deletePod');
    return this.coreApi.deleteNamespacedPod({ namespace, name });
  }
}

module.exports = new K8sService();
