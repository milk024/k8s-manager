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

router.get('/repos/:owner/:repo/actions/runs', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 10;
    res.json(await giteaService.listActionRuns(req.params.owner, req.params.repo, limit));
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
