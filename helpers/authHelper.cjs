'use strict';

const crypto = require('crypto');
const config = require('./configHelper.cjs');

// 모니터링 웹 로그인 = admin-manager 관리자 로그인. admin-manager 가 발급한 JWT(HS256, JWT_SECRET 공유)를
// 여기서 검증한다. 별도 계정·세션 저장소 없음.
//   REST: Authorization: Bearer <token>   (/api/health, /webhook/* 는 제외 — 웹훅은 각자 비밀값으로 검증)
//   socket.io: 연결할 때 auth.token, 토큰 만료 시각에 서버가 연결을 끊는다
// JWT_SECRET 이 없으면 모두 거부한다(fail closed). 로컬 개발에서만 AUTH_REQUIRED=false 로 끈다.

function b64urlDecode(part) {
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.code = 401;
  }
}

class AuthHelper {
  // 성공하면 payload({ sub, exp, ... }), 실패하면 AuthError
  verify(token) {
    const secret = config.auth.jwtSecret;
    if (!secret) throw new AuthError('서버 인증 설정(JWT_SECRET)이 없습니다');
    if (typeof token !== 'string') throw new AuthError('인증 토큰이 필요합니다');
    const parts = token.split('.');
    if (parts.length !== 3) throw new AuthError('토큰 형식이 올바르지 않습니다');
    const [h, p, sig] = parts;

    let header;
    let payload;
    try {
      header = JSON.parse(b64urlDecode(h).toString('utf8'));
      payload = JSON.parse(b64urlDecode(p).toString('utf8'));
    } catch {
      throw new AuthError('토큰 형식이 올바르지 않습니다');
    }
    // alg 고정 (none·RS256 등으로 바꿔치기 방지)
    if (header.alg !== 'HS256') throw new AuthError('지원하지 않는 토큰 알고리즘입니다');

    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const actual = b64urlDecode(sig);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      throw new AuthError('토큰 서명이 올바르지 않습니다');
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) throw new AuthError('로그인이 만료되었습니다');
    if (typeof payload.nbf === 'number' && payload.nbf > now) throw new AuthError('아직 쓸 수 없는 토큰입니다');
    return payload;
  }

  tokenFromHeader(req) {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }

  // express 미들웨어
  requireAuth() {
    return (req, res, next) => {
      if (!config.auth.required) return next();
      try {
        req.user = this.verify(this.tokenFromHeader(req));
        return next();
      } catch (err) {
        return res.status(401).json({ error: err.message });
      }
    };
  }

  // socket.io 미들웨어
  socketAuth() {
    return (socket, next) => {
      if (!config.auth.required) return next();
      try {
        socket.data.user = this.verify(socket.handshake.auth?.token);
        return next();
      } catch (err) {
        const e = new Error(err.message);
        e.data = { code: 401 };
        return next(e);
      }
    };
  }
}

module.exports = new AuthHelper();
