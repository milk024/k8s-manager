'use strict';

const express = require('express');
const cors = require('cors');
const config = require('../helpers/configHelper.cjs');
const logHelper = require('../helpers/logHelper.cjs');
const authHelper = require('../helpers/authHelper.cjs');
const k8sRouter = require('./routers/k8sRouter.cjs');
const giteaRouter = require('./routers/giteaRouter.cjs');
const mirrorRouter = require('./routers/mirrorRouter.cjs');
const monitorRouter = require('./routers/monitorRouter.cjs');
const webhookRouter = require('./routers/webhookRouter.cjs');

// K8s 클라이언트 오류의 body 는 JSON 문자열일 때가 있다 → message 만 꺼낸다
function safeK8sMessage(body) {
  try {
    return JSON.parse(body).message ?? null;
  } catch {
    return null;
  }
}

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

    // /api/* 는 로그인 필요 (health 는 위에서 먼저 응답). /webhook/* 는 Gitea·Alertmanager 가 부르므로 제외
    this.instance.use('/api', authHelper.requireAuth());
    this.instance.use('/api/k8s', k8sRouter);
    this.instance.use('/api/gitea', giteaRouter);
    this.instance.use('/api/mirror', mirrorRouter);
    this.instance.use('/api/monitor', monitorRouter);
    this.instance.use('/webhook', webhookRouter);
  }

  _registerErrorHandler() {
    // eslint-disable-next-line no-unused-vars
    this.instance.use((err, req, res, next) => {
      // K8s API 의 400/403/404 는 그대로 전달 (예: 없는 Pod → 404). 나머지는 500
      const status = [400, 403, 404].includes(err.code) ? err.code : 500;
      if (status === 500) logHelper.error('App', err.stack || err.message);
      const message = err.body?.message ?? (typeof err.body === 'string' ? safeK8sMessage(err.body) : null) ?? err.message;
      res.status(status).json({ error: message });
    });
  }
}

module.exports = App;
