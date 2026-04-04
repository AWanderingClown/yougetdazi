// components/card/card.js
Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    headerRight: {
      type: String,
      value: ''
    },
    footer: {
      type: Boolean,
      value: false
    },
    shadow: {
      type: String,
      value: 'medium' // none, small, medium, large
    },
    flat: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap(e) {
      this.triggerEvent('click', e);
    }
  }
});