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
  const summary = giteaService.handlePushEvent(req.body);
  auditHelper.record({ type: 'gitea-push', ...summary });
  socketService.emitDashboard('gitea:push', summary);
  // ADR-012, ADR-028: 실제 CI/CD 트리거는 여전히 Gitea Actions + Runner Pod 담당 —
  // 여기서는 그 결과(성공/실패)를 push 시점부터 짧게 폴링해서 실시간으로 알려주기만 한다.
  const owner = req.body.repository?.owner?.login;
  const repo = req.body.repository?.name;
  const sha = req.body.after;
  if (owner && repo && sha) {
    giteaService.pollActionsUntilDone(owner, repo, sha);
  }
  return res.status(204).end();
});

module.exports = router;
