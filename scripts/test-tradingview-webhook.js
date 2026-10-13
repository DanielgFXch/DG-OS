#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const src=fs.readFileSync(path.resolve(__dirname,'../supabase/functions/dgos-tradingview/index.ts'),'utf8');
const ddl=fs.readFileSync(path.resolve(__dirname,'../supabase/migrations/20261013100000_dgos_tradingview_events.sql'),'utf8');
assert.ok(!src.includes('BUY_READY')&&!src.includes('placeOrder'),'No trading execution');
assert.ok(!src.includes('console.log(body)')&&!src.includes('console.log(secret)'),'Do not log credentials');
assert.ok(src.includes('constantTimeTokenCheck')&&src.includes('Deno.env.get("DGOS_TRADINGVIEW_WEBHOOK_SECRET")'));
assert.ok(ddl.includes('enable row level security'));
assert.ok(ddl.includes('revoke all on public.dgos_tradingview_events from anon, authenticated'));
assert.ok(ddl.includes('event_key text not null unique'));
assert.ok(ddl.includes('evidence_status'));
const secret='z'.repeat(48), requests=[], saved=new Map(), now=Date.now();
let configured=false, apiReady=true, handler=null, fakeCalls=0;
const context={
  crypto:webcrypto,TextEncoder,Response,Request,AbortSignal,URL,Date,
  fetch:async (url,opts)=>{
    fakeCalls++;
    assert.ok(url.includes('/rest/v1/dgos_tradingview_events?on_conflict=event_key'));
    const event=JSON.parse(opts.body)[0];
    assert.equal(event.evidence_status,'INDICATOR_REPORTED');
    assert.ok(!JSON.stringify(event).includes(secret),'Token not stored in DB');
    if(!apiReady)return new Response('{}',{status:500});
    saved.set(event.event_key,event);return new Response('',{status:201});
  },
  Deno:{
    env:{get:key=>key==='DGOS_TRADINGVIEW_WEBHOOK_SECRET'?(configured?secret:''):
      key==='SUPABASE_URL'?'https://abc.supabase.co':
      key==='SUPABASE_SERVICE_ROLE_KEY'?'fake-service-role':null},
    serve:fn=>{handler=fn;},
  },
};
vm.runInNewContext(src,context,{timeout:2500});
assert.equal(typeof handler,'function');
const endpoint='https://abc.supabase.co/functions/v1/dgos-tradingview';
const request=(obj,ct='application/json')=>new Request(endpoint,{
  method:'POST',headers:{'content-type':ct},body:JSON.stringify(obj),
});
const good={
  source:'tradingview',symbol:'OANDA:XAUUSD',timeframe:'5',
  eventType:'LONDON_HIGH_SWEPT',price:4250.13,level:4249.80,
  timestamp:new Date(now).toISOString(),secret,detector:'DG Smart Money Liquidity',
  metadata:{someUntrusted:'not included'},
};
(async()=>{
  let resp=await handler(request(good));
  assert.equal(resp.status,503,'Not configured must fail CLOSED');
  configured=true;
  resp=await handler(request({...good,secret:'invalid'}));
  assert.equal(resp.status,401);
  resp=await handler(request({...good,eventType:'SETUP_CONFIRMED'}));
  assert.equal(resp.status,422,'Do not accept entries/signals from webhook');
  resp=await handler(request({...good,eventType:'LONDON_LOW_SWEPT',timestamp:'bad'}));
  assert.equal(resp.status,422);
  resp=await handler(request({...good,symbol:'BTCUSD'}));
  assert.equal(resp.status,422);
  resp=await handler(request(good,'text/plain'));
  assert.equal(resp.status,415);
  resp=await handler(new Request(endpoint,{method:'GET'}));
  assert.equal(resp.status,405);
  resp=await handler(request(good));
  assert.equal(resp.status,200);
  assert.equal(saved.size,1);
  const recorded=[...saved.values()][0];
  assert.equal(recorded.symbol,'XAUUSD');
  assert.equal(recorded.event_type,'LONDON_HIGH_SWEPT');
  assert.equal(recorded.level_price,4249.8);
  assert.equal(recorded.detector,'DG Smart Money Liquidity');
  assert.deepEqual(JSON.parse(JSON.stringify(recorded.meta)),{});
  const key=recorded.event_key;
  resp=await handler(request(good));
  assert.equal(resp.status,200);
  assert.equal(saved.size,1,'same bar alert deterministic idempotency');
  assert.equal([...saved.values()][0].event_key,key);
  apiReady=false;
  resp=await handler(request({...good,eventType:'LONDON_LOW_TOUCHED'}));
  assert.equal(resp.status,503,'do not claim success without persistent write');
  console.log('DG OS TradingView webhook: fail-closed secret, deny spoof/invalid, service-only persistence, no trade signals and idempotency OK');
})().catch(e=>{console.error(e);process.exitCode=1});
