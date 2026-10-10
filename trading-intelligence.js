/* DG OS Session Intelligence — observation-only module.
   Chapters 1, 2 and 13 in rules/strategy.md are the authority.
   No synthetic candles, no probabilities, no BUY/SELL, no strategy mutation. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DGSessionIntel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const WINDOW = Object.freeze({ asia:[0,8], london:[8,16], ny:[13,21] });
  const HOUR = 3600000;
  function stamp(value) {
    if (typeof value !== 'string') return NaN;
    // TwelveData uses UTC YYYY-MM-DD HH:mm:ss in this project.
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)) return NaN;
    return Date.parse(value.replace(' ','T').replace(/(?<!Z)$/,'Z'));
  }
  function dayUTC(ms) { return new Date(ms).toISOString().slice(0,10); }
  function hhUTC(ms) { return new Date(ms).getUTCHours(); }
  function normalize(series, nowMs) {
    if(!Array.isArray(series))return [];
    const byTime=new Map();
    for(const raw of series) {
      if(!raw)continue;
      const at=stamp(raw.datetime);
      const o=Number(raw.open),h=Number(raw.high),l=Number(raw.low),c=Number(raw.close);
      // Only completed real H1 bars: the current partial candle is never evidence.
      if(!Number.isFinite(at)||at>nowMs-HOUR||!Number.isFinite(o)||!Number.isFinite(h)||!Number.isFinite(l)||!Number.isFinite(c)||
         o<=0||l<=0||h<l||o>h||o<l||c>h||c<l)continue;
      byTime.set(at,{at,day:dayUTC(at),hour:hhUTC(at),open:o,high:h,low:l,close:c});
    }
    return [...byTime.values()].sort((a,b)=>a.at-b.at);
  }
  function windowBars(candles,day,session) {
    const range=WINDOW[session];
    return candles.filter(c=>c.day===day&&c.hour>=range[0]&&c.hour<range[1]);
  }
  function completeHours(bars,start,end) {
    return new Set(bars.map(c=>c.hour)).size===end-start &&
      Array.from({length:end-start},(_,i)=>start+i).every(h=>bars.some(c=>c.hour===h));
  }
  const iso=ms=>new Date(ms).toISOString();
  const range=bars=>bars.length?{high:Math.max(...bars.map(b=>b.high)),low:Math.min(...bars.map(b=>b.low))}:null;
  function eventForLondon(bars,level,side) {
    let crossedAt=null,reclaimedAt=null,deepest=null,closeBeyond=false;
    const observations=[];
    for(const c of bars) {
      const breached=side==='high'?c.high>level:c.low<level;
      if(!breached&&!crossedAt)continue;
      if(breached && crossedAt===null)crossedAt=c.at;
      if(breached)deepest=deepest===null?(side==='high'?c.high:c.low):
        (side==='high'?Math.max(deepest,c.high):Math.min(deepest,c.low));
      if(crossedAt!==null) {
        // A closed candle back across the level proves a return INSIDE the range.
        const returned=side==='high'?c.close<level:c.close>level;
        if(returned&&reclaimedAt===null)reclaimedAt=c.at;
        closeBeyond=!returned;
        if(breached&&returned)observations.push('H1-Docht durch das Level und Schlusskurs wieder innerhalb der Asia-Range');
      }
    }
    if(crossedAt===null)return{state:'OPEN',at:null,returnedAt:null,extreme:null,notes:['London hat das Asia '+(side==='high'?'High':'Low')+' mit den verfügbaren abgeschlossenen H1-Kerzen nicht überschritten.']};
    const direction=side==='high'?'Buyside':'Sellside';
    return{state:reclaimedAt!==null?'RETURN_INSIDE':'TAKEN_NO_RETURN',at:iso(crossedAt),returnedAt:reclaimedAt!==null?iso(reclaimedAt):null,
      extreme:deepest,notes:[
        direction+' Liquidity-Level in London überschritten (H1).',
        reclaimedAt!==null?'Schlusskurs danach zurück innerhalb der Asia-Range festgestellt.':'Noch kein H1-Schlusskurs zurück innerhalb der Asia-Range festgestellt.',
        ...(observations.length?['Mindestens eine abgeschlossene H1-Kerze hat oberhalb/unterhalb gestochen und innerhalb geschlossen.']:[])
      ]};
  }
  function biasState(value){return ['BULLISH','BEARISH','NEUTRAL_MIXED','AWAITING_DG_RULE'].includes(value)?value:'UNAVAILABLE';}
  function computeSessionIntelligence(options={}) {
    const nowValue=options.now instanceof Date?options.now:new Date(options.now||Date.now());
    const ms=nowValue.getTime();
    const input=options.candlesByTimeframe||{};
    const h1=Array.isArray(input['1h']?.series)?input['1h'].series:Array.isArray(input.h1?.series)?input.h1.series:Array.isArray(input.h1)?input.h1:[];
    const source=options.source||'H1 · TwelveData UTC';
    const normalized=Number.isFinite(ms)?normalize(h1,ms):[];
    const brain=options.brain||{};
    const htf=brain.htfContext||{};
    const h1Structure=brain.structure?.h1||{};
    const macro=biasState(htf.macro?.state);
    const medium=biasState(htf.trading?.state);
    const data={
      status:'DATA_NOT_READY',symbol:'XAUUSD',source,asOf:Number.isFinite(ms)?iso(ms):null,
      model:'OBSERVATIONS_ONLY',sessionDate:null,asiasession:null,london:null,newYork:null,
      bias:{macro:{timeframes:'Monthly / Weekly',state:macro,reasoning:Array.isArray(htf.macro?.reasoning)?htf.macro.reasoning.slice(0,5):[]},
        medium:{timeframes:'Daily / 4H',state:medium,reasoning:Array.isArray(htf.trading?.reasoning)?htf.trading.reasoning.slice(0,5):[]},
        intraday:{timeframes:'H1',state:'STRUCTURE_ONLY',internal:typeof h1Structure.internalBias==='string'?h1Structure.internalBias:'unknown',external:typeof h1Structure.externalBias==='string'?h1Structure.externalBias:'unknown'}},
      inducement:{status:'AWAITING_DG_RULE',label:'Nicht automatisch bestätigt',reason:'Eine kleinere interne Liquidity ist nicht allein dadurch Inducement. Für die DG-Bewertung sind externe Liquidity, Kontext und bestätigte Regeln notwendig.'},
      disclaimer:'London/Asia sind Kontext, niemals ein eigenständiger Entry. Kein Trading-Signal.'
    };
    if(!normalized.length){data.reason='Keine abgeschlossenen UTC-H1-Kerzen verfügbar. Verbinde den Always-On Market Server.';return data;}
    const candidates=[...new Set(normalized.map(c=>c.day))].reverse();
    const date=candidates.find(day=>completeHours(windowBars(normalized,day,'asia'),0,8));
    if(!date){data.reason='Keine vollständig belegte Asia-Session mit acht abgeschlossenen H1-Kerzen.';return data;}
    const asiaBars=windowBars(normalized,date,'asia'),londonBars=windowBars(normalized,date,'london'),nyBars=windowBars(normalized,date,'ny');
    const a=range(asiaBars);
    data.sessionDate=date;
    data.asiasession={date,startUTC:'00:00',endUTC:'08:00',high:a.high,low:a.low,range:a.high-a.low,candles:asiaBars.length,complete:true};
    const high=eventForLondon(londonBars,a.high,'high');
    const low=eventForLondon(londonBars,a.low,'low');
    const bothTaken=high.at!==null && low.at!==null;
    const simultaneous=bothTaken && high.at===low.at;
    const lRange=range(londonBars);
    data.london={
      date,observedCandles:londonBars.length,complete:completeHours(londonBars,8,16),
      range:lRange,asiaHigh:high,asiaLow:low,bothTaken,sequence:simultaneous?'UNKNOWN_SAME_H1_CANDLE':
        bothTaken?(high.at<low.at?'HIGH_THEN_LOW':'LOW_THEN_HIGH'):'SINGLE_OR_NONE',
      note:simultaneous?'Beide Seiten innerhalb derselben H1-Kerze überschritten: Reihenfolge intrabar nicht bestimmbar.':
        !londonBars.length?'Noch keine abgeschlossenen London-H1-Kerzen für diese Asia-Session.':
        !completeHours(londonBars,8,16)?'London läuft noch oder H1-Historie ist unvollständig. Nur bisher geschlossene Kerzen zählen.':'London-Session anhand abgeschlossener H1-Kerzen ausgewertet.'
    };
    data.newYork={
      date,observedCandles:nyBars.length,complete:completeHours(nyBars,13,21),
      range:range(nyBars),context:!nyBars.length?'Keine abgeschlossenen NY-H1-Kerzen für den beobachteten Tag.':
        bothTaken?'London hat Asia High und Low überschritten. Reihenfolge'+(simultaneous?' nicht eindeutig.':': '+data.london.sequence)+'.':
        high.at?'London hat Asia High überschritten. Status der Rückkehr prüfen.':
        low.at?'London hat Asia Low unterschritten. Status der Rückkehr prüfen.':
        'London hat mit den bisher verfügbaren geschlossenen H1-Kerzen keine Asia-Grenze überschritten.'
    };
    const latest=normalized[normalized.length-1];
    const hoursSinceLast=(ms-(latest.at+HOUR))/HOUR;
    data.freshness={lastClosedCandle:iso(latest.at+HOUR),hoursSinceLastClosed:Math.max(0,Math.round(hoursSinceLast*10)/10),stale:hoursSinceLast>6};
    data.status=data.freshness.stale?'HISTORICAL':'OBSERVED';
    if(data.status==='HISTORICAL')data.reason='Letzte abgeschlossene H1-Kerze ist alt. Historischer Kontext, keine Live-Einschätzung.';
    return data;
  }
  return {WINDOW,normalize,computeSessionIntelligence,eventForLondon};
});