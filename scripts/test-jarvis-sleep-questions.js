'use strict';
const assert=require('node:assert/strict');
require('../jarvis-sleep-questions.js');
const api=globalThis.DGJarvisSleep;
assert.equal(api.intent('Wie habe ich gestern geschlafen?'),'yesterday');
assert.equal(api.intent('Jarvis wie habe ich letzte Nacht geschlafen?'),'latest');
assert.equal(api.intent('Vergleich mit der letzten Woche bitte'),'week');
assert.equal(api.intent('Wie ist der Gold Markt?'),null);
const date=new Date().toISOString();
(async()=>{
 const offline=await api.answer('Wie habe ich gestern geschlafen?','',async()=>{throw Error('should not fetch');});
 assert.match(offline,/WHOOP.*nicht verbunden/);
 const answer=await api.answer('Wie habe ich letzte Nacht geschlafen?','token',async url=>({
  ok:true,json:async()=>({nights:[{start:date,end:date,durationHours:7.5,performance:88,recovery:76,deepHours:1.5,remHours:2,hrvMs:62}]})
 }));
 assert.match(answer,/7 Stunden 30 Minuten/);
 assert.match(answer,/88 Prozent/);
 assert.match(answer,/76 Prozent/);
 assert.doesNotMatch(answer,/token/);
 const noData=await api.answer('Wie habe ich letzte Nacht geschlafen?','token',async()=>({ok:true,json:async()=>({nights:[]})}));
 assert.match(noData,/keine vollständigen Schlafdaten/);
 console.log('DG OS Jarvis sleep questions: checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
