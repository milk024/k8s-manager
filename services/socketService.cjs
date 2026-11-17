'use strict';

const { Server } = require('socket.io');
const config = require('../helpers/configHelper.cjs');
const authHelper = require('../helpers/authHelper.cjs');

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
    // 로그인한 화면만 연결 (auth.token). 토큰이 만료되면 연결을 끊어 화면이 다시 로그인하게 한다
    this.io.use(authHelper.socketAuth());
    this.io.on('connection', (socket) => {
      socket.join('dashboard');
      const exp = socket.data.user?.exp;
      if (exp) {
        const timer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(exp * 1000 - Date.now(), 0), 2 ** 31 - 1));
        socket.on('disconnect', () => clearTimeout(timer));
      }
    });
    return this.io;
  }

  emitDashboard(event, payload) {
    if (!this.io) return;
    this.io.to('dashboard').emit(event, payload);
  }
}

module.exports = new SocketService();
