// 模拟数据

// 公会信息
export const mockGuildInfo = {
  id: 1,
  name: '星辰娱乐公会',
  logo: 'https://placeholder.com/100x100',
  contact: '张经理',
  phone: '138****8888',
  email: 'contact@xingchen.com',
  address: '上海市浦东新区',
  createTime: '2024-01-15',
  status: 'active',
  permissions: ['all']
}

// 看板统计数据
export const mockDashboardStats = {
  totalCompanions: 128,
  onlineCompanions: 45,
  todayOrders: 86,
  todayRevenue: 15860,
  pendingSettlement: 45680
}

// 活跃度趋势数据
export const mockActivityTrend = {
  dates: ['03-20', '03-21', '03-22', '03-23', '03-24', '03-25', '03-26'],
  onlineCounts: [32, 38, 42, 35, 48, 52, 45],
  orderCounts: [56, 62, 78, 65, 82, 95, 86]
}

// 订单类型分布
export const mockOrderTypes = [
  { name: '游戏陪玩', value: 35 },
  { name: '语音聊天', value: 28 },
  { name: '线下活动', value: 15 },
  { name: '才艺展示', value: 12 },
  { name: '其他服务', value: 10 }
]

// 待处理事项
export const mockPendingTasks = {
  newApplications: 5,
  pendingComplaints: 2
}

// 搭子列表
export const mockCompanions = [
  {
    id: 1,
    nickname: '小鱼儿',
    avatar: 'https://placeholder.com/80x80',
    status: 'online',
    todayOrders: 8,
    monthIncome: 3850,
    joinTime: '2024-02-01',
    phone: '138****1234',
    wechat: 'wx****5678',
    rating: 4.8,
    tags: ['游戏高手', '声音甜美']
  },
  {
    id: 2,
    nickname: '阿狸',
    avatar: 'https://placeholder.com/80x80',
    status: 'offline',
    todayOrders: 3,
    monthIncome: 2100,
    joinTime: '2024-02-15',
    phone: '139****5678',
    wechat: 'wx****9012',
    rating: 4.6,
    tags: ['唱歌好听', '性格开朗']
  },
  {
    id: 3,
    nickname: '小北',
    avatar: 'https://placeholder.com/80x80',
    status: 'busy',
    todayOrders: 12,
    monthIncome: 5200,
    joinTime: '2024-01-20',
    phone: '137****9012',
    wechat: 'wx****3456',
    rating: 4.9,
    tags: ['颜值担当', '服务专业']
  },
  {
    id: 4,
    nickname: '夏天',
    avatar: 'https://placeholder.com/80x80',
    status: 'online',
    todayOrders: 6,
    monthIncome: 1680,
    joinTime: '2024-03-01',
    phone: '136****7890',
    wechat: 'wx****2345',
    rating: 4.5,
    tags: ['新手推荐']
  },
  {
    id: 5,
    nickname: '橙子',
    avatar: 'https://placeholder.com/80x80',
    status: 'offline',
    todayOrders: 0,
    monthIncome: 890,
    joinTime: '2024-03-10',
    phone: '135****3456',
    wechat: 'wx****6789',
    rating: 4.3,
    tags: ['学习成长中']
  }
]

// 入驻申请列表
export const mockApplications = [
  {
    id: 101,
    nickname: '新成员A',
    avatar: 'https://placeholder.com/80x80',
    applyTime: '2024-03-26 10:30',
    skills: ['王者荣耀', '和平精英'],
    experience: '2年陪玩经验',
    status: 'pending'
  },
  {
    id: 102,
    nickname: '新成员B',
    avatar: 'https://placeholder.com/80x80',
    applyTime: '2024-03-26 09:15',
    skills: ['唱歌', '聊天'],
    experience: '在校大学生，时间充裕',
    status: 'pending'
  }
]

// 订单列表
export const mockOrders = [
  {
    id: 'ORD202403260001',
    companionName: '小鱼儿',
    serviceType: '游戏陪玩',
    duration: 2,
    amount: 200,
    status: 'completed',
    createTime: '2024-03-26 14:30',
    userInfo: {
      nickname: '用户A***',
      orderCount: 12,
      note: '要求技术好，脾气好'
    }
  },
  {
    id: 'ORD202403260002',
    companionName: '阿狸',
    serviceType: '语音聊天',
    duration: 1,
    amount: 80,
    status: 'in_progress',
    createTime: '2024-03-26 15:00',
    userInfo: {
      nickname: '用户B***',
      orderCount: 3,
      note: '想找人聊天解闷'
    }
  },
  {
    id: 'ORD202403260003',
    companionName: '小北',
    serviceType: '才艺展示',
    duration: 0.5,
    amount: 150,
    status: 'pending',
    createTime: '2024-03-26 15:30',
    userInfo: {
      nickname: '用户C***',
      orderCount: 8,
      note: '想看舞蹈表演'
    }
  },
  {
    id: 'ORD202403260004',
    companionName: '夏天',
    serviceType: '游戏陪玩',
    duration: 3,
    amount: 240,
    status: 'cancelled',
    createTime: '2024-03-26 13:00',
    userInfo: {
      nickname: '用户D***',
      orderCount: 1,
      note: '临时有事取消'
    }
  }
]

// 结算数据
export const mockSettlement = {
  totalRevenue: 256800,
  totalCommission: 77040,
  availableBalance: 45680,
  frozenAmount: 12340,
  commissionRate: 0.30
}

// 佣金明细
export const mockCommissions = [
  {
    id: 1,
    orderId: 'ORD202403260001',
    companionName: '小鱼儿',
    amount: 200,
    commission: 60,
    createTime: '2024-03-26 16:30',
    status: 'settled'
  },
  {
    id: 2,
    orderId: 'ORD202403260002',
    companionName: '阿狸',
    amount: 80,
    commission: 24,
    createTime: '2024-03-26 16:00',
    status: 'pending'
  },
  {
    id: 3,
    orderId: 'ORD202403260003',
    companionName: '小北',
    amount: 150,
    commission: 45,
    createTime: '2024-03-26 15:30',
    status: 'pending'
  }
]

// 提现记录
export const mockWithdrawals = [
  {
    id: 1,
    amount: 20000,
    account: '工商银行(尾号8888)',
    applyTime: '2024-03-25 10:00',
    completeTime: '2024-03-25 14:30',
    status: 'completed'
  },
  {
    id: 2,
    amount: 15000,
    account: '工商银行(尾号8888)',
    applyTime: '2024-03-20 09:30',
    completeTime: null,
    status: 'processing'
  }
]

// 子账号列表
export const mockSubAccounts = [
  {
    id: 1,
    username: 'admin01',
    name: '管理员A',
    role: 'admin',
    status: 'active',
    lastLogin: '2024-03-26 15:30',
    createTime: '2024-01-15'
  },
  {
    id: 2,
    username: 'operator01',
    name: '运营小王',
    role: 'operator',
    status: 'active',
    lastLogin: '2024-03-26 10:00',
    createTime: '2024-02-01'
  },
  {
    id: 3,
    username: 'operator02',
    name: '运营小李',
    role: 'operator',
    status: 'inactive',
    lastLogin: '2024-03-20 16:00',
    createTime: '2024-02-15'
  }
]

// 角色列表
export const mockRoles = [
  {
    id: 1,
    name: 'admin',
    label: '超级管理员',
    permissions: ['all']
  },
  {
    id: 2,
    name: 'operator',
    label: '运营人员',
    permissions: ['companion:view', 'companion:audit', 'order:view', 'settlement:view']
  },
  {
    id: 3,
    name: 'finance',
    label: '财务人员',
    permissions: ['settlement:view', 'settlement:withdraw', 'order:view']
  }
]

// 操作日志
export const mockLogs = [
  {
    id: 1,
    operator: '管理员A',
    action: '审核通过',
    target: '搭子入驻申请',
    targetId: 'APP001',
    time: '2024-03-26 15:30',
    ip: '192.168.1.100'
  },
  {
    id: 2,
    operator: '运营小王',
    action: '更新状态',
    target: '搭子账号',
    targetId: 'COMP001',
    time: '2024-03-26 14:00',
    ip: '192.168.1.101'
  },
  {
    id: 3,
    operator: '管理员A',
    action: '申请提现',
    target: '提现记录',
    targetId: 'WD002',
    time: '2024-03-20 09:30',
    ip: '192.168.1.100'
  }
]

// 培训资料
export const mockTrainingMaterials = [
  {
    id: 1,
    title: '平台服务规范手册',
    type: 'rule',
    readCount: 128,
    isRead: true,
    updateTime: '2024-03-01'
  },
  {
    id: 2,
    title: '搭子服务标准流程',
    type: 'standard',
    readCount: 256,
    isRead: true,
    updateTime: '2024-03-10'
  },
  {
    id: 3,
    title: '公会管理制度V2.0',
    type: 'rule',
    readCount: 89,
    isRead: false,
    updateTime: '2024-03-20'
  },
  {
    id: 4,
    title: '新手指南：如何快速上手',
    type: 'guide',
    readCount: 312,
    isRead: true,
    updateTime: '2024-02-15'
  },
  {
    id: 5,
    title: '收入结算说明文档',
    type: 'standard',
    readCount: 167,
    isRead: false,
    updateTime: '2024-03-25'
  }
]
