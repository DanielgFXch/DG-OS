#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// DG OS Ingest — Phase 1 (Core Foundation, v0.20.0)
//
// Run by .github/workflows/market-data.yml, right after the existing
// bash/jq step writes data/market.json. This is the piece that makes DG OS
// "dauerhaft beobachten, Zustände speichern und nach einem Neustart
// rekonstruieren" (per Daniel's Phase 1 instruction) — within what today's
// free infrastructure can honestly deliver:
//
//   - "Zustände speichern" / "nach einem Neustart rekonstruieren": fully
//     solved. state/latest.json is the persisted MarketBrain snapshot,
//     committed to git — a restart (a fresh checkout, a new Actions runner,
//     anything) reconstructs exactly where DG OS left off by reading it.
//   - "dauerhaft beobachten": partially solved, honestly. This still runs
//     on the same 15-minute GitHub Actions cron as data/market.json always
//     has — not a truly continuous, always-on watcher. True continuous
//     observation (sub-15-min, independent of any cron) needs an always-on
//     host, which is a separate infrastructure decision the audit
//     deliberately left open (see docs/DG_OS_V2_AUDIT.md, "RECOMMENDED V2
//     ARCHITECTURE", Layer 1) — not something to silently claim here.
//
// Reuses marketBrain.js and events.js as-is — this script computes nothing
// of its own. It only: reads data/market.json, loads the previous
// state/latest.json (or starts cold), computes the next MarketBrain
// snapshot, diffs it for events, and persists both.
// ---------------------------------------------------------------------------

const fs=require('fs');
const path=require('path');
const MB=require('../marketBrain.js');
const{classifyMarketEvents}=require('../events.js');

const ROOT=path.join(__dirname,'..');
const MARKET_DATA_PATH=path.join(ROOT,'data','market.json');
const STATE_DIR=path.join(ROOT,'state');
const LATEST_PATH=path.join(STATE_DIR,'latest.json');
const EVENTS_PATH=path.join(STATE_DIR,'events.jsonl');

// Keep the hot event log bounded — an unbounded, ever-growing file
// committed every 15 minutes is a known, documented limitation (see
// docs/DG_OS_V2_AUDIT.md's migration plan: a real database is Phase 3+
// territory). This caps it at a few weeks of typical activity rather than
// growing forever; nothing is deleted from git history, only from the
// working file.
const EVENTS_RETAIN=2000;

function readJson(filePath){
  if(!fs.existsSync(filePath)) return null;
  try{ return JSON.parse(fs.readFileSync(filePath,'utf8')) }catch(err){ return null }
}

function readEventLines(filePath){
  if(!fs.existsSync(filePath)) return[];
  return fs.readFileSync(filePath,'utf8').split('\n').filter(Boolean);
}

// The trimmed shape persisted for restart-reconstruction and next-run
// diffing. Deliberately excludes the raw 72h candle array — that's
// re-fetched fresh every run from TwelveData already (see
// market-data.yml), so persisting it again would just duplicate ephemeral
// input. What's persisted is the *computed* state: exactly what a restart
// needs to pick back up, and exactly what the next run needs to diff
// against.
function toPersistedState(brain){
  return{
    updatedAt:new Date().toISOString(),
    liveData:brain.liveData?{
      price:brain.liveData.price,dailyOpen:brain.liveData.dailyOpen,dailyHigh:brain.liveData.dailyHigh,dailyLow:brain.liveData.dailyLow,barDate:brain.liveData.barDate,
      weeklyOpen:brain.liveData.weeklyOpen,weeklyHigh:brain.liveData.weeklyHigh,weeklyLow:brain.liveData.weeklyLow,weekBarDate:brain.liveData.weekBarDate,
      monthlyOpen:brain.liveData.monthlyOpen,monthlyHigh:brain.liveData.monthlyHigh,monthlyLow:brain.liveData.monthlyLow,monthBarDate:brain.liveData.monthBarDate
    }:null,
    sessions:brain.sessions||null,
    premiumDiscount:brain.premiumDiscount||null,
    htfBias:brain.htfBias||null,
    liquidity:brain.liquidity||null,
    pois:(brain.pois&&brain.pois.list)||[],
    structure:(brain.structure&&brain.structure.list)||[],
    dgConfidence:brain.dgConfidence||null,
    decision:brain.decision||null,
    overview:brain.overview||null,
    patternIds:[] // filled by the caller after classifyMarketEvents() runs
  };
}

function main(){
  const marketData=readJson(MARKET_DATA_PATH);
  if(!marketData){
    console.error('[ingest] data/market.json not found or unreadable — nothing to do.');
    process.exit(1);
  }

  const prevState=readJson(LATEST_PATH);

  const brain=MB.computeAllDerivedModules({
    liveData:marketData,
    sessions:marketData.sessions||null,
    candles:marketData.candles||null
  });

  const{events,patternIds}=classifyMarketEvents(prevState,brain);

  const persisted=toPersistedState(brain);
  persisted.patternIds=patternIds;

  if(!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR,{recursive:true});
  fs.writeFileSync(LATEST_PATH,JSON.stringify(persisted,null,2)+'\n');

  if(events.length){
    const existingLines=readEventLines(EVENTS_PATH);
    const newLines=events.map(e=>JSON.stringify(Object.assign({ingestedAt:new Date().toISOString()},e)));
    const allLines=existingLines.concat(newLines).slice(-EVENTS_RETAIN);
    fs.writeFileSync(EVENTS_PATH,allLines.join('\n')+'\n');
  }

  const contextCount=events.filter(e=>e.category==='context').length;
  const tradingCount=events.filter(e=>e.category==='trading').length;
  if(!prevState){
    console.log('[ingest] cold start — no previous state found, baseline established, 0 events emitted.');
  } else {
    console.log(`[ingest] ${events.length} event(s): ${contextCount} context (silent), ${tradingCount} trading.`);
    events.filter(e=>e.category==='trading').forEach(e=>console.log(`  trading: ${e.type} ${JSON.stringify(e.payload)}`));
  }
}

main();
