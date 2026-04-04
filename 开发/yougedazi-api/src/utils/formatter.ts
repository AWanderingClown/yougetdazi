/**
 * 命名格式转换工具
 * 用于数据库下划线命名与前端驼峰命名之间的转换
 */

/**
 * 将下划线命名转换为驼峰命名
 * @example user_name -> userName, created_at -> createdAt
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * 将驼峰命名转换为下划线命名
 * @example userName -> user_name, createdAt -> created_at
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * 递归将对象/数组中的所有下划线命名键转换为驼峰命名
 * 支持嵌套对象和数组
 */
export function snakeToCamel<T = any>(obj: any): T {
  // 处理 null 或 undefined
  if (obj === null || obj === undefined) {
    return obj as T
  }

  // 处理 Date 对象
  if (obj instanceof Date) {
    return obj as unknown as T
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => snakeToCamel(item)) as unknown as T
  }

  // 处理对象
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = toCamelCase(key)
      result[camelKey] = snakeToCamel(value)
    }
    return result as T
  }

  // 基础类型直接返回
  return obj as T
}

/**
 * 递归将对象/数组中的所有驼峰命名键转换为下划线命名
 * 支持嵌套对象和数组
 */
export function camelToSnake<T = any>(obj: any): T {
  // 处理 null 或 undefined
  if (obj === null || obj === undefined) {
    return obj as T
  }

  // 处理 Date 对象
  if (obj instanceof Date) {
    return obj as unknown as T
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => camelToSnake(item)) as unknown as T
  }

  // 处理对象
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = toSnakeCase(key)
      result[snakeKey] = camelToSnake(value)
    }
    return result as T
  }

  // 基础类型直接返回
  return obj as T
}

/**
 * 深度转换对象的键名（通用方法）
 * @param obj 要转换的对象
 * @param converter 键名转换函数
 */
function deepTransformKeys(
  obj: any,
  converter: (key: string) => string
): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (obj instanceof Date) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepTransformKeys(item, converter))
  }

  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[converter(key)] = deepTransformKeys(value, converter)
    }
    return result
  }

  return obj
}

/**
 * 批量转换数组中的每个对象
 */
export function transformArray<T = any>(
  arr: any[],
  direction: 'snake-to-camel' | 'camel-to-snake'
): T[] {
  if (!Array.isArray(arr)) {
    return arr
  }
  const transformer = direction === 'snake-to-camel' ? snakeToCamel : camelToSnake
  return arr.map(item => transformer(item))
}
