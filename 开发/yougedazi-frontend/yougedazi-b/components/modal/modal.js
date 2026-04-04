// components/modal/modal.js
Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    content: {
      type: String,
      value: ''
    },
    showClose: {
      type: Boolean,
      value: true
    },
    showCancel: {
      type: Boolean,
      value: true
    },
    showConfirm: {
      type: Boolean,
      value: true
    },
    cancelText: {
      type: String,
      value: '取消'
    },
    confirmText: {
      type: String,
      value: '确定'
    },
    confirmColor: {
      type: String,
      value: '#7B68EE'
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    onCancel() {
      this.triggerEvent('cancel');
    },
    onConfirm() {
      this.triggerEvent('confirm');
    }
  }
});