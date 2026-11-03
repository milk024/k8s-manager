'use strict';

const k8sService = require('../services/k8sService.cjs');
const giteaService = require('../services/giteaService.cjs');
const prometheusService = require('../services/prometheusService.cjs');
const monitorService = require('../services/monitorService.cjs');
const logHelper = require('../helpers/logHelper.cjs');

class Controller {
  async checkKubeApiServer() {
    try {
      await k8sService.listPods();
      return { name: 'kube-apiserver', ok: true };
    } catch (err) {
      return { name: 'kube-apiserver', ok: false, error: err.message };
    }
  }

  async checkGitea() {
    try {
      await giteaService.listRepos();
      return { name: 'gitea', ok: true };
    } catch (err) {
      return { name: 'gitea', ok: false, error: err.message };
    }
  }

  async checkPrometheus() {
    try {
      await prometheusService.queryPromQL('up');
      return { name: 'prometheus', ok: true };
    } catch (err) {
      return { name: 'prometheus', ok: false, error: err.message };
    }
  }

  async runStartupChecks() {
    const results = await Promise.all([
      this.checkKubeApiServer(),
      this.checkGitea(),
      this.checkPrometheus(),
    ]);
    results.forEach((result) => {
      if (result.ok) {
        logHelper.info('startup', `${result.name}: OK`);
      } else {
        logHelper.warn('startup', `${result.name}: FAIL (${result.error})`);
      }
    });
    return results;
  }

  startBackgroundJobs() {
    // ADR-001: 클러스터 전체(모든 namespace) Pod CPU/메모리 폴링 (5s 기본).
    monitorService.startPolling();
  }
}

module.exports = new Controller();
