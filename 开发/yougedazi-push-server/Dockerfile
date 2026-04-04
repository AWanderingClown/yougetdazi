FROM node:20-alpine

WORKDIR /app

# 先建用户（与应用代码无关，固定不变，命中缓存）
RUN addgroup -g 1001 -S nodejs && adduser -S pushserver -u 1001

COPY package*.json ./

RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1

USER pushserver

CMD ["node", "dist/app.js"]
