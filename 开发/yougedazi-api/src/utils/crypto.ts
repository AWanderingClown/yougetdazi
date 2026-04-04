/**
 * 敏感字段加密工具 — AES-256-GCM
 *
 * 用于加密数据库中的 real_name、id_card_no 等敏感字段。
 * 密钥从环境变量 FIELD_ENCRYPT_KEY 读取（32字节 hex 或 base64）。
 *
 * 存储格式: iv:authTag:ciphertext（均为 hex）
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12     // GCM 推荐 12 字节
const TAG_LENGTH = 16    // 128-bit auth tag

let _cachedKey: Buffer | null = null
function getKey(): Buffer {
  if (_cachedKey) return _cachedKey
  const raw = process.env.FIELD_ENCRYPT_KEY
  if (!raw) throw new Error('FIELD_ENCRYPT_KEY 环境变量未设置')
  // 支持 hex（64字符）或 base64（44字符）
  _cachedKey = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return _cachedKey
}

/**
 * 加密明文字符串，返回 "iv:tag:ciphertext" 格式
 */
export function encryptField(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH })

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

/**
 * 解密 "iv:tag:ciphertext" 格式字符串，返回明文
 */
export function decryptField(stored: string): string {
  const [ivHex, tagHex, cipherHex] = stored.split(':')
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error('无效的加密字段格式')
  }

  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * 判断值是否已经是加密格式（避免重复加密）
 */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(value)
}
