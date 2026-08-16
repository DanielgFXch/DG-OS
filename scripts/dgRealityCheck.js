'use strict';

const fs = require('fs');
const path = require('path');
const MB = require('../marketBrain.js');

const TIMEFRAMES = [
  { key:'15min', label:'15M' },
  { key:'1h', label:'H1' },
  { key:'4h', label:'4H' },
  { key:'daily', label:'Daily' }
];

function parseArgs(argv){
  const result={json:false,server:null,snapshot:null};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--json') result.json=true;
    else if(argv[i]==='--server') result.server=argv[++i]||null;
    else if(argv[i]==='--snapshot') result.snapshot=argv[++i]||null;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if((result.server?1:0)+(result.snapshot?1:0)!==1) throw new Error('Use exactly one of --server or --snapshot.');
  return result;
}

function normalizeServerUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'&&url.protocol!=='http:') throw new Error('Server URL must use http or https.');
  return url.toString().replace(/\/$/,'');
}

async function fetchJson(url){
  const response=await fetch(url,{headers:{accept:'application/json'}});
  if(!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).pathname}`);
  return response.json();
}

async function loadInput(options){
  if(options.snapshot){
    const body=JSON.parse(fs.readFileSync(path.resolve(options.snapshot),'utf8'));
    return body.market?{source:`snapshot:${path.resolve(options.snapshot)}`,health:body.health||null,market:body.market}:{source:`snapshot:${path.resolve(options.snapshot)}`,health:null,market:body};
  }
  const server=normalizeServerUrl(options.server);
  const [health,market]=await Promise.all([
    fetchJson(`${server}/api/health`),
    fetchJson(`${server}/api/market/XAUUSD`)
  ]);
  return{source:server,health,market};
}

function ensureMarketSnapshot(market){
  if(!market||market.symbol!=='XAUUSD'||!market.candles||!market.quote||typeof market.quote.price!=='number'){
    throw new Error('Snapshot is not a valid DG OS XAUUSD market response.');
  }
}

function candleHealth(market,def){
  const entry=market.candles[def.key]||{};
  const raw=Array.isArray(entry.series)?entry.series:[];
  const usable=MB.filterUsableMarketCandles(raw,def.label);
  const removed=raw.filter(c=>!MB.isUsableMarketCandle(c,def.label));
  return{
    timeframe:def.label,rawCount:raw.length,usableCount:usable.length,removedCount:removed.length,
    from:usable.length?MB.candleTimeToIso(usable[0].datetime):null,
    to:usable.length?MB.candleTimeToIso(usable[usable.length-1].datetime):null,
    fetchedAt:entry.fetchedAt||null,
    removedExamples:removed.slice(0,3).map(c=>({timestamp:MB.candleTimeToIso(c.datetime),open:c.open,high:c.high,low:c.low,close:c.close,reason:'UNUSABLE_MARKET_CANDLE'}))
  };
}

function poiFact(poi){
  return{
    id:poi.id,type:poi.type,timeframe:poi.timeframe,direction:poi.direction,
    range:{low:poi.priceLow,high:poi.priceHigh},formedAt:poi.createdAt,
    tested:(poi.mitigationPercent||0)>0||!!(poi.confirmation&&poi.confirmation.touchedAt),
    mitigationPercent:Math.round((poi.mitigationPercent||0)*100)/100,
    mitigationState:poi.mitigationState,
    reaction:!!poi.reaction||!!(poi.confirmation&&poi.confirmation.reactionDetected),
    displacement:!!poi.formedByDisplacement,
    quality:poi.quality,score:poi.score,maxScore:poi.maxScore,
    distanceToPrice:typeof poi.distanceToPrice==='number'?Math.round(poi.distanceToPrice*100)/100:null,
    reasons:poi.reasons||[]
  };
}

function buildRealityReport(input){
  const market=input.market;
  ensureMarketSnapshot(market);
  const liquidityBase=(market.brain&&Array.isArray(market.brain.liquidity))?market.brain.liquidity:[];
  const brain=MB.computeTradingBrainV1(market.candles,liquidityBase,market.quote.price,null,null,[]);
  const relevantPois={};
  ['Daily','4H','H1'].forEach(tf=>{
    relevantPois[tf]=brain.pois
      .filter(p=>p.timeframe===tf&&p.mitigationState!=='FULLY_MITIGATED'&&(p.quality==='medium'||p.quality==='high'))
      .sort((a,b)=>(b.score-a.score)||(a.distanceToPrice-b.distanceToPrice))
      .slice(0,5).map(poiFact);
  });
  const keyLiquidity=brain.liquidity.filter(MB.isV1PrimaryLiquidity).map(l=>({
    id:l.id,label:l.label,timeframe:l.timeframe,period:l.period,price:l.price,status:MB.LIQUIDITY_STATUS_LABEL[l.status]||l.status,
    sweptAt:l.sweptAt||null,sweepTimingSource:l.sweepTimingSource||null,reaction:l.reaction?l.reaction.status:null
  }));
  const confirmations=brain.pois
    .filter(p=>p.confirmation&&p.confirmation.touchedAt)
    .sort((a,b)=>new Date(b.confirmation.touchedAt)-new Date(a.confirmation.touchedAt))
    .slice(0,5).map(p=>({poi:p.id,timeframe:p.timeframe,touchedAt:p.confirmation.touchedAt,status:p.confirmation.status,reactionDetected:!!p.confirmation.reactionDetected,reasons:p.confirmation.reasons||[]}));
  return{
    generatedAt:new Date().toISOString(),source:input.source,symbol:market.symbol,price:market.quote.price,
    dataHealth:{server:input.health||null,timeframes:TIMEFRAMES.map(def=>candleHealth(market,def))},
    relevantPois,keyLiquidity,confirmations,
    decision:{internalStatus:brain.decision.detailStatus,stage:brain.decision.decisionStage,direction:brain.decision.decisionDirection,counterBias:brain.decision.counterBias,waitingFor:MB.waitingForText(brain.decision)},
    ruleQuestions:[],localBrainVersion:require('../package.json').version
  };
}

function formatText(report){
  const lines=[`DG REALITY CHECK – ${report.symbol}`,`Source: ${report.source}`,`Local Brain: v${report.localBrainVersion}`,`Price: ${report.price}`,'','DATA HEALTH'];
  report.dataHealth.timeframes.forEach(tf=>lines.push(`- ${tf.timeframe}: ${tf.usableCount}/${tf.rawCount} usable, ${tf.removedCount} removed, ${tf.from||'—'} → ${tf.to||'—'}`));
  lines.push('','RELEVANT POIs');
  Object.entries(report.relevantPois).forEach(([tf,pois])=>{
    lines.push(`${tf}:`);
    lines.push(...(pois.length?pois.map(p=>`- ${p.type} ${p.direction} ${p.range.low}–${p.range.high} · ${p.mitigationState} ${p.mitigationPercent}% · tested ${p.tested?'YES':'NO'} · reaction ${p.reaction?'YES':'NO'} · ${p.quality}`):['- none']));
  });
  lines.push('','KEY LIQUIDITY',...report.keyLiquidity.map(l=>`- ${l.label}: ${l.price} · ${l.status}${l.reaction?` · ${l.reaction}`:''}`));
  lines.push('','CONFIRMATION',...(report.confirmations.length?report.confirmations.map(c=>`- ${c.poi}: touch ${c.touchedAt} → ${c.status}`):['- none']));
  lines.push('','DECISION',`- ${report.decision.stage}${report.decision.direction?` ${report.decision.direction}`:''}`,`- Detail: ${report.decision.internalStatus}`,`- Counter-Bias: ${report.decision.counterBias?'YES':'NO'}`,`- Waiting for: ${report.decision.waitingFor||'—'}`);
  lines.push('','RULE QUESTIONS',...(report.ruleQuestions.length?report.ruleQuestions.map(q=>`- ${q}`):['- none']));
  return lines.join('\n');
}

async function main(argv){
  const options=parseArgs(argv);
  const input=await loadInput(options);
  const report=buildRealityReport(input);
  process.stdout.write(options.json?`${JSON.stringify(report,null,2)}\n`:`${formatText(report)}\n`);
}

if(require.main===module){
  main(process.argv.slice(2)).catch(err=>{ process.stderr.write(`DG Reality Check failed: ${err.message}\n`); process.exitCode=1; });
}

module.exports={parseArgs,normalizeServerUrl,loadInput,buildRealityReport,formatText};
