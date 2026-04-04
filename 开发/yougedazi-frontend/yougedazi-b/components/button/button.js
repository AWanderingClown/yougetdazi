// components/button/button.js
Component({
  properties: {
    text: {
      type: String,
      value: '按钮'
    },
    type: {
      type: String,
      value: 'primary' // primary, secondary, outline, text
    },
    size: {
      type: String,
      value: 'medium' // large, medium, small, mini
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    },
    loadingText: {
      type: String,
      value: ''
    },
    block: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap(e) {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent('click', e);
    }
  }
});