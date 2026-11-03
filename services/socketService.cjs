'use strict';

const { Server } = require('socket.io');
const config = require('../helpers/configHelper.cjs');

class SocketService {
  constructor() {
    this.io = null;
  }

  init(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.allowedOrigins.length ? config.allowedOrigins : true,
        credentials: true,
      },
    });
    this.io.on('connection', (socket) => {
      socket.join('dashboard');
    });
    return this.io;
  }

  emitDashboard(event, payload) {
    if (!this.io) return;
    this.io.to('dashboard').emit(event, payload);
  }
}

module.exports = new SocketService();
