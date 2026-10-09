'use strict';
const assert = require('node:assert/strict');
const { JarvisMemory } = require('./jarvisMemory.js');
const user = '11111111-1111-4111-8111-111111111111';
const requests = [];
const memory = new JarvisMemory({ DGOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, async (url, opts) => {
  requests.push({ url, opts });
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: user }) };
  return { ok: true, json: async () => [{ id: 'test', title: 'Planning', content: 'Plan' }] };
});
(async () => {
  const identity = await memory.identity({ headers: { authorization: 'Bearer test.token' } });
  assert.equal(identity.userId, user);
  await memory.list(identity);
  assert.match(requests[1].url, /owner_id=eq/);
  assert.equal(requests[1].opts.headers.Authorization, 'Bearer test.token');
  const created = await memory.create(identity, { category: 'goal', title: 'Planning', content: 'Plan' });
  assert.equal(created.title, 'Planning');
  assert.equal(JSON.parse(requests[2].opts.body).owner_id, user);
  await assert.rejects(() => memory.create(identity, { category: 'trading_strategy', title: 'Change', content: 'Override' }), /invalid_memory/);
  await assert.rejects(() => memory.identity({ headers: {} }), /memory_auth_required/);
  const disabled = new JarvisMemory({});
  await assert.rejects(() => disabled.identity({ headers: {} }), /memory_not_configured/);
  console.log('Jarvis memory adapter tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
