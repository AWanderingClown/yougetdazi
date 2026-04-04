/**
 * Mock 数据生成工具
 */
const { TIMER } = require('./constants');

function generateMockTasks(page) {
  const baseTasks = [
    { id: 'task_001', user: { nickname: '小美', avatar: '/assets/icons/default-avatar.png' }, service_name: '逛街', gender: 'female', duration: 2, total_amount: 20000, distance: 500, created_at: '2024-03-27 14:00:00', can_grab: true, grabbed_count: 0 },
    { id: 'task_002', user: { nickname: '阿强', avatar: '/assets/icons/default-avatar.png' }, service_name: '运动', gender: 'male', duration: 1, total_amount: 15000, distance: 1200, created_at: '2024-03-27 13:30:00', can_grab: true, grabbed_count: 1 },
    { id: 'task_003', user: { nickname: '小兰', avatar: '/assets/icons/default-avatar.png' }, service_name: '电影', gender: 'female', duration: 3, total_amount: 30000, distance: 800, created_at: '2024-03-27 12:00:00', can_grab: true, grabbed_count: 0 },
    { id: 'task_004', user: { nickname: '大卫', avatar: '/assets/icons/default-avatar.png' }, service_name: '餐饮', gender: 'male', duration: 2, total_amount: 25000, distance: 2000, created_at: '2024-03-27 11:00:00', can_grab: false, grabbed_count: 3 },
    { id: 'task_005', user: { nickname: '小雪', avatar: '/assets/icons/default-avatar.png' }, service_name: '酒吧', gender: 'female', duration: 4, total_amount: 40000, distance: 3500, created_at: '2024-03-27 10:00:00', can_grab: true, grabbed_count: 0 },
    { id: 'task_006', user: { nickname: '阿杰', avatar: '/assets/icons/default-avatar.png' }, service_name: '棋牌', gender: 'male', duration: 2, total_amount: 18000, distance: 600, created_at: '2024-03-26 20:00:00', can_grab: true, grabbed_count: 1 },
    { id: 'task_007', user: { nickname: '小月', avatar: '/assets/icons/default-avatar.png' }, service_name: '电竞', gender: 'female', duration: 3, total_amount: 28000, distance: 1500, created_at: '2024-03-26 18:00:00', can_grab: true, grabbed_count: 0 },
    { id: 'task_008', user: { nickname: '大伟', avatar: '/assets/icons/default-avatar.png' }, service_name: '旅游', gender: 'male', duration: 8, total_amount: 80000, distance: 5000, created_at: '2024-03-26 15:00:00', can_grab: false, grabbed_count: 5 },
    { id: 'task_009', user: { nickname: '小琴', avatar: '/assets/icons/default-avatar.png' }, service_name: '茶艺', gender: 'female', duration: 2, total_amount: 22000, distance: 900, created_at: '2024-03-26 12:00:00', can_grab: true, grabbed_count: 0 },
    { id: 'task_010', user: { nickname: '阿明', avatar: '/assets/icons/default-avatar.png' }, service_name: '派对', gender: 'male', duration: 5, total_amount: 50000, distance: 2800, created_at: '2024-03-26 10:00:00', can_grab: true, grabbed_count: 2 }
  ];
  
  const start = (page - 1) * 10;
  return baseTasks.slice(start, start + 10);
}

function generateMockOrders(status) {
  if (status === 'accepted') {
    return [
      { id: 'order_101', order_no: 'DD20240327001', user: { nickname: '小美', avatar: '/assets/icons/default-avatar.png' }, service_name: '逛街', duration: 2, total_amount: 20000, created_at: '2024-03-27 14:00:00', status: 'accepted', address: '北京市朝阳区三里屯' },
      { id: 'order_102', order_no: 'DD20240327002', user: { nickname: '阿强', avatar: '/assets/icons/default-avatar.png' }, service_name: '运动', duration: 1, total_amount: 15000, created_at: '2024-03-27 13:00:00', status: 'accepted', address: '北京市海淀区五道口' },
      { id: 'order_103', order_no: 'DD20240326003', user: { nickname: '小兰', avatar: '/assets/icons/default-avatar.png' }, service_name: '电影', duration: 3, total_amount: 30000, created_at: '2024-03-26 18:00:00', status: 'accepted', address: '北京市东城区王府井' }
    ];
  } else if (status === 'serving') {
    return [
      { id: 'order_201', order_no: 'DD20240326002', user: { nickname: '小丽', avatar: '/assets/icons/default-avatar.png' }, service_name: '餐饮', duration: 2, total_amount: 25000, created_at: '2024-03-26 17:00:00', status: 'serving', address: '北京市朝阳区国贸' },
      { id: 'order_202', order_no: 'DD20240325001', user: { nickname: '小华', avatar: '/assets/icons/default-avatar.png' }, service_name: '棋牌', duration: 1, total_amount: 12000, created_at: '2024-03-25 19:00:00', status: 'serving', address: '北京市西城区西单' }
    ];
  } else if (status === 'completed') {
    return [
      { id: 'order_301', order_no: 'DD20240324001', user: { nickname: '小明', avatar: '/assets/icons/default-avatar.png' }, service_name: '逛街', duration: 2, total_amount: 20000, created_at: '2024-03-24 14:00:00', status: 'completed', address: '北京市朝阳区合生汇' },
      { id: 'order_302', order_no: 'DD40323002', user: { nickname: '小红', avatar: '/assets/icons/default-avatar.png' }, service_name: '运动', duration: 1, total_amount: 15000, created_at: '2024-03-23 10:00:00', status: 'completed', address: '北京市海淀区中关村' },
      { id: 'order_303', order_no: 'DD20240322003', user: { nickname: '小刚', avatar: '/assets/icons/default-avatar.png' }, service_name: '电影', duration: 3, total_amount: 30000, created_at: '2024-03-22 16:00:00', status: 'completed', address: '北京市朝阳区望京' }
    ];
  }
  return [];
}

function generateOrderDetail(orderId) {
  return {
    id: orderId,
    order_no: 'DD20240327001',
    user: { id: 'user_001', nickname: '小明', avatar: '/assets/icons/default-avatar.png', phone: '138****8888' },
    service_name: '逛街',
    service_category: '休闲娱乐',
    duration: 2,
    price_per_hour: 10000,
    total_amount: 20000,
    address: '北京市朝阳区三里屯太古里',
    latitude: 39.935,
    longitude: 116.447,
    appointment_time: '2024-03-27 15:00:00',
    status: 'accepted',
    status_text: '已接单',
    created_at: '2024-03-27 14:00:00',
    remark: '希望找个有趣的搭子一起逛街'
  };
}

function getMockData(url, options) {
  const method = options.method || 'GET';
  
  if (url === '/api/b/workbench') {
    return {
      code: 0,
      message: 'success',
      data: {
        today_income: 18800,
        today_orders: 3,
        completion_rate: 98,
        is_online: true,
        pending_orders: [
          { id: 'order_001', user: { nickname: '小明', avatar: '/assets/icons/default-avatar.png' }, service_name: '逛街', duration: 2, total_amount: 20000, status: 'pending_accept', remaining_seconds: TIMER.ACCEPT_COUNTDOWN },
          { id: 'order_002', user: { nickname: '小红', avatar: '/assets/icons/default-avatar.png' }, service_name: '运动', duration: 1, total_amount: 15000, status: 'pending_accept', remaining_seconds: TIMER.ACCEPT_COUNTDOWN - 300 },
          { id: 'order_003', user: { nickname: '小刚', avatar: '/assets/icons/default-avatar.png' }, service_name: '电影', duration: 3, total_amount: 30000, status: 'pending_accept', remaining_seconds: TIMER.ACCEPT_COUNTDOWN - 600 }
        ],
        processing_orders: [
          { id: 'order_004', user: { nickname: '小丽', avatar: '/assets/icons/default-avatar.png' }, service_name: '餐饮', duration: 2, total_amount: 25000, status: 'accepted', remaining_seconds: 7200 },
          { id: 'order_005', user: { nickname: '小华', avatar: '/assets/icons/default-avatar.png' }, service_name: '棋牌', duration: 1, total_amount: 12000, status: 'serving', remaining_seconds: 3600 }
        ]
      }
    };
  }

  if (url === '/api/tasks') {
    const page = options.data?.page || 1;
    const tasks = generateMockTasks(page);
    return {
      code: 0,
      message: 'success',
      data: {
        list: tasks,
        total: 20,
        page: page,
        page_size: 10
      }
    };
  }

  if (url === '/api/b/orders') {
    const status = options.data?.status || 'accepted';
    const orders = generateMockOrders(status);
    return {
      code: 0,
      message: 'success',
      data: {
        list: orders,
        total: orders.length,
        page: 1,
        page_size: 50
      }
    };
  }

  if (url === '/api/b/earnings') {
    return {
      code: 0,
      message: 'success',
      data: {
        today_income: 18800,
        week_income: 125600,
        month_income: 486000,
        total_income: 1256000,
        withdrawable_amount: 45600,
        pending_amount: 0
      }
    };
  }

  if (url === '/api/b/earnings/list') {
    return {
      code: 0,
      message: 'success',
      data: {
        list: [
          { id: 'income_001', type: 'service', amount: 20000, desc: '订单收入-逛街', created_at: '2024-03-27 14:30:00' },
          { id: 'income_002', type: 'service', amount: 15000, desc: '订单收入-运动', created_at: '2024-03-27 12:00:00' },
          { id: 'income_003', type: 'service', amount: 25000, desc: '订单收入-餐饮', created_at: '2024-03-26 18:30:00' },
          { id: 'income_004', type: 'other', amount: -5000, desc: '保证金退还', created_at: '2024-03-25 10:00:00' }
        ]
      }
    };
  }

  if (url === '/api/b/messages') {
    return {
      code: 0,
      message: 'success',
      data: {
        system_messages: [
          { id: 'sys_001', title: '认证通过', content: '您的实名认证已通过', created_at: '2024-03-27 10:00:00', read: false },
          { id: 'sys_002', title: '新订单提醒', content: '您有新的悬赏订单等待接单', created_at: '2024-03-26 15:30:00', read: true }
        ],
        chat_list: [
          { id: 'chat_001', user_id: 'user_001', user: { nickname: '小明', avatar: '/assets/icons/default-avatar.png' }, last_message: '请问什么时候可以接单？', created_at: '2024-03-27 14:00:00', unread_count: 2 },
          { id: 'chat_002', user_id: 'user_002', user: { nickname: '小红', avatar: '/assets/icons/default-avatar.png' }, last_message: '好的，已到达', created_at: '2024-03-27 12:30:00', unread_count: 0 }
        ]
      }
    };
  }

  if (url.startsWith('/api/b/orders/')) {
    const orderId = url.split('/')[4];
    return {
      code: 0,
      message: 'success',
      data: generateOrderDetail(orderId)
    };
  }

  if (url.includes('/grab')) {
    return {
      code: 0,
      message: 'success',
      data: { orderId: url.split('/')[2] }
    };
  }

  if (url.includes('/start') || url.includes('/complete') || url.includes('/cancel')) {
    return { code: 0, message: 'success' };
  }

  return { code: 0, message: 'success', data: null };
}

module.exports = {
  generateMockTasks,
  generateMockOrders,
  generateOrderDetail,
  getMockData
};
