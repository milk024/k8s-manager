'use strict';

const http = require('http');
const App = require('./core/app.cjs');
const controller = require('./core/controller.cjs');
const socketService = require('./services/socketService.cjs');
const config = require('./helpers/configHelper.cjs');
const logHelper = require('./helpers/logHelper.cjs');

class Server {
  constructor() {
    this.app = new App();
    this.httpServer = http.createServer(this.app.instance);
    socketService.init(this.httpServer);
  }

  async start() {
    await controller.runStartupChecks();
    controller.startBackgroundJobs();

    this.httpServer.listen(config.port, () => {
      logHelper.info('Server', `k8s_manager listening on :${config.port}`);
    });
  }
}

new Server().start().catch((err) => {
  logHelper.error('Server', `Fatal startup error: ${err.stack || err.message}`);
  process.exit(1);
});
