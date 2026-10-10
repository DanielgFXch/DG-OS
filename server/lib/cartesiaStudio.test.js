'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { allowedRelativePath }=require('./staticApp.js');
const root=path.join(__dirname,'../..');
const client=fs.readFileSync(path.join(root,'cartesia-favorites.js'),'utf8');
const html=fs.readFileSync(path.join(root,'voice-studio.html'),'utf8');
const backend=fs.readFileSync(path.join(root,'supabase/functions/jarvis-cartesia/index.ts'),'utf8');

assert.ok(html.includes('src="./cartesia-favorites.js'));
assert.equal(allowedRelativePath('/cartesia-favorites.js'),'cartesia-favorites.js');
assert.ok(client.includes('/functions/v1/jarvis-cartesia'));
assert.ok(client.includes("api('GET')"));
assert.ok(client.includes("api('POST'"));
assert.ok(client.includes('dgos.deviceSession'));
assert.ok(client.includes('dgos.cartesia.voiceId'));
assert.ok(!client.includes('grant_type=password'));
assert.ok(!client.includes('voicePassword'));
assert.ok(!client.includes('CARTESIA_API_KEY'));
assert.ok(!client.includes('X-API-Key'));
assert.ok(client.includes('Clive')&&client.includes('Archie')&&client.includes('Skylar')&&client.includes('Lindiwe'));
assert.ok(backend.includes('dgos_device_sessions'));
assert.ok(backend.includes('dgos_telegram_config'));
assert.ok(backend.includes('device_pairing_required'));
assert.ok(backend.includes('2026-08-14'));
assert.ok(backend.includes('voice: id'));
assert.ok(!backend.includes('voice: { mode:'));

const pairing=fs.readFileSync(path.join(root,'jarvis-device-pairing.js'),'utf8');
const pairingStyle=fs.readFileSync(path.join(root,'jarvis-device-pairing.css'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const voiceClient=fs.readFileSync(path.join(root,'jarvis-voice.js'),'utf8');
assert.doesNotThrow(()=>new Function(pairing));
assert.doesNotThrow(()=>new Function(voiceClient));
assert.doesNotThrow(()=>new Function(client));
assert.ok(index.includes('jarvis-device-pairing.js?v=1'));
assert.ok(index.includes('jarvis-device-pairing.css?v=1'));
assert.ok(html.includes('jarvis-device-pairing.js?v=1'));
assert.ok(html.includes('jarvis-device-pairing.css?v=1'));
assert.ok(pairingStyle.includes('.jarvis-device-pair'));
for(const route of ['pair-start','pair-claim','status']){
  assert.ok(pairing.includes("'"+route+"'"),route+' route');
}
assert.ok(pairing.includes('dgos.deviceSession'));
assert.ok(pairing.includes('sessionStorage.setItem(pendingKey'));
assert.ok(pairing.includes("new Event('dgos-device-session')"));
assert.ok(pairing.includes("window.addEventListener('pageshow'"));
assert.ok(pairing.includes("window.addEventListener('focus'"));
assert.ok(pairing.includes('visibilitychange'));
assert.ok(pairing.includes('expiresAt'));
assert.ok(pairing.includes('jdpTelegram'));
assert.ok(!pairing.includes('window.location.href='));
assert.ok(!pairing.includes("localStorage.setItem(pendingKey"));
assert.ok(!voiceClient.includes("localStorage.getItem('dgos.whoopSession')"));
assert.ok(!client.includes("localStorage.getItem('dgos.whoopSession')"));

console.log('Cartesia favourites and iPhone pairing wiring checks passed.');
