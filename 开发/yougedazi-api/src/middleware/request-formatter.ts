import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { camelToSnake, snakeToCamel } from '../utils/formatter.js'

/**
 * 请求/响应数据格式转换中间件
 * 
 * 功能：
 * 1. 将前端传入的驼峰命名请求体转换为下划线命名（存入数据库）
 * 2. 将数据库返回的下划线命名响应体转换为驼峰命名（返回给前端）
 * 
 * 注意：
 * - 只转换 JSON 格式的请求体和响应体
 * - 跳过文件上传等特殊请求
 * - 错误响应不转换（保持原有格式）
 */

export interface RequestFormatterOptions {
  /** 是否转换请求体（camel -> snake） */
  transformRequest?: boolean
  /** 是否转换响应体（snake -> camel） */
  transformResponse?: boolean
  /** 跳过的路由路径（支持通配符 *） */
  skipRoutes?: string[]
}

const defaultOptions: RequestFormatterOptions = {
  transformRequest: true,
  transformResponse: true,
  skipRoutes: ['/health', '/api/webhook/*', '/api/admin/*'],
}

/**
 * 检查路径是否应该被跳过
 */
function shouldSkipPath(path: string, skipPatterns: string[]): boolean {
  return skipPatterns.some(pattern => {
    // 精确匹配
    if (pattern === path) {
      return true
    }
    // 通配符匹配 /api/webhook/*
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1)
      return path.startsWith(prefix)
    }
    return false
  })
}

/**
 * 检查内容类型是否为 JSON
 */
function isJsonContent(contentType: string | undefined): boolean {
  if (!contentType) return false
  return contentType.includes('application/json')
}

/**
 * 获取请求路径
 */
function getRequestPath(request: FastifyRequest): string {
  // 优先使用 routerPath，如果不存在则使用 url
  return (request as any).routerPath || request.url
}

/**
 * Fastify 插件：请求/响应数据格式转换
 */
const requestFormatterPlugin: FastifyPluginAsync<RequestFormatterOptions> = async (
  app: FastifyInstance,
  opts: RequestFormatterOptions
): Promise<void> => {
  const options = { ...defaultOptions, ...opts }

  // ============================================================
  // 请求预处理：将 camelCase 转换为 snake_case
  // ============================================================
  if (options.transformRequest) {
    app.addHook('preParsing', async (request, reply, payload) => {
      const path = getRequestPath(request)
      
      // 检查是否需要跳过
      if (shouldSkipPath(path, options.skipRoutes || [])) {
        return payload
      }

      // 只处理 JSON 请求
      const contentType = request.headers['content-type']
      if (!isJsonContent(contentType)) {
        return payload
      }

      // 转换 query 参数
      if (request.query && typeof request.query === 'object') {
        request.query = camelToSnake(request.query)
      }

      return payload
    })

    // 在 preHandler 阶段转换请求体
    app.addHook('preHandler', async (request, reply) => {
      const path = getRequestPath(request)
      
      if (shouldSkipPath(path, options.skipRoutes || [])) {
        return
      }

      // 转换请求体
      if (request.body && typeof request.body === 'object' && !(request.body instanceof Buffer)) {
        request.body = camelToSnake(request.body)
      }
    })
  }

  // ============================================================
  // 响应后处理：将 snake_case 转换为 camelCase
  // ============================================================
  if (options.transformResponse) {
    app.addHook('onSend', async (request, reply, payload) => {
      const path = getRequestPath(request)
      
      // 检查是否需要跳过
      if (shouldSkipPath(path, options.skipRoutes || [])) {
        return payload
      }

      // 只处理 JSON 响应
      const contentType = reply.getHeader('content-type') as string | undefined
      if (!isJsonContent(contentType)) {
        return payload
      }

      // 如果 payload 是字符串，尝试解析为 JSON
      let data: any
      try {
        data = typeof payload === 'string' ? JSON.parse(payload) : payload
      } catch {
        return payload
      }

      // 不转换错误响应（包含 errorKey 或 HTTP 状态码 >= 400）
      if (data && (data.errorKey || reply.statusCode >= 400)) {
        return payload
      }

      // 转换数据字段
      if (data && typeof data === 'object') {
        // 转换整个响应对象（保留 code, message 等字段）
        const transformed = snakeToCamel(data)
        return JSON.stringify(transformed)
      }

      return payload
    })
  }
}

// fp() 破除 Fastify 插件封装，使 hooks 作用于所有路由（不止插件自身作用域）
export default fp(requestFormatterPlugin, { name: 'request-formatter' })

/**
 * 手动包装响应数据的辅助函数
 * 用于在路由中手动转换数据（如果不使用全局中间件）
 * 
 * 用法示例：
 * ```typescript
 * const data = await prisma.order.findMany()
 * return reply.send({
 *   code: ErrorCode.SUCCESS,
 *   message: 'ok',
 *   data: formatResponse(data)  // 自动转换为驼峰命名
 * })
 * ```
 */
export function formatResponse<T = any>(data: T): T {
  return snakeToCamel(data)
}

/**
 * 手动解析请求体的辅助函数
 * 用于在路由中手动转换请求数据
 * 
 * 用法示例：
 * ```typescript
 * const body = request.body as any
 * const formattedBody = formatRequest(body)  // 自动转换为下划线命名
 * ```
 */
export function formatRequest<T = any>(data: T): T {
  return camelToSnake(data)
}
