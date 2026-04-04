// Mock data: 搭子/ companions - 用于手动测试
module.exports = {
  companions: [
    {
      id: 'c1',
      nickname: '小雨',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      gender: 'female',
      age: 22,
      isOnline: true,
      distance: 0.8,
      location: '思明区',
      signature: '喜欢逛街、看电影，希望能给你带来愉快的陪伴时光~',
      services: [
        { id: 1, name: '逛街', icon: '/assets/icons/categories/购物车.png', price: 50, duration: 60, tags: ['购物', '美食'] },
        { id: 2, name: '电影/影视', icon: '/assets/icons/categories/影视.png', price: 80, duration: 120, tags: ['休闲', '娱乐'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
      ],
      rating: 4.9,
      orderCount: 128
    },
    {
      id: 'c2',
      nickname: '阿杰',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
      gender: 'male',
      age: 25,
      isOnline: true,
      distance: 1.5,
      location: '湖里区',
      signature: '电竞高手，王者荣耀/吃鸡带你飞',
      services: [
        { id: 3, name: '电竞', icon: '/assets/icons/categories/游戏.png', price: 100, duration: 60, tags: ['游戏', '电竞'] },
        { id: 4, name: '运动', icon: '/assets/icons/categories/棒球.png', price: 80, duration: 90, tags: ['运动', '健康'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'
      ],
      rating: 4.8,
      orderCount: 89
    },
    {
      id: 'c3',
      nickname: '娜娜',
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
      gender: 'female',
      age: 24,
      isOnline: false,
      distance: 3.2,
      location: '集美区',
      signature: 'K歌达人，麦霸一枚，一起嗨唱吧！',
      services: [
        { id: 5, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 150, duration: 120, tags: ['唱歌', '娱乐'] },
        { id: 6, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 200, duration: 180, tags: ['喝酒', '社交'] }
      ],
      certifications: { wechat: true, phone: false, realname: true },
      album: [
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400'
      ],
      rating: 4.7,
      orderCount: 256
    },
    {
      id: 'c4',
      nickname: '小林',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
      gender: 'male',
      age: 27,
      isOnline: true,
      distance: 0.5,
      location: '思明区',
      signature: '户外运动爱好者，徒步、骑行、爬山都行',
      services: [
        { id: 7, name: '运动', icon: '/assets/icons/categories/棒球.png', price: 120, duration: 180, tags: ['运动', '户外'] },
        { id: 8, name: '旅游向导', icon: '/assets/icons/categories/飞机.png', price: 300, duration: 480, tags: ['旅游', '向导'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400'
      ],
      rating: 5.0,
      orderCount: 67
    },
    {
      id: 'c5',
      nickname: '可可',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
      gender: 'female',
      age: 21,
      isOnline: true,
      distance: 2.1,
      location: '海沧区',
      signature: '茶艺师，喜欢安静喝茶聊天的时光',
      services: [
        { id: 9, name: '茶艺', icon: '/assets/icons/categories/茶壶.png', price: 100, duration: 120, tags: ['茶艺', '文化'] },
        { id: 10, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png', price: 80, duration: 120, tags: ['棋牌', '休闲'] }
      ],
      certifications: { wechat: false, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
      ],
      rating: 4.6,
      orderCount: 45
    },
    {
      id: 'c6',
      nickname: '大伟',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
      gender: 'male',
      age: 28,
      isOnline: false,
      distance: 4.5,
      location: '同安区',
      signature: '密室逃脱爱好者，智力解谜高手',
      services: [
        { id: 11, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png', price: 150, duration: 120, tags: ['密室', '解谜'] },
        { id: 12, name: '棋牌/密室', icon: '/assets/icons/categories/扑克.png', price: 120, duration: 240, tags: ['剧本杀', '推理'] }
      ],
      certifications: { wechat: true, phone: true, realname: false },
      album: [
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400'
      ],
      rating: 4.8,
      orderCount: 112
    },
    {
      id: 'c7',
      nickname: '小美',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      gender: 'female',
      age: 23,
      isOnline: true,
      distance: 1.8,
      location: '翔安区',
      signature: '美食达人，带你吃遍全城美食',
      services: [
        { id: 13, name: '餐饮', icon: '/assets/icons/categories/刀叉.png', price: 80, duration: 120, tags: ['美食', '探店'] },
        { id: 14, name: '逛街', icon: '/assets/icons/categories/购物车.png', price: 60, duration: 60, tags: ['购物', '时尚'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
      ],
      rating: 4.9,
      orderCount: 178
    },
    {
      id: 'c8',
      nickname: '阿龙',
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200',
      gender: 'male',
      age: 26,
      isOnline: true,
      distance: 2.5,
      location: '湖里区',
      signature: '派对达人，气氛组担当',
      services: [
        { id: 15, name: '派对', icon: '/assets/icons/categories/派对.png', price: 250, duration: 240, tags: ['派对', '社交'] },
        { id: 16, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 200, duration: 180, tags: ['喝酒', '蹦迪'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400'
      ],
      rating: 4.7,
      orderCount: 203
    },
    {
      id: 'c9',
      nickname: '静怡',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
      gender: 'female',
      age: 25,
      isOnline: false,
      distance: 5.2,
      location: '集美区',
      signature: '摄影师，帮你拍出美美的照片',
      services: [
        { id: 17, name: '电影/影视', icon: '/assets/icons/categories/影视.png', price: 200, duration: 180, tags: ['摄影', '拍照'] },
        { id: 18, name: '旅游向导', icon: '/assets/icons/categories/飞机.png', price: 280, duration: 480, tags: ['旅游', '向导'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400'
      ],
      rating: 5.0,
      orderCount: 92
    },
    {
      id: 'c10',
      nickname: '小凯',
      avatar: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200',
      gender: 'male',
      age: 24,
      isOnline: true,
      distance: 0.3,
      location: '思明区',
      signature: '运动达人，篮球、羽毛球、游泳都会',
      services: [
        { id: 19, name: '运动', icon: '/assets/icons/categories/棒球.png', price: 100, duration: 120, tags: ['运动', '健身'] },
        { id: 20, name: '电竞', icon: '/assets/icons/categories/游戏.png', price: 80, duration: 60, tags: ['游戏', '电竞'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400'
      ],
      rating: 4.8,
      orderCount: 156
    },
    {
      id: 'c11',
      nickname: '甜甜',
      avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200',
      gender: 'female',
      age: 22,
      isOnline: true,
      distance: 1.2,
      location: '湖里区',
      signature: '萌妹子，喜欢猫咪和甜品',
      services: [
        { id: 21, name: '餐饮', icon: '/assets/icons/categories/刀叉.png', price: 80, duration: 120, tags: ['猫咪', '休闲'] },
        { id: 22, name: '餐饮', icon: '/assets/icons/categories/刀叉.png', price: 70, duration: 90, tags: ['甜品', '美食'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400'
      ],
      rating: 4.9,
      orderCount: 134
    },
    {
      id: 'c12',
      nickname: '老张',
      avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200',
      gender: 'male',
      age: 30,
      isOnline: false,
      distance: 6.0,
      location: '海沧区',
      signature: '成熟稳重，商务应酬、酒局陪同',
      services: [
        { id: 23, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 500, duration: 180, tags: ['商务', '应酬'] },
        { id: 24, name: '酒吧/K歌', icon: '/assets/icons/categories/鸡尾酒.png', price: 400, duration: 180, tags: ['喝酒', '社交'] }
      ],
      certifications: { wechat: true, phone: true, realname: true },
      album: [
        'https://images.unsplash.com/photo-1463453091185-61582044d556?w=400'
      ],
      rating: 4.9,
      orderCount: 78
    }
  ]
};
