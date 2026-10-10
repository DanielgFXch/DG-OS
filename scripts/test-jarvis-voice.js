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
assert.match(html,/jarvis-voice\.js\?v=7/);
assert.match(html,/jarvis-voice\.css\?v=2/);
assert.match(studio,/cartesia-favorites\.js\?v=5/);
assert.match(studio,/voice-studio\.js\?v=7/);
assert.ok(html.includes('jarvis-native-voice.js?v=2'));
assert.ok(studio.includes('jarvis-native-voice.js?v=2'));
assert.ok(html.includes('jarvis-sound-check.js?v=1'));
const contrast=file('jarvis-voice-contrast.css');
assert.ok(html.includes('jarvis-voice-contrast.css?v=1'),'Main app must load readable voice styles');
assert.ok(contrast.includes('#jvPreview:not(:disabled)'),'Preview contrast should be explicit');
assert.ok(contrast.includes('-webkit-text-fill-color'),'iOS text fill must be set');
assert.ok(contrast.includes('#jvNotice'),'Voice error feedback must stay readable');

assert.ok(studio.includes('jarvis-sound-check.js?v=1'));
const browser=file('jarvis-voice.js');
const favorites=file('cartesia-favorites.js');
for(const client of [browser,favorites]) {
  assert.match(client,/dgos\.deviceSession/);
  assert.match(client,/dgos\.cartesia\.voiceId/);
  assert.match(client,/Authorization:'Bearer '/);
  assert.doesNotMatch(client,/CARTESIA_API_KEY|SUPABASE_SERVICE_ROLE_KEY|voicePassword|grant_type=password/);
}
assert.match(browser,/Antworten vorlesen/);
assert.ok(browser.includes('window.DGOSLocalVoice'),'Native voice must use shared iOS-safe engine');
assert.ok(browser.includes('jvSoundCheck'),'Jarvis must offer speaker diagnostic');
assert.match(favorites,/Stimmen laden/);

// This page reuses the actual orb DOM classes already used by DG OS Home.
const cinematic=file('jarvis-cinematic.css');
assert.ok(html.includes('jarvis-cinematic.css?v=1'),'Load cinematic Hero style');
assert.ok(html.includes('class="jarvis-cinematic-hero"'),'Keep a separate spacious Jarvis Hero');
const homeOrb=html.match(/<button[^>]+id="dgHeroJarvis"[^>]*>[\s\S]*?<\/button>/);
const jarvisOrb=html.match(/<button[^>]+id="personalJarvisOrbBtn"[^>]*>[\s\S]*?<\/button>/);
assert.ok(homeOrb&&jarvisOrb,'Both home and interactive Jarvis orb must exist');
for(const klass of ['dg-orb-sphere','dg-orb-inner','dg-orb-streak','dg-orb-specular']){
  assert.ok(homeOrb[0].includes('class="'+klass+'"'),'Home visual source missing '+klass);
  assert.ok(jarvisOrb[0].includes('class="'+klass+'"'),'Jarvis must reuse the same '+klass);
}
assert.ok(jarvisOrb[0].includes('data-state="idle"'),'Orb state machine must remain');
for(const id of ['personalJarvisTitle','personalJarvisReply','personalJarvisStatus','jarvisLifeTasks','jarvisLifeAppointments','jarvisLifeBills','jarvisLifeInbox','jarvisLifeCommandForm']){
  assert.ok(html.includes('id="'+id+'"'),id+' must be preserved for app behavior');
}
assert.ok(browser.includes("panel.querySelector('.jarvis-cinematic-hero')"),'Voice UI must be placed below the hero');
assert.ok(cinematic.includes('.jarvis-cinematic-orb>.dg-orb-sphere'),'Avoid legacy HUD style overriding shared Home orb');
assert.ok(cinematic.includes('@media(max-width:700px)'),'Hero must support narrow iPhones');
assert.ok(html.indexOf('jarvis-cinematic-hero') < html.indexOf('jarvis-life-stats'),'Hero must precede Jarvis functionality');

const edge=file('supabase/functions/jarvis-cartesia/index.ts');
for(const guard of ['dgos_device_sessions','dgos_telegram_config','token_hash','expires_at',
  'device_pairing_required','origin_not_allowed','invalid_voice_request','voice_not_available']) assert.ok(edge.includes(guard),guard);
assert.match(edge,/2026-08-14/);
assert.match(edge,/sonic-3\.6/);
assert.match(edge,/voice: id/);
assert.doesNotMatch(edge,/voice: \{ mode:/);
assert.doesNotMatch(edge,/"X-API-Key": cartesiaKey/);
require('./test-jarvis-native-voice.js');
console.log('Jarvis Voice contract checks passed.');
