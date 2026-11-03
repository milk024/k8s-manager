'use strict';

const express = require('express');
const cors = require('cors');
const config = require('../helpers/configHelper.cjs');
const logHelper = require('../helpers/logHelper.cjs');
const k8sRouter = require('./routers/k8sRouter.cjs');
const giteaRouter = require('./routers/giteaRouter.cjs');
const mirrorRouter = require('./routers/mirrorRouter.cjs');
const monitorRouter = require('./routers/monitorRouter.cjs');
const webhookRouter = require('./routers/webhookRouter.cjs');

class App {
  constructor() {
    this.instance = express();
    this._registerMiddleware();
    this._registerRoutes();
    this._registerErrorHandler();
  }

  _registerMiddleware() {
    // ADR-005: 같은 도메인+path 분리면 origin이 같아 사실상 통과되지만,
    // 서브도메인 분리로 갈 경우를 대비해 ALLOWED_ORIGINS로 화이트리스트를 둔다.
    this.instance.use(cors({
      origin: config.allowedOrigins.length ? config.allowedOrigins : true,
      credentials: true,
    }));
    this.instance.use(express.json());
  }

  _registerRoutes() {
    this.instance.get('/api/health', (req, res) => res.json({ status: 'ok' }));

    this.instance.use('/api/k8s', k8sRouter);
    this.instance.use('/api/gitea', giteaRouter);
    this.instance.use('/api/mirror', mirrorRouter);
    this.instance.use('/api/monitor', monitorRouter);
    this.instance.use('/webhook', webhookRouter);
  }

  _registerErrorHandler() {
    // eslint-disable-next-line no-unused-vars
    this.instance.use((err, req, res, next) => {
      logHelper.error('App', err.stack || err.message);
      res.status(500).json({ error: err.message });
    });
  }
}

module.exports = App;
