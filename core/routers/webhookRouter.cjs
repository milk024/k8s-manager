'use strict';

const express = require('express');
const giteaService = require('../../services/giteaService.cjs');
const auditHelper = require('../../helpers/auditHelper.cjs');
const socketService = require('../../services/socketService.cjs');
const config = require('../../helpers/configHelper.cjs');

const router = express.Router();

// v2 아키텍처 e18: Alertmanager → 관리서버, 임계치 초과 알람 인바운드.
router.post('/alert', (req, res) => {
  const alerts = req.body.alerts || [];
  auditHelper.record({ type: 'alert', alerts });
  socketService.emitDashboard('alert:triggered', alerts);
  res.status(204).end();
});

// v2 아키텍처 e19: Gitea Daemon → 관리서버, push 이벤트 인바운드.
router.post('/gitea', (req, res) => {
  if (config.gitea.webhookSecret) {
    const signature = req.get('x-gitea-signature');
    if (signature !== config.gitea.webhookSecret) {
      return res.status(401).json({ error: 'invalid signature' });
    }
  }
  const event = req.get('x-gitea-event');
  // ADR-0052: Jenkins 가 남긴 커밋 상태(jenkins/build) → 'ci:build'. 폴링 없이 Gitea status 웹훅으로 받는다.
  if (event === 'status') {
    const build = giteaService.buildFromStatusEvent(req.body);
    if (build) {
      auditHelper.record({ type: 'ci-build', repo: `${build.owner}/${build.repo}`, sha: build.sha, status: build.status, buildNumber: build.buildNumber });
      socketService.emitDashboard('ci:build', build);
      giteaService.invalidateBuildSummaries();
    }
    return res.status(204).end();
  }
  if (event && event !== 'push') return res.status(204).end();
  const summary = giteaService.handlePushEvent(req.body);
  auditHelper.record({ type: 'gitea-push', ...summary });
  socketService.emitDashboard('gitea:push', summary);
  return res.status(204).end();
});

module.exports = router;
