import { defineConfig } from 'prisma/config'
import 'dotenv/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // 启用迁移功能
    path: 'prisma/migrations',
  }
})
