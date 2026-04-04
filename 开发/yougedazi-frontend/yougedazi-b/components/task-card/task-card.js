// components/task-card/task-card.js
Component({
  properties: {
    task: {
      type: Object,
      value: {}
    },
    empty: {
      type: Boolean,
      value: false
    },
    emptyTitle: {
      type: String,
      value: '暂无任务'
    },
    emptyDesc: {
      type: String,
      value: '稍后再来看看吧~'
    }
  },

  methods: {
    onTap(e) {
      this.triggerEvent('tap', { id: this.data.task.id });
    },
    onGrab(e) {
      e.stopPropagation();
      const canGrab = e.currentTarget.dataset.canGrab;
      if (canGrab) {
        this.triggerEvent('grab', { id: this.data.task.id });
      }
    }
  }
});