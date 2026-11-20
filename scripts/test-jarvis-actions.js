#!/usr/bin/env node
'use strict';
// Offline contract tests: never call Supabase or incur transcription costs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
for(const file of ['jarvis-life-intent.js','jarvis-action-bridge.js','personal.js','jarvis-microphone.js']){
  assert.doesNotThrow(()=>new Function(read(file)),file+' syntax');
}
const life=require('../jarvis-life-intent.js');
const actions=require('../jarvis-action-bridge.js');
const now=new Date('2026-11-20T17:00:00Z');
assert.equal(life.dueDate('spätestens Sonntag',now).date,'2026-11-22');
assert.equal(life.dueDate('am 24.11.2026',now).date,'2026-11-24');
assert.equal(life.dueDate('am 24. November 2026',now).date,'2026-11-24');
assert.equal(life.dueDate('am 33.11.2026',now),null);

const batch=actions.parse('Hey Jarvis merk dir spätestens Sonntag wegen Sanitas, wegen Innova, wegen Groupe Mutuel und wegen ForTraders',life,now);
assert.equal(batch.intent,'tasks');
assert.equal(batch.date,'2026-11-22');
assert.deepEqual(batch.items.map(item=>item.title),['Sanitas klären','Innova klären','Groupe Mutuel klären','ForTraders klären']);
const reminder=actions.parse('Erinnere mich am Sonntag an Sanitas',life,now);
assert.equal(reminder.intent,'tasks');
assert.equal(reminder.items[0].title,'Sanitas');
const event=actions.parse('Trag Termin Arzt am 24.11.2026 um 15 Uhr ein',life,now);
assert.equal(event.intent,'appointment');
assert.equal(event.date,'2026-11-24');
assert.equal(event.time,'15:00');
assert.equal(actions.parse('Trag Termin Arzt am Sonntag ein',life,now).intent,'clarify');
assert.equal(actions.parse('Trag Termin Arzt am Sonntag um 15 Uhr in Google Kalender ein',life,now).intent,'clarify');
assert.equal(actions.parse('Notier eine Notiz: Ich will Jarvis verbessern',life,now).intent,'note');
assert.equal(actions.parse('Aufgabe: Steuererklärung machen',life,now).date,life.todayZurich(now));
assert.equal(actions.parse('Was ist am Sonntag wichtig?',life,now),null);
assert.equal(actions.parse('Überweise morgen 200 Franken',life,now),null);

assert.match(read('index.html'),/jarvis-action-bridge\.js\?v=/);
assert.ok(read('index.html').indexOf('jarvis-action-bridge.js')<read('index.html').indexOf('personal.js'));
assert.match(read('personal.js'),/verifiedActions\?\.handle\(original\)/);
assert.match(read('personal.js'),/result\.task\?\.id/);

async function run(){
  // Mock the authorized backend. Only a valid saved ID may result in success.
  const saved=[];
  globalThis.localStorage={getItem:key=>key==='dgos.deviceSession'?'test-session':''};
  globalThis.fetch=async (url,options)=>{
    const payload=JSON.parse(options.body);
    saved.push({url,payload});
    if(url.includes('tasks/create'))return {
      ok:true,status:201,json:async()=>({task:{id:'task-'+saved.length,title:payload.title,due_date:payload.dueDate}})
    };
    return {ok:true,status:201,json:async()=>({item:{id:'item-'+saved.length,title:payload.title,kind:payload.kind,date:payload.date||''}})};
  };
  function command(input){
    return new Promise((resolve,reject)=>{
      const app=actions.create({lifeIntent:life,onSuccess:resolve,onError:reject,onQuestion:reject});
      assert.equal(app.handle(input),true);
    });
  }
  const result=await command('Hey Jarvis merk dir spätestens Sonntag wegen Sanitas, wegen Innova, wegen Groupe Mutuel und wegen ForTraders');
  assert.match(result,/4 Aufgaben/);
  assert.equal(saved.length,4);
  const appt=await command('Trag Termin Arzt am 24.11.2026 um 15 Uhr ein');
  assert.match(appt,/im DG-OS-Kalender gespeichert/);
  assert.equal(saved[4].payload.kind,'appointment');
  assert.equal(saved[4].payload.date,'2026-11-24');
  // HTTP success without a real record must never produce "Gespeichert".
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({})});
  const denied=await new Promise(resolve=>{
    const app=actions.create({lifeIntent:life,onSuccess:()=>resolve('FALSE_SUCCESS'),onError:resolve});
    app.handle('Erinnere mich am Sonntag an Sanitas');
  });
  assert.notEqual(denied,'FALSE_SUCCESS');
  assert.match(denied,/0 von 1 Aufgaben gespeichert/);
  console.log('Jarvis action tests passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
