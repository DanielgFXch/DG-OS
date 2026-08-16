'use strict';

const MB=require('../marketBrain.js');
const reality=require('./dgRealityCheck.js');

const DURATION_MS={monthly:31*86400000,weekly:7*86400000,daily:86400000,'4h':4*3600000,'1h':3600000,'30min':1800000,'15min':900000};

function parseArgs(argv){
  const result={server:null,snapshot:null,json:false};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--server') result.server=argv[++i]||null;
    else if(argv[i]==='--snapshot') result.snapshot=argv[++i]||null;
    else if(argv[i]==='--json') result.json=true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if((result.server?1:0)+(result.snapshot?1:0)!==1) throw new Error('Use exactly one of --server or --snapshot.');
  return result;
}

function availableAt(candle,timeframe){
  const iso=MB.candleTimeToIso(candle&&candle.datetime);
  if(!iso) return NaN;
  const opened=new Date(iso);
  if(timeframe==='monthly') return Date.UTC(opened.getUTCFullYear(),opened.getUTCMonth()+1,1);
  return opened.getTime()+(DURATION_MS[timeframe]||0);
}

function candlesKnownAt(candles,timeframe,cutoffMs){
  return MB.filterUsableMarketCandles(candles,timeframe).filter(candle=>availableAt(candle,timeframe)<=cutoffMs);
}

function replayMarketSnapshot(market){
  if(!market||!market.candles) throw new Error('Replay requires a DG OS market snapshot with candles.');
  const replayCandles=MB.filterUsableMarketCandles((market.candles['15min']&&market.candles['15min'].series)||[],'15M');
  let priorSetup=null,liquidityMemory=null;
  return replayCandles.map(candle=>{
    const cutoffMs=availableAt(candle,'15min');
    const known={};
    Object.entries(market.candles).forEach(([timeframe,entry])=>{
      known[timeframe]={series:candlesKnownAt((entry&&entry.series)||[],timeframe,cutoffMs)};
    });
    const brain=MB.computeTradingBrainV1(known,[],Number(candle.close),priorSetup,liquidityMemory,[]);
    const active=['WATCH_BUY','WATCH_SELL','BUY_CONFIRMATION','SELL_CONFIRMATION','BUY_READY','SELL_READY'].includes(brain.decision.detailStatus);
    priorSetup=active?{direction:brain.decision.direction,status:brain.decision.detailStatus,primaryPoi:brain.decision.primaryPoi}:null;
    liquidityMemory=brain.liquidityMemory;
    return{
      at:new Date(cutoffMs).toISOString(),price:Number(candle.close),
      knownCandles:Object.fromEntries(Object.entries(known).map(([key,value])=>[key,value.series.length])),
      poiCount:brain.pois.length,touchedPoiCount:brain.pois.filter(p=>p.confirmation&&p.confirmation.touchedAt).length,
      decisionStage:brain.decision.decisionStage,decisionDirection:brain.decision.decisionDirection,detailStatus:brain.decision.detailStatus
    };
  });
}

function formatText(timeline){
  const lines=['DG OS CANDLE REPLAY',''];
  timeline.forEach(step=>lines.push(`${step.at} · ${step.price} · ${step.decisionStage}${step.decisionDirection?` ${step.decisionDirection}`:''} [${step.detailStatus}] · POIs ${step.poiCount} · touched ${step.touchedPoiCount}`));
  if(!timeline.length) lines.push('REAL_CASE_NOT_AVAILABLE: no usable 15M candles.');
  return lines.join('\n');
}

async function main(argv){
  const options=parseArgs(argv);
  const input=await reality.loadInput(options);
  const timeline=replayMarketSnapshot(input.market);
  process.stdout.write(options.json?`${JSON.stringify(timeline,null,2)}\n`:`${formatText(timeline)}\n`);
}

if(require.main===module){
  main(process.argv.slice(2)).catch(err=>{process.stderr.write(`DG Replay failed: ${err.message}\n`);process.exitCode=1;});
}

module.exports={parseArgs,availableAt,candlesKnownAt,replayMarketSnapshot,formatText};
