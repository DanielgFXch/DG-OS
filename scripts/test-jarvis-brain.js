#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),client=read('jarvis-brain.js'),edge=read('supabase/functions/jarvis-brain/index.ts');
const css=read('jarvis-brain.css'),migration=read('supabase/migrations/20261010_jarvis_brain_owner_private.sql');
assert.doesNotThrow(()=>new Function(client),'Brain/Planner frontend JavaScript syntax');
for(const id of ['jarvisIntelligence','jbPlanPanel','jbBrainPanel','jbMemoryForm',
  'jbMemoryCategory','jbMemoryTitle','jbMemoryContent','jbMemorySearch',
  'jbMemorySubmit','jbMemoryCancel','jbMemoryList','jbAskForm',
  'jbAskInput','jbAskAnswer','jbPlanToday','jbPlanTomorrow',
  'jbPlanFixed','jbPlanTasks','jbPlanShopping','jbStatus','jbMemoryCount']){
  assert.ok(html.includes('id="'+id+'"'), 'Missing Brain/Planner control '+id);
}
assert.match(html,/jarvis-brain\.js\?v=3/);
assert.match(html,/jarvis-brain\.css\?v=1/);
assert.ok(html.includes('id="personalJarvisOrbBtn"'),'Keep cinematic Jarvis orb');
assert.ok(html.includes('id="personalJarvisReply"'),'Keep voice reply target');
assert.ok(css.includes('@media(max-width:480px)'), 'iPhone responsive layout');
assert.ok(css.includes('reduced-motion'),'Respect reduced-motion preference');
for(const feature of ['async function loadMemories','function drawMemories','function resetEdit',
  'async function loadPlan','async function api','async function loadMemories','function localEvents',
  'id="personalJarvisReply"'].slice(0,-1)){
  assert.ok(client.includes(feature),'Missing frontend feature '+feature);
}
assert.ok(client.includes("window.confirm("),'Owner must confirm permanent deletion');
assert.ok(client.includes("dgos.personal.events.v1"),'Read existing local calendar only on owner device');
assert.ok(client.includes("localEvents(date)"),'Show local calendar without uploading it');
assert.ok(client.includes("personalJarvisReply"),'Answers should work with existing Jarvis TTS');
assert.ok(!client.includes('OPENAI_API_KEY'),'Never expose OpenAI API key in frontend');
assert.ok(!client.includes('SUPABASE_SERVICE_ROLE_KEY'),'Never expose server secret in frontend');
assert.ok(!client.includes('innerHTML='),'Render memory content safely as text nodes, never HTML');
for(const text of ['dgos_device_sessions','dgos_telegram_config','token_hash','expires_at',
 'owner_chat_id','aiKey','dgos_jarvis_brain','dgos_tasks','dgos_private_items',
 'action==="plan"','action==="list"','action==="remember"','action==="update"',
 'action==="delete"','action==="ask"','source:"confirmed"','origin_not_allowed']){
  assert.ok(edge.includes(text),'Missing API contract '+text);
}
assert.ok(edge.includes('.eq("id",id).eq("owner_chat_id",owner)'),'Update/Delete must be owner-scoped');
assert.ok(edge.includes('.eq("owner_chat_id",owner)'),'All memories scoped to verified chat ID');
assert.ok(edge.includes('String(session.data.chat_id)===String(config.data.chat_id)'),'Owner match required');
assert.ok(!edge.includes('marketBrain'),'Keep trading rules isolated');
assert.ok(!edge.includes('fetch("https://api.telegram.org'),'No notifications or sends from personal Q&A');
assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'),'RLS enabled');
assert.ok(migration.includes('REVOKE ALL ON public.dgos_jarvis_brain FROM PUBLIC, anon, authenticated'),'No public reading');
assert.ok(migration.includes('GRANT SELECT, INSERT, UPDATE, DELETE ON public.dgos_jarvis_brain TO service_role'),'Service role allowed');
assert.ok(migration.includes('auth.users'),'Document why unused preparatory memory tables need a separate owner model');
console.log('Jarvis Brain/Planner security and integration checks passed');
