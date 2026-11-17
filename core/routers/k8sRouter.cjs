'use strict';

const express = require('express');
const k8sService = require('../../services/k8sService.cjs');
const auditHelper = require('../../helpers/auditHelper.cjs');

const router = express.Router();

router.get('/network-policies', async (req, res, next) => {
  try {
    res.json(await k8sService.listNetworkPolicies(req.query.namespace));
  } catch (err) {
    next(err);
  }
});

router.put('/network-policies/:name', async (req, res, next) => {
  try {
    await k8sService.upsertNetworkPolicy(req.query.namespace, req.body);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.delete('/network-policies/:name', async (req, res, next) => {
  try {
    await k8sService.deleteNetworkPolicy(req.query.namespace, req.params.name);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/deployments', async (req, res, next) => {
  try {
    res.json(await k8sService.listDeployments(req.query.namespace));
  } catch (err) {
    next(err);
  }
});

router.patch('/deployments/:name/scale', async (req, res, next) => {
  try {
    await k8sService.scaleDeployment(req.query.namespace, req.params.name, req.body.replicas);
    auditHelper.record({
      type: 'deployment-scale',
      namespace: req.query.namespace,
      name: req.params.name,
      replicas: req.body.replicas,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/deployments/:name/restart', async (req, res, next) => {
  try {
    await k8sService.restartDeployment(req.query.namespace, req.params.name);
    auditHelper.record({ type: 'deployment-restart', namespace: req.query.namespace, name: req.params.name });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch('/deployments/:name/image', async (req, res, next) => {
  try {
    await k8sService.updateDeploymentImage(req.query.namespace, req.params.name, req.body.container, req.body.image);
    auditHelper.record({
      type: 'deployment-image-update',
      namespace: req.query.namespace,
      name: req.params.name,
      container: req.body.container,
      image: req.body.image,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/pods', async (req, res, next) => {
  try {
    res.json(await k8sService.listPods(req.query.namespace));
  } catch (err) {
    next(err);
  }
});

router.delete('/pods/:name', async (req, res, next) => {
  try {
    await k8sService.deletePod(req.query.namespace, req.params.name);
    auditHelper.record({ type: 'pod-delete', namespace: req.query.namespace, name: req.params.name });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/pods/:name/logs', async (req, res, next) => {
  if (!req.query.namespace) {
    return res.status(400).json({ error: 'namespace query parameter is required' });
  }
  try {
    const log = await k8sService.getPodLog(req.query.namespace, req.params.name, {
      container: req.query.container,
      previous: req.query.previous === 'true',
      tailLines: req.query.tailLines,
    });
    res.type('text/plain').send(log ?? '');
  } catch (err) {
    next(err);
  }
});

// Pod 상세 화면: 소유 체인·ConfigMap·Secret(이름만)·PVC·Service·HTTPRoute·ArgoCD 앱
router.get('/pods/:name/related', async (req, res, next) => {
  if (!req.query.namespace) {
    return res.status(400).json({ error: 'namespace query parameter is required' });
  }
  try {
    res.json(await k8sService.getPodRelated(req.query.namespace, req.params.name));
  } catch (err) {
    next(err);
  }
});

// ?namespace=&pod= 를 주면 그 Pod 의 이벤트만
router.get('/events', async (req, res, next) => {
  try {
    res.json(await k8sService.listEvents(req.query.namespace, { pod: req.query.pod }));
  } catch (err) {
    next(err);
  }
});

// ArgoCD 배포 상태 (읽기 전용 — Sync 등 조작은 ArgoCD UI 에서)
router.get('/argocd/apps', async (req, res, next) => {
  try {
    res.json(await k8sService.listArgoApps());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
