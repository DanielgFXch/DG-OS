#!/usr/bin/env node
'use strict';
// DG OS Trading Brain: evidence-only periodic fallback from REAL provider OHLC.
// Uses exactly the same trading engine as the Always-On server; never
// synthesizes candles, emits auto orders, or publishes a stale entry signal.
const fs=require('node:fs'),path=require('node:path');
const MB=require('../marketBrain.js');
const DGSessionIntel=require('../trading-intelligence.js');
const root=path.resolve(__dirname,'..');
const inputPath=process.argv[2]||path.join(root,'data/market.json');
const outputPath=process.argv[3]||path.join(root,'data/trading-brain.json');
function validSeries(v){
  const list=Array.isArray(v?.series)?v.series:[];
  return list.filter(c=>c&&typeof c.datetime==='string'&&
    [c.open,c.high,c.low,c.close].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&
    c.low<=c.high&&c.open>=c.low&&c.open<=c.high&&c.close>=c.low&&c.close<=c.high);
}
function snapshot(data){
  if(!data||typeof data!=='object')throw Error('market_snapshot_required');
  const updatedAt=new Date(data.updatedAt);
  const price=Number(data.price);
  if(!Number.isFinite(updatedAt.getTime())||!Number.isFinite(price)||price<=0)
    throw Error('invalid_real_market_snapshot');
  const source=data.candlesByTimeframe||{};
  const required=['weekly','daily','4h','1h'];
  const keys=['monthly','weekly','daily','4h','1h','15min','5min'];
  const candles={};
  for(const key of keys)candles[key]={series:validSeries(source[key])};
  // Existing fallback always has H1 OHLC. Do not regress older snapshots.
  if(!candles['1h'].series.length)candles['1h'].series=validSeries({series:data.candles?.h1});
  const availability=Object.fromEntries(keys.map(k=>[k,candles[k].series.length]));
  const missing=required.filter(k=>!availability[k]);
  const derived=MB.computeAllDerivedModules({
    liveData:data,sessions:data.sessions||null,
    candles:{h1:candles['1h'].series}
  });
  const brain=MB.computeTradingBrainV1(candles,derived.liquidity,price,null,null,[]);
  const intelligence=DGSessionIntel.computeSessionIntelligence({
    candlesByTimeframe:candles,brain,now:updatedAt,source:'TwelveData · veröffentlichter H1-Snapshot (kein Live-Server)'
  });
  // All snapshot reports stay deliberately non-actionable: a GitHub Actions
  // cron is NOT real-time; even if its last close matched a confirmation it
  // is NOT a valid LIVE BUY_READY/SELL_READY when the owner next opens DG OS.
  const safeStatus='DATA_NOT_READY';
  const safeSummary='VERZÖGERTE MARKTAUFNAHME. Keine Live-Entry-Freigabe. '+
    (missing.length?'Unvollständige HTF-Daten: '+missing.join(', ')+'. ':'')+
    String(brain.report?.summary||'').slice(0,1300);
  const entry=Object.assign({},brain.entry||{}, {
    status:safeStatus,entryZone:null,stopLoss:null,
    reasons:['Keine Handelsfreigabe aus zeitverzögertem GitHub-Actions-Snapshot.']
  });
  const decision=Object.assign({},brain.decision||{},{
    status:safeStatus,entryZone:null,stopLoss:null,
    reasons:['Nur Marktbeobachtung; ohne dauerhaft verbundene Echtzeitdaten kein Entry.'],
    primaryPoi:null
  });
  const report=Object.assign({},brain.report||{},{
    status:safeStatus,summary:safeSummary,entry,risk:null
  });
  return {
    mode:'PERIODIC_READ_ONLY',symbol:'XAUUSD',updatedAt:updatedAt.toISOString(),
    source:'TwelveData via GitHub Actions · kein WebSocket',
    freshness:'CHECK_CLIENT_CLOCK',availability,missingCoreTimeframes:missing,
    htfReady:missing.length===0,
    brain:{
      status:safeStatus,htfContext:brain.htfContext,report,entry,
      risk:null,targets:(brain.targets||[]).slice(0,10),decision,
      sessionIntelligence:intelligence
    }
  };
}
if(require.main===module){
  try{
    const raw=JSON.parse(fs.readFileSync(inputPath,'utf8'));
    const result=snapshot(raw);
    fs.mkdirSync(path.dirname(outputPath),{recursive:true});
    fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
    console.log('[trading-snapshot] real provider OHLC coverage '+JSON.stringify(result.availability)+
      ' · missing '+JSON.stringify(result.missingCoreTimeframes)+' · NO LIVE ENTRIES');
  }catch(err){console.error('[trading-snapshot] '+err.message);process.exit(1);}
}
module.exports={snapshot,validSeries};
