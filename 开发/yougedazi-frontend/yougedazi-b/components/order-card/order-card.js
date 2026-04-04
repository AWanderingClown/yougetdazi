// components/order-card/order-card.js
Component({
  properties: {
    order: {
      type: Object,
      value: {}
    },
    empty: {
      type: Boolean,
      value: false
    },
    emptyTitle: {
      type: String,
      value: '暂无订单'
    },
    emptyDesc: {
      type: String,
      value: '去工作台看看吧'
    },
    emptyAction: {
      type: String,
      value: ''
    }
  },

  data: {
    statusTextMap: {
      'pending_accept': '待接单',
      'accepted': '待服务',
      'serving': '服务中',
      'completed': '已完成',
      'cancelled': '已取消'
    }
  },

  methods: {
    getStatusText(status) {
      return this.data.statusTextMap[status] || status;
    },

    onTap(e) {
      this.triggerEvent('tap', { id: this.data.order.id });
    },

    onViewDetail() {
      this.triggerEvent('detail', { id: this.data.order.id });
    },

    onEmptyAction() {
      this.triggerEvent('emptyaction');
    }
  }
});