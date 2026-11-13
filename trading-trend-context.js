/* DG OS - XAUUSD trend, targets and countertrend context.
   Fact-only presentation. DG strategy is defined in rules/strategy.md.
   Never creates an entry or turns a liquidity event into a trade signal. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DGTrendContext=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const BIAS_STATES=new Set(['BULLISH','BEARISH','NEUTRAL_MIXED']);
  const PRIMARY_LEVELS=new Set([
    'dailyHigh','dailyLow','prevDayHigh','prevDayLow',
    'asiaHigh','asiaLow','londonHigh','londonLow','nyHigh','nyLow'
  ]);
  const PRIORITY_ORDER={PRIMARY:0,SECONDARY:1,EXTENDED:2};

  function isFinitePrice(value){
    return typeof value==='number'&&Number.isFinite(value)&&value>0;
  }
  function relevantLevel(level){
    return level&&(
      PRIMARY_LEVELS.has(level.id)||
      (level.structureType==='external'&&['Daily','4H'].includes(level.timeframe))
    );
  }
  function priorityIndex(value){
    return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER,value)
      ? PRIORITY_ORDER[value]:3;
  }
  function targetList(targets,direction){
    return (Array.isArray(targets)?targets:[])
      .filter(t=>t&&t.direction===direction&&isFinitePrice(t.price))
      .sort((a,b)=>priorityIndex(a.priority)-priorityIndex(b.priority))
      .slice(0,3)
      .map(t=>({
        price:t.price,priority:t.priority||'—',reason:t.reason||'Unbenanntes Marktlevel',
        timeframe:t.timeframe||null
      }));
  }
  function sweepTime(level){
    const at=Date.parse(level.sweptAt||'');
    return Number.isFinite(at)?at:0;
  }
  function read(brain){
    if(!brain||brain.symbol!=='XAUUSD'||!brain.report){
      return{available:false,reason:'Keine belegten XAUUSD-Brain-Daten.'};
    }
    if(brain.status==='DATA_NOT_READY'||brain.report.status==='DATA_NOT_READY'){
      return{available:false,reason:'Unvollständige HTF-Kerzendaten: kein belastbarer Trend-/Gegentrend-Kontext.'};
    }
    const htf=brain.htfContext||brain.report.htfBias||{};
    const reportBias=brain.report.htfBias||{};
    const macro=htf.macro||reportBias.macro||null;
    const trading=htf.trading||reportBias.trading||null;
    const macroBias=macro&&BIAS_STATES.has(macro.state)?macro.state:'UNBESTIMMT';
    const tradingBias=trading&&BIAS_STATES.has(trading.state)?trading.state:'UNBESTIMMT';
    const structures=brain.structure||{};
    const structureFacts=['weekly','daily','h4'].map(key=>{
      const structure=structures[key]||{};
      const value=structure.externalBias;
      return{
        timeframe:key==='h4'?'4H':key==='weekly'?'Weekly':'Daily',
        direction:value==='bearish'?'BEARISH':value==='bullish'?'BULLISH':'UNBESTIMMT'
      };
    });

    const targets=Array.isArray(brain.targets)?brain.targets:brain.report.targets;
    const lows=(Array.isArray(brain.liquidity)?brain.liquidity:[])
      .filter(level=>level&&level.type==='low'&&level.status==='sweeped'&&
        isFinitePrice(level.price)&&relevantLevel(level))
      .sort((a,b)=>{
        const reactionDiff=Number(b.reaction?.status==='REACTED')-Number(a.reaction?.status==='REACTED');
        if(reactionDiff) return reactionDiff;
        return sweepTime(b)-sweepTime(a);
      })
      .slice(0,4)
      .map(level=>({
        id:level.id||level.label||'low',label:level.label||'Liquidity Low',
        price:level.price,timeframe:level.timeframe||null,
        sweptAt:level.sweptAt||null,
        reactionConfirmed:level.reaction?.status==='REACTED',
        reactionReason:level.reaction?.status==='REACTED'?
          (level.reaction.reasons||[])[0]||'H1-Reaktion erkannt':null
      }));

    const bearishTrading=tradingBias==='BEARISH';
    const hasBullishPoi=Array.isArray(brain.report.freshBullishPOIs)&&
      brain.report.freshBullishPOIs.length>0;
    const reactionSeen=lows.some(level=>level.reactionConfirmed);
    const existingEntryStatus=brain.entry?.status||brain.decision?.status||brain.report.status||'WAIT';
    let countertrendStatus='KEIN GEGEN-TREND-LONG-KONTEXT';
    let countertrendDetail='Ein bearisher Trading Bias und eine Sellside-Liquidity-Abholung sind nicht gemeinsam belegt.';
    if(bearishTrading&&lows.length){
      if(reactionSeen){
        countertrendStatus='GEGEN-TREND-LONG BEOBACHTEN';
        countertrendDetail=hasBullishPoi
          ? 'Sellside-Liquidity abgeholt und H1-Reaktion erkannt. Bullisher POI vorhanden. Die valide 15M-Confirmation und der vollständige DG-Entry-Status bleiben entscheidend.'
          : 'Sellside-Liquidity abgeholt und H1-Reaktion erkannt. Ein valider bullisher POI und die 15M-Confirmation sind noch zu prüfen.';
      }else{
        countertrendStatus='LOW ABGEHOLT · REAKTION FEHLT';
        countertrendDetail='Bearisher Trading Bias und mindestens ein als SWEPT registriertes Low. Noch keine bestätigte H1-Reaktion. Kein automatisches BUY.';
      }
    }else if(bearishTrading){
      countertrendStatus='BEARISH · LOW-SWEEP PRÜFEN';
      countertrendDetail='Der Trading Bias ist bearish. Bisher ist kein relevantes, als SWEPT registriertes Low für einen möglichen Gegenbewegungs-Kontext belegt.';
    }else if(tradingBias==='UNBESTIMMT'){
      countertrendStatus='TREND NICHT BESTÄTIGT';
      countertrendDetail='Ohne bestätigten DG Trading Bias keine Einordnung als Gegen-Trend-Long.';
    }
    return{
      available:true,macroBias,tradingBias,structureFacts,
      downTargets:targetList(targets,'down'),
      upTargets:targetList(targets,'up'),
      sweptLows:lows,
      countertrend:{
        status:countertrendStatus,detail:countertrendDetail,
        isCountertrendContext:bearishTrading&&lows.length>0,
        reactionConfirmed:reactionSeen,hasBullishPoi,
        entryStatus:existingEntryStatus
      }
    };
  }
  return{read};
});
