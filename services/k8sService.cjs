'use strict';

const fs = require('fs');
const k8s = require('@kubernetes/client-node');
const config = require('../helpers/configHelper.cjs');
const logHelper = require('../helpers/logHelper.cjs');

// ArgoCD Application CR → 화면용 요약
//   resources: 앱이 관리하는 리소스별 sync/health (OutOfSync·Degraded 원인 찾기용)
function toArgoAppSummary(app) {
  const spec = app.spec ?? {};
  const status = app.status ?? {};
  const source = spec.source ?? spec.sources?.[0] ?? {};
  const op = status.operationState ?? {};
  const last = (status.history ?? []).at(-1) ?? null;
  return {
    name: app.metadata.name,
    project: spec.project,
    repoURL: source.repoURL,
    path: source.path ?? null,
    targetRevision: source.targetRevision ?? 'HEAD',
    destinationNamespace: spec.destination?.namespace ?? null,
    autoSync: Boolean(spec.syncPolicy?.automated),
    selfHeal: Boolean(spec.syncPolicy?.automated?.selfHeal),
    syncStatus: status.sync?.status ?? 'Unknown',
    revision: status.sync?.revision ?? null,
    healthStatus: status.health?.status ?? 'Unknown',
    healthMessage: status.health?.message ?? null,
    images: status.summary?.images ?? [],
    reconciledAt: status.reconciledAt ?? null,
    operation: op.phase ? {
      phase: op.phase,
      message: op.message ?? null,
      startedAt: op.startedAt ?? null,
      finishedAt: op.finishedAt ?? null,
      revision: op.syncResult?.revision ?? op.operation?.sync?.revision ?? null,
    } : null,
    lastDeployedAt: last?.deployedAt ?? null,
    conditions: (status.conditions ?? []).map((c) => ({ type: c.type, message: c.message })),
    resources: (status.resources ?? []).map((r) => ({
      kind: r.kind,
      name: r.name,
      namespace: r.namespace ?? null,
      syncStatus: r.status ?? null,
      healthStatus: r.health?.status ?? null,
      healthMessage: r.health?.message ?? null,
    })),
  };
}

class K8sService {
  constructor() {
    this.kubeConfig = new k8s.KubeConfig();
    this._loadKubeConfig();

    this.coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.networkingApi = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
    this.customApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);
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
  // RBAC도 이에 맞춰 ClusterRole/ClusterRoleBinding으로 구성돼 있어야 함(myorg/deploy-infra apps/k8s-manager/templates/rbac.yaml).
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
  //   previous: 직전에 죽은 컨테이너의 로그 (CrashLoopBackOff 원인 확인용)
  //   tailLines: 10 ~ 5000 (기본 500)
  async getPodLog(namespace, podName, { container, previous = false, tailLines = 500 } = {}) {
    if (!namespace) {
      throw new Error('getPodLog에는 namespace가 필요합니다 (클러스터 전체에서 Pod 이름만으로는 특정 불가)');
    }
    const lines = Math.min(Math.max(Number(tailLines) || 500, 10), 5000);
    return this.coreApi.readNamespacedPodLog({
      namespace, name: podName, container: container || undefined, previous: Boolean(previous), tailLines: lines,
    });
  }

  // pod 를 주면 그 Pod 에 대한 이벤트만 (Pod 상세 화면)
  async listEvents(namespace, { pod } = {}) {
    if (namespace && pod) {
      const res = await this.coreApi.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.name=${pod}` });
      return res.items;
    }
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

  // ── Pod 상세: 연관 리소스 ───────────────────────────────────────────
  // Pod 를 기준으로 "누가 만들었고(소유 체인), 무엇을 물고 있고(ConfigMap·Secret·PVC·SA), 누가 트래픽을
  // 보내는지(Service·HTTPRoute), 어느 ArgoCD 앱이 관리하는지"를 한 번에 돌려준다.
  // Secret 은 이름만 — 내용은 읽지 않는다(RBAC 에도 secrets 권한이 없다).
  // 일부 조회가 실패해도(권한·CRD 없음) 나머지는 돌려주고 warnings 에 남긴다.
  async getPodRelated(namespace, name) {
    this._requireNamespace(namespace, 'getPodRelated');
    const pod = await this.coreApi.readNamespacedPod({ namespace, name });
    const warnings = [];
    const soft = (label, promise) => promise.catch((err) => {
      warnings.push(`${label}: ${err.code ?? ''} ${err.body?.message ?? err.message}`.trim());
      return null;
    });

    // 소유 체인: Pod ← ReplicaSet ← Deployment (그 외 StatefulSet·DaemonSet·Job 은 이름만)
    const owners = [];
    let deployment = null;
    for (const ref of pod.metadata.ownerReferences ?? []) {
      owners.push({ kind: ref.kind, name: ref.name });
      if (ref.kind !== 'ReplicaSet') continue;
      const rs = await soft('ReplicaSet', this.appsApi.readNamespacedReplicaSet({ namespace, name: ref.name }));
      const depRef = rs?.metadata?.ownerReferences?.find((r) => r.kind === 'Deployment');
      if (depRef) {
        owners.push({ kind: 'Deployment', name: depRef.name });
        deployment = await soft('Deployment', this.appsApi.readNamespacedDeployment({ namespace, name: depRef.name }));
      }
    }

    // 참조하는 ConfigMap·Secret·PVC
    const configMaps = new Set();
    const secrets = new Set();
    const pvcs = new Set();
    for (const v of pod.spec.volumes ?? []) {
      if (v.configMap?.name) configMaps.add(v.configMap.name);
      if (v.secret?.secretName) secrets.add(v.secret.secretName);
      if (v.persistentVolumeClaim?.claimName) pvcs.add(v.persistentVolumeClaim.claimName);
      for (const src of v.projected?.sources ?? []) {
        if (src.configMap?.name) configMaps.add(src.configMap.name);
        if (src.secret?.name) secrets.add(src.secret.name);
      }
    }
    for (const c of [...(pod.spec.initContainers ?? []), ...(pod.spec.containers ?? [])]) {
      for (const ef of c.envFrom ?? []) {
        if (ef.configMapRef?.name) configMaps.add(ef.configMapRef.name);
        if (ef.secretRef?.name) secrets.add(ef.secretRef.name);
      }
      for (const e of c.env ?? []) {
        if (e.valueFrom?.configMapKeyRef?.name) configMaps.add(e.valueFrom.configMapKeyRef.name);
        if (e.valueFrom?.secretKeyRef?.name) secrets.add(e.valueFrom.secretKeyRef.name);
      }
    }
    for (const s of pod.spec.imagePullSecrets ?? []) if (s.name) secrets.add(s.name);
    // 자동 생성되는 kube-root-ca.crt 는 모든 Pod 에 붙으므로 뺀다
    configMaps.delete('kube-root-ca.crt');

    // 이 Pod 를 고르는 Service (selector 가 Pod 라벨에 모두 맞는 것)
    const labels = pod.metadata.labels ?? {};
    const svcList = await soft('Service', this.coreApi.listNamespacedService({ namespace }));
    const services = (svcList?.items ?? [])
      .filter((s) => {
        const sel = s.spec?.selector;
        return sel && Object.keys(sel).length > 0 && Object.entries(sel).every(([k, v]) => labels[k] === v);
      })
      .map((s) => ({
        name: s.metadata.name,
        type: s.spec.type,
        ports: (s.spec.ports ?? []).map((p) => `${p.port}${p.targetPort !== undefined ? `→${p.targetPort}` : ''}/${p.protocol ?? 'TCP'}`),
      }));

    // 그 Service 로 보내는 HTTPRoute (같은 namespace 의 route 만 — 다른 ns 에서 오는 route 는 ReferenceGrant 가 필요해 드물다)
    const svcNames = new Set(services.map((s) => s.name));
    const routeList = svcNames.size
      ? await soft('HTTPRoute', this.customApi.listNamespacedCustomObject({
        group: 'gateway.networking.k8s.io', version: 'v1', namespace, plural: 'httproutes',
      }))
      : null;
    const httpRoutes = (routeList?.items ?? [])
      .map((r) => {
        const rules = (r.spec?.rules ?? []).filter((rule) => (rule.backendRefs ?? []).some((b) =>
          (b.kind ?? 'Service') === 'Service' && (b.namespace ?? namespace) === namespace && svcNames.has(b.name)));
        if (!rules.length) return null;
        return {
          name: r.metadata.name,
          hostnames: r.spec?.hostnames ?? [],
          paths: rules.flatMap((rule) => (rule.matches ?? []).map((m) => m.path?.value).filter(Boolean)),
          services: Array.from(new Set(rules.flatMap((rule) => (rule.backendRefs ?? []).map((b) => b.name)))),
        };
      })
      .filter(Boolean);

    // ArgoCD 추적 표시 (Deployment 우선, 없으면 Pod 라벨)
    const tracking = deployment?.metadata?.annotations?.['argocd.argoproj.io/tracking-id'];
    const argoApp = tracking ? tracking.split(':')[0] : (deployment?.metadata?.labels?.['argocd.argoproj.io/instance'] ?? null);

    return {
      pod: { namespace, name },
      owners,
      argoApp,
      serviceAccount: pod.spec.serviceAccountName ?? null,
      configMaps: Array.from(configMaps).sort(),
      secrets: Array.from(secrets).sort(),
      persistentVolumeClaims: Array.from(pvcs).sort(),
      services,
      httpRoutes,
      warnings,
    };
  }

  // ── ArgoCD 배포 상태 (읽기 전용) ───────────────────────────────────
  // argocd 네임스페이스의 Application CR 을 읽어 화면용으로 요약한다. Sync 같은 조작은 ArgoCD UI 에서.
  async listArgoApps() {
    const res = await this.customApi.listNamespacedCustomObject({
      group: 'argoproj.io', version: 'v1alpha1', namespace: config.argocdNamespace, plural: 'applications',
    });
    return (res.items ?? []).map(toArgoAppSummary).sort((a, b) => a.name.localeCompare(b.name));
  }

  // 특정 Pod만 재시작하고 싶을 때(예: 하나만 이상 동작) — 상위 컨트롤러가 자동으로 새 Pod를 만든다.
  async deletePod(namespace, name) {
    this._requireNamespace(namespace, 'deletePod');
    return this.coreApi.deleteNamespacedPod({ namespace, name });
  }
}

module.exports = new K8sService();
