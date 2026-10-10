#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('personal.js');
const sectionStart=app.indexOf('/* WHOOP health integration');
const sectionEnd=app.indexOf('\n})();',sectionStart);
assert.ok(sectionStart>0&&sectionEnd>sectionStart,'WHOOP client IIFE must exist');
const client=app.slice(sectionStart,sectionEnd+5);
assert.doesNotThrow(()=>new Function(client));
const edge=read('supabase/functions/whoop/index.ts');
const sql=read('supabase/migrations/20261010230000_whoop_refresh_lease.sql');
for(const key of ['refresh_lock_id','refresh_lock_until'])assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS '+key));
assert.ok(!sql.includes('DROP TABLE')&&!sql.includes('DELETE FROM'),'Migration must not destroy WHOOP tokens');
assert.ok(edge.includes('refresh_lock_id:leaseId'),'One worker must acquire an exclusive lease');
assert.ok(edge.includes('refresh_lock_until:new Date(now+26000)'),'Leases expire on abandoned worker');
assert.ok(edge.includes('.eq("refresh_lock_id",leaseId)'),'Only lease holder persists token rotation');
assert.ok(edge.includes('if(!locked)'),'Concurrent workers wait for token rotation');
assert.ok(edge.includes('refresh_lock_id:null,refresh_lock_until:null'),'Clear lock after success/error');
assert.ok(edge.includes('WHOOP_TOKEN'),'Refresh must still use real WHOOP OAuth');
assert.ok(edge.includes('if(response.status===400||response.status===401)'),'Only invalid refresh prompts renewed consent');
assert.ok(edge.includes('return json({error:"whoop_reauthorize_required"},409)'));
assert.ok(edge.includes('return json({error:"whoop_temporarily_unavailable"},503)'));
assert.ok(edge.includes('WHOOP_SESSION_TTL_MS = 180*24*60*60*1000'),'Existing 180-day sliding session remains');
assert.ok(edge.includes('await validDeviceSession(req)'),'Paired-device recovery remains protected');
assert.ok(!app.includes('WHOOP_CLIENT_SECRET'),'Browser never holds a WHOOP secret');
assert.ok(app.includes('if(checkFlight)return checkFlight;'),'Prevent overlapping client status checks');
assert.ok(app.includes('WHOOP · verbunden'),'Keep server error separate from logout');
assert.ok(app.includes("return 'unavailable'"),'Transient failures must not reset session');
assert.ok(app.includes("return 'expired'"),'Only invalid owner session must be replaced');
assert.ok(app.includes("await restoreFromDeviceSession()"),'Restore via authenticated Telegram-linked device');
assert.ok(app.includes("lastWhoopHealth==='reauthorize'"),'Only explicit revocation starts new OAuth');
const html=read('index.html'),sw=read('sw.js');
assert.ok(html.includes('personal.js?v=0.59.9'));
assert.ok(sw.includes('dgos-personal-shell-43'));

function fakeElement(id){
 const handlers={};
 return {
  id, textContent:'',disabled:false,
  classList:{add(){},remove(){}},
  addEventListener(n,fn){handlers[n]=fn;},click(){handlers.click?.();},
  replaceChildren(){},append(){},
  get handlers(){return handlers;}
 };
}
const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
async function scenario({existingSession='',deviceSession='',claim='',summaryStatuses=[],connected=true,authenticated=false}){
 const values=new Map([['dgos.whoopSession',existingSession],['dgos.deviceSession',deviceSession],['dgos.whoopClaimSecret',claim]]);
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,fakeElement(id));return elements.get(id);};
 const requests=[],windowHandlers={},documentHandlers={};
 let position=null;
 const fakeFetch=async(url,opts={})=>{
  const target=String(url).split('/').at(-1);
  requests.push({target,method:opts.method||'GET',header:opts.headers?.Authorization||''});
  const answer=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
  if(target==='device-auth-claim')return answer(410,{error:'claim_expired'});
  if(target==='status')return answer(200,{configured:true,connected,authenticated});
  if(target==='device-session')return answer(200,{session:'restored-whoop-session',expiresInDays:180});
  if(target==='summary'){
    const next=summaryStatuses.shift()||200;
    if(next===401)return answer(401,{error:'session_required'});
    if(next===502)return answer(502,{error:'whoop_temporarily_unavailable'});
    if(next===409)return answer(409,{error:'whoop_reauthorize_required'});
    return answer(200,{updatedAt:new Date().toISOString(),recovery:null,sleep:null,cycle:null,workouts:[]});
  }
  if(target==='device-auth-start')return answer(200,{authorizationUrl:'https://api.prod.whoop.com/TEST'});
  throw Error('Unexpected API action '+target);
 };
 const context={
  document:{getElementById:element,hidden:false,addEventListener:(n,fn)=>documentHandlers[n]=fn,createElement:tag=>fakeElement(tag)},
  window:{addEventListener:(n,fn)=>windowHandlers[n]=fn,dispatchEvent(){return true;}},
  localStorage:{
   getItem:k=>values.get(k)||null,
   setItem:(k,v)=>values.set(k,String(v)),
   removeItem:k=>values.delete(k)
  },
  fetch:fakeFetch,
  crypto:{getRandomValues:a=>a.fill(7)},
  location:{search:'',hash:'',pathname:'/',set href(x){position=x;},get href(){return position||'/';}},
  history:{replaceState(){}},
  Event:class{constructor(type){this.type=type;}},
  Intl,Date,Math,Number,String,URLSearchParams,Array,
  setInterval(){return 0;},
  btoa(){return 'example_claim_string'},
  console
 };
 vm.runInNewContext(client,context,{timeout:1500});
 await wait();
 return {context,requests,values,elements,windowHandlers};
}
(async()=>{
 // Case 1: owner has valid signed 180d WHOOP session but upstream WHOOP
 // temporarily fails. Do not mark "disconnected" or request new OAuth.
 const first=await scenario({existingSession:'old-session',summaryStatuses:[502,502],authenticated:true});
 assert.equal(first.elements.get('whoopStatus').textContent,'WHOOP · verbunden');
 assert.equal(first.elements.get('whoopConnect').textContent,'Erneut laden');
 assert.equal(first.values.get('dgos.whoopSession'),'old-session');
 assert.equal(first.requests.filter(x=>x.target==='device-session').length,0);
 first.elements.get('whoopConnect').click();await wait();
 assert.equal(first.requests.filter(x=>x.target==='device-auth-start').length,0,'Reload never opens WHOOP OAuth');
 // Case 2: webview lost WHOOP session, but has an existing Telegram paired
 // device. Re-issue a WHOOP session once, then reuse it on future checks.
 const second=await scenario({
  deviceSession:'paired-device-token',claim:'very-old-whoop-claim',
  summaryStatuses:[200],authenticated:false
 });
 assert.equal(second.requests.filter(x=>x.target==='device-session').length,1);
 assert.equal(second.values.get('dgos.whoopSession'),'restored-whoop-session');
 assert.equal(second.values.has('dgos.whoopClaimSecret'),false,'Stale OAuth claim removed');
 assert.equal(second.elements.get('whoopStatus').textContent,'WHOOP · verbunden');
 assert.equal(second.elements.get('whoopConnect').disabled,true);
 // Case 3: refresh token revoked => visible message, not pretending it is online.
 const third=await scenario({existingSession:'old-session',summaryStatuses:[409],authenticated:true});
 assert.equal(third.elements.get('whoopStatus').textContent,'WHOOP · verbunden');
 assert.equal(third.elements.get('whoopConnect').textContent,'WHOOP erneut autorisieren');
 assert.ok(third.elements.get('whoopHealthMeta').textContent.includes('einmal neu autorisieren'));
 console.log('WHOOP persistence: 180d session reuse, flaky sync, paired-device recovery, stale handoff and refresh lease contracts passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
