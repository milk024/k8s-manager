'use strict';

const express = require('express');
const giteaService = require('../../services/giteaService.cjs');

const router = express.Router();

router.get('/repos', async (req, res, next) => {
  try {
    res.json(await giteaService.listRepos());
  } catch (err) {
    next(err);
  }
});

router.get('/repos/:owner/:repo', async (req, res, next) => {
  try {
    res.json(await giteaService.getRepo(req.params.owner, req.params.repo));
  } catch (err) {
    next(err);
  }
});

// 빌드 화면: CI 저장소별 최신 커밋·최근 빌드·최근 성공 빌드 (10초 캐시)
router.get('/builds', async (req, res, next) => {
  try {
    res.json(await giteaService.listBuildSummaries(req.query.owner || 'myorg'));
  } catch (err) {
    next(err);
  }
});

// Jenkins 빌드 이력 (Gitea 커밋 상태 jenkins/build 기준, main 최근 커밋)
router.get('/repos/:owner/:repo/builds', async (req, res, next) => {
  try {
    res.json(await giteaService.listBuilds(req.params.owner, req.params.repo, req.query.limit, req.query.branch || 'main'));
  } catch (err) {
    next(err);
  }
});

router.post('/repos/:owner/:repo/webhook', async (req, res, next) => {
  try {
    res.json(await giteaService.createWebhookIfMissing(req.params.owner, req.params.repo, req.body.webhookUrl));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
