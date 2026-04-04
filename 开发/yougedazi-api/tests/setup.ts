import { config } from 'dotenv'

// 在任何模块导入之前加载 .env.test，确保环境变量可用
config({ path: '.env.test' })
