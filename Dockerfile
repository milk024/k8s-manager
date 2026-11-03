# ADR-039: Node.js 서비스 표준 — 베이스 이미지 버전 고정, 의존성/코드 레이어 분리.
FROM node:22.16.0-slim

WORKDIR /app

# 1) 의존성 레이어 (package.json/package-lock.json 변경 시에만 재실행됨)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) 코드 레이어
COPY . .

# root로 실행하지 않음 (ADR-039)
RUN mkdir -p /app/logs && chown -R node:node /app/logs
USER node

EXPOSE 8000

CMD ["node", "main.cjs"]
