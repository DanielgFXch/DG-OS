#!/usr/bin/env node
'use strict';
// Static contract checks. These do not spend Cartesia credits or send voice audio.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const name of ['jarvis-voice.js','voice-studio.js','cartesia-favorites.js']) {
  assert.doesNotThrow(()=>new Function(file(name)),name+' JavaScript syntax');
}
const html=file('index.html');
const studio=file('voice-studio.html');
assert.match(html,/jarvis-voice\.js\?v=4/);
assert.match(html,/jarvis-voice\.css\?v=2/);
assert.match(studio,/cartesia-favorites\.js\?v=4/);
assert.match(studio,/voice-studio\.js\?v=4/);
const browser=file('jarvis-voice.js');
const favorites=file('cartesia-favorites.js');
for(const client of [browser,favorites]) {
  assert.match(client,/dgos\.deviceSession/);
  assert.match(client,/dgos\.cartesia\.voiceId/);
  assert.match(client,/Authorization:'Bearer '/);
  assert.doesNotMatch(client,/CARTESIA_API_KEY|SUPABASE_SERVICE_ROLE_KEY|voicePassword|grant_type=password/);
}
assert.match(browser,/automatisch vorlesen/);
assert.match(favorites,/Stimmen laden/);
const edge=file('supabase/functions/jarvis-cartesia/index.ts');
for(const guard of ['dgos_device_sessions','dgos_telegram_config','token_hash','expires_at',
  'device_pairing_required','origin_not_allowed','invalid_voice_request','voice_not_available']) assert.ok(edge.includes(guard),guard);
assert.match(edge,/2026-08-14/);
assert.match(edge,/sonic-3\.6/);
assert.match(edge,/voice: id/);
assert.doesNotMatch(edge,/voice: \{ mode:/);
assert.doesNotMatch(edge,/"X-API-Key": cartesiaKey/);
console.log('Jarvis Voice contract checks passed (static only).');
