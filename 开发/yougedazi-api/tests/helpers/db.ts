import { prisma } from '../../src/lib/prisma.js'

export async function cleanDatabase() {
  // Sequential delete without transaction to avoid timeout/deadlock issues
  // Order: child tables first, then parent tables
  try { await prisma.message.deleteMany() } catch (e) {}
  try { await prisma.messageSession.deleteMany() } catch (e) {}
  try { await prisma.review.deleteMany() } catch (e) {}
  try { await prisma.orderRenewal.deleteMany() } catch (e) {}
  try { await prisma.refundRecord.deleteMany() } catch (e) {}
  try { await prisma.paymentRecord.deleteMany() } catch (e) {}
  try { await prisma.orderOperationLog.deleteMany() } catch (e) {}
  try { await prisma.orderCurrentLocation.deleteMany() } catch (e) {}
  try { await prisma.orderLocationHistory.deleteMany() } catch (e) {}
  try { await prisma.settlement.deleteMany() } catch (e) {}
  try { await prisma.withdrawal.deleteMany() } catch (e) {}
  try { await prisma.depositTransaction.deleteMany() } catch (e) {}
  try { await prisma.companionAuditRecord.deleteMany() } catch (e) {}
  try { await prisma.companionService.deleteMany() } catch (e) {}
  try { await prisma.adminOperationLog.deleteMany() } catch (e) {}
  try { await prisma.order.deleteMany() } catch (e) {}
  try { await prisma.companion.deleteMany() } catch (e) {}
  try { await prisma.user.deleteMany() } catch (e) {}
  try { await prisma.adminUser.deleteMany() } catch (e) {}
  try { await prisma.dailyStat.deleteMany() } catch (e) {}
  try { await prisma.platformConfig.deleteMany() } catch (e) {}
  try { await prisma.systemConfig.deleteMany() } catch (e) {}
  try { await prisma.announcement.deleteMany() } catch (e) {}
}

export async function createUser(data?: { id?: string; openid?: string; nickname?: string }) {
  // 使用纯 UUID 作为 ID，确保通过路由层 z.string().uuid() 验证
  const id = data?.id ?? crypto.randomUUID()
  return prisma.user.create({
    data: {
      id,
      openid: data?.openid ?? `openid-${id}`,
      nickname: data?.nickname ?? '测试用户',
    },
  })
}

export async function createCompanion(data?: {
  id?: string
  openid?: string
  nickname?: string
  audit_status?: 'pending' | 'approved' | 'rejected'
  is_online?: boolean
  is_working?: boolean
  deposit_level?: 'none' | 'basic' | 'premium'
}) {
  // 使用纯 UUID 作为 ID，确保通过路由层 z.string().uuid() 验证
  const id = data?.id ?? crypto.randomUUID()
  return prisma.companion.create({
    data: {
      id,
      openid: data?.openid ?? `openid-${id}`,
      nickname: data?.nickname ?? '测试搭子',
      audit_status: data?.audit_status ?? 'approved',
      is_online: data?.is_online ?? true,
      is_working: data?.is_working ?? false,
      deposit_level: data?.deposit_level ?? 'basic',
    },
  })
}

export async function createCompanionService(companionId: string, data?: { service_name?: string; hourly_price?: number; is_active?: boolean }) {
  return prisma.companionService.create({
    data: {
      companion_id: companionId,
      service_name: data?.service_name ?? '陪玩游戏',
      hourly_price: data?.hourly_price ?? 10000,
      is_active: data?.is_active ?? true,
    },
  })
}

export async function createOrder(data: {
  user_id: string
  companion_id?: string | null
  service_id?: string
  status?:
    | 'pending_payment'
    | 'pending_accept'
    | 'waiting_grab'
    | 'accepted'
    | 'serving'
    | 'completed'
    | 'cancelled'
  order_type?: 'direct' | 'reward'
  total_amount?: number
  paid_amount?: number
  service_name?: string
  hourly_price?: number
  duration?: number
  service_start_at?: Date
  service_end_at?: Date
  completed_at?: Date
  cancelled_at?: Date
}) {
  const orderNo = `YGZ${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  return prisma.order.create({
    data: {
      order_no: orderNo,
      user_id: data.user_id,
      companion_id: data.companion_id ?? null,
      service_id: data.service_id ?? null,
      status: data.status ?? 'pending_payment',
      order_type: data.order_type ?? 'direct',
      total_amount: data.total_amount ?? 10000,
      paid_amount: data.paid_amount ?? 0,
      service_name: data.service_name ?? '陪玩游戏',
      hourly_price: data.hourly_price ?? 10000,
      duration: data.duration ?? 1,
      service_start_at: data.service_start_at ?? null,
      service_end_at: data.service_end_at ?? null,
      completed_at: data.completed_at ?? null,
      cancelled_at: data.cancelled_at ?? null,
    },
  })
}

export async function createAdmin(data?: { id?: string; username?: string; password?: string; role?: string }) {
  // 使用纯 UUID 作为 ID
  const id = data?.id ?? crypto.randomUUID()
  return prisma.adminUser.create({
    data: {
      id,
      username: data?.username ?? `admin_${Date.now()}`,
      password: data?.password ?? '$2b$12$dummyhashfordummyadminuser123456789012',
      role: (data?.role as any) ?? 'super_admin',
    },
  })
}
