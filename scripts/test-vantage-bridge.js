#!/usr/bin/env node
'use strict';
// Local/CI simulation only: tests transport and validation, NOT Vantage prices.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const fn=fs.readFileSync(path.resolve(__dirname,'../supabase/functions/dgos-vantage-bridge/index.ts'),'utf8');
const sql=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261016190000_dgos_vantage_snapshots.sql'),'utf8');
const pine=fs.readFileSync(path.resolve(__dirname,'../tradingview/DG_Jarvis_Vantage_Bridge_V1.pine'),'utf8');
assert.match(sql,/enable row level security/);
assert.match(sql,/revoke all on public\.dgos_vantage_snapshots from anon, authenticated/);
assert.match(sql,/event_key text primary key/);
assert.match(fn,/INDICATOR_REPORTED/);
assert.doesNotMatch(fn,/placeOrder|BUY_READY|console\.log\(body\)/);
for(const x of ['Europe/Zurich','VANTAGE:XAUUSD','0000-0600','0800-1200','1400-2200','request.security','alert.freq_all'])assert.ok(pine.includes(x),x);
const secret='J'.repeat(48),saved=new Map();
let configured=false,dbReady=true,handler=null,requestCount=0;
const ctx={
 crypto:webcrypto,TextEncoder,Response,Request,AbortSignal,Date,URL,
 fetch:async(url,opts)=>{
   requestCount++;
   assert.match(url,/\/rest\/v1\/dgos_vantage_snapshots\?on_conflict=event_key/);
   const row=JSON.parse(opts.body)[0];
   assert.equal(row.symbol,'VANTAGE:XAUUSD');
   assert.equal(row.evidence_status,'INDICATOR_REPORTED');
   assert.equal(row.source_type,'TRADINGVIEW_INDICATOR');
   assert.equal(row.session_timezone,'Europe/Zurich');
   assert.ok(!JSON.stringify(row).includes(secret));
   if(!dbReady)return new Response('{}',{status:500});
   saved.set(row.event_key,row);
   return new Response('',{status:201});
 },
 Deno:{
   env:{get:k=>k==='DGOS_TRADINGVIEW_WEBHOOK_SECRET'?(configured?secret:''):
      k==='SUPABASE_URL'?'https://example.supabase.co':
      k==='SUPABASE_SERVICE_ROLE_KEY'?'mock-service-key':null},
   serve:fn=>handler=fn
 }
};
vm.runInNewContext(fn,ctx,{timeout:2500});
const endpoint='https://example.supabase.co/functions/v1/dgos-vantage-bridge';
function post(data,ct='application/json'){
 return new Request(endpoint,{method:'POST',headers:{'content-type':ct},body:JSON.stringify(data)});
}
const now=Date.now();
const sample={
 secret,eventType:'SESSION_LEVELS',symbol:'VANTAGE:XAUUSD',timeframe:'5',
 session:'ASIA',sessionDay:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)),
 phase:'FORMING',high:4180.25,low:4150.5,eventAtMs:now
};
(async()=>{
 let res=await handler(post(sample));
 assert.equal(res.status,503,'Without secret receiver stays closed');
 configured=true;
 for(const invalid of [
  {...sample,secret:'invalid'},
  {...sample,symbol:'OANDA:XAUUSD'},
  {...sample,high:4150,low:4180},
  {...sample,sessionDay:'2026-02-31'},
  {...sample,phase:'READY'},
  {...sample,eventType:'BUY_READY'},
  {...sample,eventAtMs:now-3*86400000},
  {...sample,eventAtMs:now+600000},
  {...sample,timeframe:'D'},
  {...sample,high:'4180.25'}
 ]){
   res=await handler(post(invalid));
   assert.equal(res.status,invalid.secret==='invalid'?401:422,JSON.stringify(invalid));
 }
 assert.equal((await handler(post(sample,'text/plain'))).status,415);
 assert.equal((await handler(new Request(endpoint,{method:'GET'}))).status,405);
 res=await handler(post(sample));
 assert.equal(res.status,200);
 assert.equal(saved.size,1);
 assert.equal([...saved.values()][0].phase,'FORMING');
 res=await handler(post({...sample,eventAtMs:now+2000}));
 assert.equal(res.status,200);
 assert.equal(saved.size,1,'15-min same-bucket session forming alert dedup');
 res=await handler(post({...sample,phase:'FINAL'}));
 assert.equal(res.status,200);
 assert.equal(saved.size,2,'FINAL separate immutable snapshot');
 const bar={
   secret,eventType:'HTF_BAR_CLOSED',symbol:'VANTAGE:XAUUSD',
   timeframe:'60',eventAtMs:now,candleStartMs:now-3600000,
   open:4160.01,high:4180.25,low:4150.5,close:4172.15
 };
 assert.equal((await handler(post(bar))).status,200);
 assert.equal(saved.size,3);
 assert.equal((await handler(post({...bar,open:4199}))).status,422);
 assert.equal((await handler(post({...bar,timeframe:'5'}))).status,422);
 assert.equal((await handler(post({...bar,candleStartMs:now+3600000}))).status,422);
 assert.equal((await handler(post({...bar,close:4173}))).status,200);
 assert.equal(saved.size,3,'One stored record for each closed HTF candle');
 dbReady=false;
 assert.equal((await handler(post({...bar,timeframe:'240'}))).status,503,
   'No success claim when DB fails');
 console.log('DG Vantage Bridge: auth, schema, strict provider, 15min snapshots, final and closed HTF bars, RLS, idempotency PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
