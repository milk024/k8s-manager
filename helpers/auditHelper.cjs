'use strict';

const fs = require('fs');
const path = require('path');

class AuditHelper {
  constructor() {
    // ADR-020(로그/모니터링 체계 설계)가 대기 중 — 확정 전까지는 로컬 파일 append만 수행.
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, 'audit.log');
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  record(event) {
    this._ensureLogDir();
    const entry = { timestamp: new Date().toISOString(), ...event };
    fs.appendFileSync(this.logFile, `${JSON.stringify(entry)}\n`);
    return entry;
  }
}

module.exports = new AuditHelper();
