'use strict';

const express = require('express');
const monitorService = require('../../services/monitorService.cjs');

const router = express.Router();

router.get('/pods', async (req, res, next) => {
  try {
    res.json(await monitorService.getPodUsage(req.query.namespace));
  } catch (err) {
    next(err);
  }
});

router.get('/gpu', async (req, res, next) => {
  try {
    res.json(await monitorService.getGpuUtilization(req.query.namespace));
  } catch (err) {
    next(err);
  }
});

router.get('/disk-io', async (req, res, next) => {
  try {
    res.json(await monitorService.getDiskIo(req.query.node));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
