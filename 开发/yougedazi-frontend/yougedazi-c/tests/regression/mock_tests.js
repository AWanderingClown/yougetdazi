// Minimal regression tests for Mock + Partial Real API environment
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion failed'); };

try {
  const { buildErrorPayload } = require('../../utils/error-reporter');
  const apiBase = 'https://api.ppmate.com';
  const payload = buildErrorPayload('test-error', { id: 'user_01' }, apiBase);

  assert(payload.url === 'https://api.ppmate.com/api/c/monitor/error', 'error URL mismatch');
  assert(payload.method === 'POST', 'method should be POST');
  assert(payload.data.error === 'test-error', 'error text mismatch');
  assert(payload.data.userInfo && payload.data.userInfo.id === 'user_01', 'userInfo not preserved');
  assert(typeof payload.data.time === 'string', 'time should be string');
  console.log('mock_tests.js: PASS');
} catch (e) {
  console.error('mock_tests.js: FAIL', e && e.message ? e.message : e);
  process.exit(1);
}
