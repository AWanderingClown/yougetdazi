// Error reporter helper for unit tests and production
// Builds a payload suitable for a monitoring backend
const api = require('./api');

function buildErrorPayload(msg, userInfo, apiBaseUrl) {
  return {
    url: api.monitor.error(),
    method: 'POST',
    data: {
      error: msg,
      userInfo: userInfo || null,
      time: new Date().toISOString()
    }
  };
}

module.exports = {
  buildErrorPayload
};
