'use strict';

// ADR-020(로그/모니터링 체계 설계)가 대기 중 — 확정 전까지는 콘솔 출력 포맷만 통일한다.
// 최종 로그 수집 방식(파일/외부 시스템 연동 등)이 정해지면 이 클래스 안에서만 바꾸면 된다.
class LogHelper {
  _format(level, scope, message) {
    return `[${new Date().toISOString()}] [${level}] [${scope}] ${message}`;
  }

  info(scope, message) {
    console.log(this._format('INFO', scope, message));
  }

  warn(scope, message) {
    console.warn(this._format('WARN', scope, message));
  }

  error(scope, message) {
    console.error(this._format('ERROR', scope, message));
  }
}

module.exports = new LogHelper();
