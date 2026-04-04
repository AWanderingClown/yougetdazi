// Mock data: 订单 - 用于手动测试各种状态
const now = Date.now();
const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

module.exports = {
  orders: [
    // ========== 待支付状态 ==========
    {
      id: 'o1',
      service_name: '逛街',
      status: 'pending_payment',
      total_price: 12000, // 120元
      created_at: now - 1 * ONE_MINUTE,
      order_no: 'PP202603290001',
      duration: 2,
      companion_id: 'c1',
      companion_name: '小雨',
      companion_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      appointment_date: '今天',
      appointment_time: '15:30'
    },
    {
      id: 'o2',
      service_name: '电竞陪玩',
      status: 'pending_payment',
      total_price: 8000, // 80元
      created_at: now - 5 * ONE_MINUTE,
      order_no: 'PP202603290002',
      duration: 1,
      companion_id: 'c2',
      companion_name: '阿杰',
      companion_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      appointment_date: '今天',
      appointment_time: '16:00'
    },
    // 超过15分钟待支付（模拟自动取消）
    {
      id: 'o3',
      service_name: 'K歌',
      status: 'pending_payment',
      total_price: 15000, // 150元
      created_at: now - 20 * ONE_MINUTE,
      order_no: 'PP202603290003',
      duration: 2,
      companion_id: 'c3',
      companion_name: '娜娜',
      companion_avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
      appointment_date: '今天',
      appointment_time: '14:00'
    },

    // ========== 等待接单状态（悬赏单）==========
    {
      id: 'o4',
      service_name: '户外运动',
      status: 'waiting_grab',
      total_price: 20000, // 200元
      created_at: now - 5 * ONE_MINUTE,
      order_no: 'PP202603290004',
      duration: 3,
      order_type: 'reward',
      required_count: 2,
      gender: 'any',
      appointment_date: '明天',
      appointment_time: '09:00'
    },
    {
      id: 'o5',
      service_name: '密室逃脱',
      status: 'waiting_grab',
      total_price: 18000, // 180元
      created_at: now - 20 * ONE_MINUTE,
      order_no: 'PP202603290005',
      duration: 2,
      order_type: 'reward',
      required_count: 1,
      gender: 'male',
      appointment_date: '今天',
      appointment_time: '19:30'
    },

    // ========== 已接单状态 ==========
    // 接单1分钟内（可免费取消）
    {
      id: 'o6',
      service_name: '茶艺',
      status: 'accepted',
      total_price: 10000, // 100元
      created_at: now - 10 * ONE_MINUTE,
      order_no: 'PP202603290006',
      duration: 2,
      companion_id: 'c5',
      companion_name: '可可',
      companion_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
      accepted_at: now - 30 * ONE_MINUTE, // 30秒前接单
      appointment_date: '今天',
      appointment_time: '16:30'
    },
    // 接单5分钟（扣50元取消）
    {
      id: 'o7',
      service_name: '运动陪练',
      status: 'accepted',
      total_price: 12000, // 120元
      created_at: now - 15 * ONE_MINUTE,
      order_no: 'PP202603290007',
      duration: 2,
      companion_id: 'c10',
      companion_name: '小凯',
      companion_avatar: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200',
      accepted_at: now - 5 * ONE_MINUTE, // 5分钟前接单
      appointment_date: '今天',
      appointment_time: '17:00'
    },

    // ========== 搭子已出发状态 ==========
    {
      id: 'o8',
      service_name: '美食探店',
      status: 'departed',
      total_price: 8000, // 80元
      created_at: now - 30 * ONE_MINUTE,
      order_no: 'PP202603290008',
      duration: 2,
      companion_id: 'c7',
      companion_name: '小美',
      companion_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      accepted_at: now - 25 * ONE_MINUTE,
      departed_at: now - 5 * ONE_MINUTE,
      appointment_date: '今天',
      appointment_time: '14:00'
    },

    // ========== 服务中状态 ==========
    // 服务10分钟（≤15分钟可取消）
    {
      id: 'o9',
      service_name: 'K歌',
      status: 'serving',
      total_price: 20000, // 200元
      created_at: now - ONE_HOUR,
      order_no: 'PP202603290009',
      duration: 2,
      companion_id: 'c3',
      companion_name: '娜娜',
      companion_avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
      service_start_time: now - 10 * ONE_MINUTE, // 服务开始10分钟
      appointment_date: '今天',
      appointment_time: '13:00'
    },
    // 服务20分钟（>15分钟不可取消，显示续费）
    {
      id: 'o10',
      service_name: '电竞陪玩',
      status: 'serving',
      total_price: 10000, // 100元
      created_at: now - 2 * ONE_HOUR,
      order_no: 'PP202603290010',
      duration: 1,
      companion_id: 'c2',
      companion_name: '阿杰',
      companion_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      service_start_time: now - 20 * ONE_MINUTE, // 服务开始20分钟
      appointment_date: '今天',
      appointment_time: '12:00'
    },

    // ========== 已完成状态 ==========
    // 5小时前完成（可评价）
    {
      id: 'o11',
      service_name: '逛街',
      status: 'completed',
      total_price: 12000, // 120元
      created_at: now - ONE_DAY,
      order_no: 'PP202603290011',
      duration: 2,
      companion_id: 'c1',
      companion_name: '小雨',
      companion_avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      completedAt: new Date(now - 5 * ONE_HOUR).toISOString(), // 5小时前完成
      hasReviewed: false,
      appointment_date: '昨天',
      appointment_time: '14:00'
    },
    // 25小时前完成（不可评价，超过24小时）
    {
      id: 'o12',
      service_name: '运动健身',
      status: 'completed',
      total_price: 16000, // 160元
      created_at: now - 2 * ONE_DAY,
      order_no: 'PP202603290012',
      duration: 2,
      companion_id: 'c4',
      companion_name: '小林',
      companion_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
      completedAt: new Date(now - 25 * ONE_HOUR).toISOString(), // 25小时前完成
      hasReviewed: false,
      appointment_date: '前天',
      appointment_time: '10:00'
    },
    // 已评价
    {
      id: 'o13',
      service_name: '茶艺',
      status: 'completed',
      total_price: 10000, // 100元
      created_at: now - ONE_DAY,
      order_no: 'PP202603290013',
      duration: 2,
      companion_id: 'c5',
      companion_name: '可可',
      companion_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
      completedAt: new Date(now - 8 * ONE_HOUR).toISOString(),
      hasReviewed: true,
      appointment_date: '昨天',
      appointment_time: '15:00'
    },

    // ========== 已取消状态 ==========
    // 用户主动取消
    {
      id: 'o14',
      service_name: '密室逃脱',
      status: 'cancelled',
      total_price: 15000, // 150元
      created_at: now - 3 * ONE_HOUR,
      order_no: 'PP202603290014',
      duration: 2,
      cancel_reason: '临时有事',
      cancelled_at: now - 2 * ONE_HOUR,
      appointment_date: '今天',
      appointment_time: '11:00'
    },
    // 超时自动取消
    {
      id: 'o15',
      service_name: '派对',
      status: 'cancelled',
      total_price: 25000, // 250元
      created_at: now - ONE_DAY,
      order_no: 'PP202603290015',
      duration: 4,
      cancel_reason: '超时未支付',
      cancelled_at: now - 20 * ONE_HOUR,
      appointment_date: '昨天',
      appointment_time: '20:00'
    }
  ]
};
