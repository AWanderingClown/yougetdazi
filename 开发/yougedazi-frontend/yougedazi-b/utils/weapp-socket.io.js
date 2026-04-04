/**
 * weapp-socket.io.js
 * 微信小程序 Socket.IO v4 客户端
 *
 * 实现：Engine.IO v4 握手 + Socket.IO v4 事件层
 * 支持：JWT auth、自动重连（指数退避）、Ping/Pong
 *
 * 使用：
 *   const io = require('./utils/weapp-socket.io');
 *   const socket = io('https://api.example.com', {
 *     auth: { token: 'JWT_TOKEN' }
 *   });
 *   socket.on('connect', () => { ... });
 *   socket.on('my_event', (data) => { ... });
 *   socket.emit('client_event', { key: 'value' });
 *   socket.disconnect();
 */

const RECONNECT_BASE_DELAY = 2000;
const RECONNECT_MAX_DELAY  = 30000;

function io(serverUrl, opts) {
  opts = opts || {};
  const auth          = opts.auth || {};
  const autoReconnect = opts.autoReconnect !== false;

  // 将 http/https 转为 ws/wss，拼接 Engine.IO 握手参数
  const wsUrl = serverUrl
    .replace(/^https/, 'wss')
    .replace(/^http/, 'ws')
    + '/socket.io/?EIO=4&transport=websocket';

  const _listeners = {};
  let _task             = null;   // wx.SocketTask
  let _connected        = false;  // Socket.IO 层已连接
  let _destroyed        = false;  // 已主动断开，不再重连
  let _firstConnect     = true;   // 区分首次连接与重连
  let _reconnectDelay   = RECONNECT_BASE_DELAY;
  let _reconnectTimer   = null;

  // ── 公共 socket 对象 ──────────────────────────────────────
  const socket = {
    connected: false,

    on(event, fn) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(fn);
      return socket;
    },

    off(event, fn) {
      if (!_listeners[event]) return socket;
      if (fn) {
        _listeners[event] = _listeners[event].filter(f => f !== fn);
      } else {
        delete _listeners[event];
      }
      return socket;
    },

    // 向服务端发送事件（Socket.IO EVENT 包：42[event, data]）
    emit(event, data) {
      if (!_task || !_connected) {
        console.warn('[Socket.IO] 未连接，丢弃事件:', event);
        return socket;
      }
      _task.send({ data: '42' + JSON.stringify([event, data]) });
      return socket;
    },

    // 主动断开，不再自动重连
    disconnect() {
      _destroyed = true;
      _clearReconnectTimer();
      _closeTask();
    }
  };

  // ── 内部工具 ─────────────────────────────────────────────

  function _fire(event) {
    const args = Array.prototype.slice.call(arguments, 1);
    const fns  = (_listeners[event] || []).slice();
    fns.forEach(function(fn) {
      try { fn.apply(null, args); } catch(e) {
        console.error('[Socket.IO] 事件处理异常:', event, e);
      }
    });
  }

  function _clearReconnectTimer() {
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
  }

  function _closeTask() {
    if (_task) {
      try { _task.close({}); } catch(e) {}
      _task = null;
    }
    _connected = false;
    socket.connected = false;
  }

  function _scheduleReconnect() {
    if (_destroyed || _reconnectTimer) return;
    const delay = _reconnectDelay;
    console.log('[Socket.IO] ' + delay + 'ms 后重连...');
    _reconnectTimer = setTimeout(function() {
      _reconnectTimer = null;
      if (!_destroyed) {
        console.log('[Socket.IO] 重连中...');
        _connect();
      }
    }, delay);
    // 指数退避，上限 30s
    _reconnectDelay = Math.min(_reconnectDelay * 2, RECONNECT_MAX_DELAY);
  }

  // ── 核心连接逻辑 ─────────────────────────────────────────

  function _connect() {
    if (_destroyed || _task) return;

    _task = wx.connectSocket({
      url:  wsUrl,
      fail: function(err) {
        console.error('[Socket.IO] connectSocket 失败:', err);
        _task = null;
        _scheduleReconnect();
      }
    });

    // WebSocket 握手完成（Engine.IO 层还未就绪）
    _task.onOpen(function() {
      // 等待 Engine.IO OPEN 包（由 onMessage 处理），不在此发送
    });

    _task.onMessage(function(res) {
      var data = res.data;
      if (typeof data !== 'string' || data.length === 0) return;

      var eioType = data[0];

      // Engine.IO OPEN（类型 0）—— 服务端握手完成，发送 Socket.IO CONNECT
      if (eioType === '0') {
        var connectPkt = '40' + JSON.stringify({ auth: auth });
        _task.send({ data: connectPkt });
        return;
      }

      // Engine.IO PING（类型 2）—— 立即回 PONG
      if (eioType === '2') {
        _task.send({ data: '3' });
        return;
      }

      // Engine.IO MESSAGE（类型 4）—— Socket.IO 层
      if (eioType === '4') {
        var sioType = data[1];
        var body    = data.slice(2);

        // Socket.IO CONNECT（类型 0）—— 连接成功
        if (sioType === '0') {
          _connected = true;
          socket.connected = true;
          _reconnectDelay = RECONNECT_BASE_DELAY; // 重置退避
          if (_firstConnect) {
            _firstConnect = false;
            console.log('[Socket.IO] 已连接');
            _fire('connect');
          } else {
            console.log('[Socket.IO] 重连成功');
            _fire('connect');
            _fire('reconnect');
          }
          return;
        }

        // Socket.IO DISCONNECT（类型 1）
        if (sioType === '1') {
          _connected = false;
          socket.connected = false;
          _fire('disconnect', 'server namespace disconnect');
          return;
        }

        // Socket.IO EVENT（类型 2）—— 业务事件
        if (sioType === '2') {
          try {
            var parsed = JSON.parse(body);
            if (Array.isArray(parsed) && parsed.length >= 1) {
              _fire(parsed[0], parsed[1]);
            }
          } catch(e) {
            console.error('[Socket.IO] 事件解析失败:', body);
          }
          return;
        }

        // Socket.IO CONNECT_ERROR（类型 4）
        if (sioType === '4') {
          var err = { message: 'connect error' };
          try { err = JSON.parse(body); } catch(e) {}
          console.error('[Socket.IO] 连接错误:', err.message);
          _fire('connect_error', err);
        }
      }
    });

    _task.onError(function(err) {
      console.error('[Socket.IO] WebSocket 错误:', err);
      _fire('error', err);
    });

    _task.onClose(function(res) {
      var wasConnected = _connected;
      _connected       = false;
      socket.connected = false;
      _task            = null;

      console.log('[Socket.IO] 连接关闭:', res.code, res.reason);

      if (wasConnected) {
        _fire('disconnect', res.reason || 'transport close');
      }

      if (autoReconnect && !_destroyed) {
        _scheduleReconnect();
      }
    });
  }

  // 启动连接
  _connect();

  return socket;
}

module.exports = io;
