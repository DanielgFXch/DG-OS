/* DG OS — Jarvis Direction Compass.
   Presentation-only interpretation of the EXISTING DG HTF/Trading Bias,
   target and entry state. Defined by rules/strategy.md §§1, 2, 8, 9, 12.
   A directional preference is NOT an entry, prediction or win probability. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGDirectionCompass=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BIAS=new Set(['BULLISH','BEARISH','NEUTRAL_MIXED']);
  const VALID_READY=new Set(['BUY_READY','SELL_READY']);
  const VALID_WATCH=new Set(['WATCH_BUY','WATCH_SELL','BUY_CONFIRMATION','SELL_CONFIRMATION']);
  const finitePrice=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
  const dePrice=v=>Number(v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  function result(fields){
    return Object.freeze(Object.assign({
      kind:'offline',focus:'WAIT',headline:'KEINE AKTUELLE RICHTUNG',
      contextLabel:'NICHT VERIFIZIERT',explanation:'Kein bestätigter XAUUSD-Live-Kontext.',
      entryLabel:'ENTRY: WAIT',entryStatus:'DATA_NOT_READY',
      target:null,evidence:[],opposition:[],nextStep:'Live-Goldkurs und vollständige DG-Marktdaten prüfen.',
      countertrend:null,tradeReady:false
    },fields));
  }
  function read(brain,{liveVerified=false,continuousVerified=false,historical=false,price=null,trendContext=null}={}){
    // The weekly/daily snapshot and browser demo content can never be
    // presented as a CURRENT BUY/SELL focus.
    if(!liveVerified){
      return result({
        contextLabel:historical?'HISTORISCH · KEIN LIVE':'KEIN LIVE',
        explanation:historical?'Ein historischer Trading-Bias ist keine aktuelle Handelsrichtung.':
          'Es fehlt ein frischer bestätigter XAUUSD-Tick mit aktuellen DG-Kerzen.'
      });
    }
    if(!brain||brain.symbol!=='XAUUSD'||!brain.report||!brain.decision||
       brain.status==='DATA_NOT_READY'||brain.report.status==='DATA_NOT_READY'){
      return result({kind:'unverified',contextLabel:'DG-DATEN NICHT BEREIT',
        explanation:'Kein vollständiger bestätigter Markt-Kontext. Keine Richtungspräferenz aus unvollständigen Daten.'});
    }
    const tr=trendContext?.read?.(brain);
    if(!tr?.available){
      return result({kind:'unverified',contextLabel:'KONTEXT FEHLT',
        explanation:tr?.reason||'Die DG-Trend- und Zielauswertung ist nicht verfügbar.'});
    }
    const trading=BIAS.has(tr.tradingBias)?tr.tradingBias:'NEUTRAL_MIXED';
    const macro=BIAS.has(tr.macroBias)?tr.macroBias:'NEUTRAL_MIXED';
    const status=typeof brain.decision.status==='string'?brain.decision.status:'WAIT';
    const priceValid=finitePrice(price);
    const direction=trading==='BULLISH'?'BUY':trading==='BEARISH'?'SELL':null;
    const evidence=[],opposition=[];
    const ownTargets=direction==='BUY'?tr.upTargets:tr.downTargets;
    const sideMatches=direction==='BUY'?v=>v.price>price:v=>v.price<price;
    const directionalTargets=Array.isArray(ownTargets)&&priceValid?
      ownTargets.filter(v=>finitePrice(v.price)&&sideMatches(v)):[];
    const target=directionalTargets[0]||null;
    const aligned=direction&&(macro===trading);
    const counter=direction&&macro!=='NEUTRAL_MIXED'&&macro!==trading;
    if(direction){
      evidence.push('Trading-Bias Daily/4H: '+trading+'.');
      if(aligned)evidence.push('Monthly/Weekly unterstützen dieselbe Richtung.');
      if(target)evidence.push('Nächstes registriertes Ziel in Richtung '+direction+': '+
        dePrice(target.price)+' USD ('+target.reason+').');
      else opposition.push(priceValid?
        'Kein belegtes offenes Ziel in '+direction+'-Richtung relativ zum aktuellen Goldpreis.':
        'Kein verifizierter aktueller Kurs für die Einordnung der Ziele.');
      if(counter)opposition.push('Macro- und Trading-Bias widersprechen sich: mögliche Korrektur.');
      if(macro==='NEUTRAL_MIXED')opposition.push('Monthly/Weekly sind nicht eindeutig gerichtet.');
    }else{
      opposition.push('Daily/4H-Bias ist neutral oder gemischt. Eine Richtung wäre geraten.');
      if(macro!=='NEUTRAL_MIXED')evidence.push('Macro-Bias: '+macro+'; allein kein Entry.');
    }
    const low=Array.isArray(tr.sweptLows)?tr.sweptLows[0]:null;
    let countertrend=null;
    if(direction==='SELL'&&low){
      countertrend=low.reactionConfirmed?
        'Sellside-Low '+dePrice(low.price)+' wurde abgeholt und H1-Reaktion ist registriert. '+
          'Ein BUY als Gegenbewegung ist beobachtbar, aber nur mit POI und 15M-Confirmation.':
        'Sellside-Low '+dePrice(low.price)+' als SWEPT registriert; H1-Reaktion fehlt noch. '+
          'Keinen verspäteten SELL chasen und keinen BUY vorzeitig eröffnen.';
      opposition.push(countertrend);
    }
    // Show READY only when an uninterrupted Always-On engine verified the
    // actual setup AND produced a coherent zone, invalidation and target.
    const rawReady=continuousVerified&&VALID_READY.has(status);
    const zone=brain.decision.entryZone;
    const invalid=brain.decision.invalidation;
    const side=status==='BUY_READY'?'up':'down';
    const plannedTarget=(brain.decision.targets||[]).find(v=>
      v?.direction===side&&finitePrice(v.price));
    const planComplete=zone&&typeof zone==='object'&&finitePrice(zone.priceLow)&&
      finitePrice(zone.priceHigh)&&zone.priceLow<=zone.priceHigh&&finitePrice(invalid)&&
      Boolean(plannedTarget);
    const tradeReady=Boolean(rawReady&&planComplete);
    let entryLabel='ENTRY: WAIT / NO TRADE';
    if(status==='MISSED')entryLabel='ENTRY: MISSED · NICHT CHASEN';
    else if(tradeReady)entryLabel='DG ENTRY: '+(status==='BUY_READY'?'BUY':'SELL')+' READY · MANUELL PRÜFEN';
    else if(rawReady)entryLabel='ENTRY: WAIT · RISIKO-PLAN UNVOLLSTÄNDIG';
    else if(continuousVerified&&VALID_WATCH.has(status))entryLabel='ENTRY: '+status+' · NICHT READY';
    else if(!continuousVerified)opposition.push('Browser-Brain ohne durchgehende Setup-Historie: keine Live-Entry-Freigabe.');
    if(rawReady&&!planComplete)opposition.push('Entry-Zone, Invalidierung oder Markt-Ziel nicht vollständig nachgewiesen.');
    const contextLabel=!direction?'GEMISCHT / KEINE PRÄFERENZ':
      counter?'KONTEXT WIDERSPRÜCHLICH':
      aligned&&target?'MACRO + TRADING GLEICHE RICHTUNG':
      'TRADING-RICHTUNG MIT VORBEHALT';
    const nextStep=tradeReady
      ?'DG Engine meldet READY. Entry, Invalidierung, Ziel und persönliches Risiko selbst prüfen; kein automatischer Trade.'
      :direction
        ?'Nur beobachten: Relevante Liquidity, POI, Reaktion und gültige 15M-Confirmation prüfen. Ohne vollständige Kette WAIT.'
        :'Erst klären, welche Liquidity als Nächstes relevant ist. Bis dahin WAIT / NO TRADE.';
    return result({
      kind:tradeReady?'ready':direction?'direction':'mixed',
      focus:direction||'WAIT',
      headline:direction?direction+'-FOKUS · NICHT AUTOMATISCH EINSTEIGEN':'WAIT · KEIN KLARER BUY-/SELL-FOKUS',
      contextLabel,explanation:direction
        ?'Daily/4H geben die bevorzugte Beobachtungsrichtung vor. Das sagt nichts über die Gewinnwahrscheinlichkeit aus.'
        :'Die vorhandenen DG-Fakten ergeben keine eindeutige Vorzugsrichtung.',
      entryLabel,entryStatus:status,target,evidence,opposition,nextStep,countertrend,tradeReady
    });
  }
  return Object.freeze({read});
});
