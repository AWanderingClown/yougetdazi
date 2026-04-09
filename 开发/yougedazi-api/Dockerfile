FROM node:20-alpine

WORKDIR /app

# 先复制 package 文件，利用 Docker 层缓存
COPY package*.json ./

# 生产依赖（不安装 devDependencies）
RUN npm install --omit=dev

# 复制构建产物和 Prisma 文件
COPY dist/ ./dist/
COPY prisma/ ./prisma/

# 生成 Prisma Client（必须在 node_modules 安装后执行）
RUN npx prisma generate

EXPOSE 3000

# 使用非 root 用户运行（安全最佳实践）
RUN addgroup -g 1001 -S nodejs && adduser -S ppmate -u 1001
USER ppmate

CMD ["node", "dist/app.js"]
