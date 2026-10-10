#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const html=read('index.html');
const client=read('private-hub.js');
const style=read('private-hub.css');
const routing=read('navigation.js');
const routingCSS=read('navigation.css');
const edge=read('supabase/functions/jarvis-private/index.ts');
const personal=read('personal.js');
assert.doesNotThrow(()=>new Function(client),'Client JS syntax');
for(const id of ['personalPrivate','dgPrivForm','dgPrivList','dgPrivMic','dgPrivPhoto',
  'dgPrivSuggestions','dgPrivPhotoPreview','dgPrivAddSuggestions','dgPrivCountIdea','dgPrivCountShopping',
  'dgPrivDate','dgPrivCompleted']){
  assert.ok(html.includes('id="'+id+'"'),'Missing private UI '+id);
}
assert.match(html,/data-target="personalPrivate"/);
assert.match(html,/private-hub\.js\?v=1/);
assert.match(html,/private-hub\.css\?v=1/);
assert.match(html,/navigation\.js\?v=0\.60\.1/);
assert.match(html,/navigation\.css\?v=0\.73\.1/);
assert.match(routing,/private: \{ target: 'personalPrivate'/);
assert.match(routingCSS,/body\[data-dgos-route="private"\] #tradingWorkspace/);
assert.match(routingCSS,/repeat\(7,minmax\(0,1fr\)\)/);
assert.ok(style.includes('@media(max-width:620px)'),'Private mobile layouts missing');
assert.ok(personal.includes("window.addEventListener('dgos-private-updated',loadOrganizer)"),'Existing organizer must refresh');
for(const contract of ['dgos_device_sessions','dgos_telegram_config','token_hash','expires_at',
  'source_ref: kind === "idea" ? "private-hub:idea"','dgos_private_items',
  'voice','image','source:','completed_at','no-store','origin_not_allowed','device_pairing_required',
  'api.openai.com/v1/audio/transcriptions','api.openai.com/v1/responses','input_image',
  'body.image','cooldown','limit(250)'])assert.ok(edge.includes(contract),'Missing backend contract '+contract);
assert.ok(edge.includes('if (!owner)'), 'Must check device auth');
assert.ok(!edge.includes('db.storage'), 'Do not persist fridge photos');
assert.ok(!edge.includes('trading_'), 'Do not access the trading strategy');
assert.ok(!client.includes('OPENAI_API_KEY'),'Never ship provider secrets to client');
assert.ok(!client.includes('SUPABASE_SERVICE_ROLE_KEY'),'Never ship service secrets to client');
assert.ok(client.includes("window.confirm("),'Destructive deletes require confirmation');
assert.ok(client.includes("input.type='checkbox'"),'Photo suggestions must be user-selected');
assert.ok(client.includes("photoData=''"),'Photo base64 must be cleared after use');
assert.ok(client.includes("speechRecognition")||client.includes('SpeechRecognition'),'Speech to text required');
assert.ok(client.includes('MediaRecorder'),'Audio recording fallback required');
assert.ok(client.includes("source:'image'"),'Confirmed photo additions should be tagged');
assert.ok(!/\.innerHTML\s*=/.test(client),'User data must be rendered as textContent, not raw HTML');
console.log('DG OS private life hub static and privacy checks passed');
