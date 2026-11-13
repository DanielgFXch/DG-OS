/* DG OS — Jarvis FOMO Guard / Setup-Klarheit.
   Read-only view of existing DG Trading Brain fields from rules/strategy.md.
   No new trading criteria, confidence percentages, entries, or broker actions. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGSetupClarity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KNOWN=new Set([
    'WAIT','DATA_NOT_READY','AWAITING_DG_RULE','MISSED',
    'WATCH_BUY','WATCH_SELL','BUY_CONFIRMATION','SELL_CONFIRMATION',
    'BUY_READY','SELL_READY'
  ]);
  const CONFIRMED=new Set(['ENGULFING_CONFIRMED','STRUCTURE_CONFIRMED']);
  const titles={
    WAIT:'WAIT · Kein erzwungener Trade',
    DATA_NOT_READY:'WAIT · Marktdaten fehlen',
    AWAITING_DG_RULE:'WAIT · DG-Regel fehlt',
    MISSED:'MISSED · Nicht hinterherjagen',
    WATCH_BUY:'WATCH BUY · Auf Reaktion warten',
    WATCH_SELL:'WATCH SELL · Auf Reaktion warten',
    BUY_CONFIRMATION:'BUY · 15M Confirmation abwarten',
    SELL_CONFIRMATION:'SELL · 15M Confirmation abwarten',
    BUY_READY:'BUY READY · Kein Gewinnversprechen',
    SELL_READY:'SELL READY · Kein Gewinnversprechen'
  };
  function uniqueMessages(items){
    return [...new Set(items.filter(value=>typeof value==='string'&&value.trim()).map(v=>v.trim()))];
  }
  function result(kind,title,reason,pros,missing,risks,antiFomo,entryStatus){
    return{
      kind,title,reason,
      pros:uniqueMessages(pros),
      missing:uniqueMessages(missing),
      risks:uniqueMessages(risks),
      antiFomo,
      entryStatus:entryStatus||'KEINE LIVE-FREIGABE'
    };
  }
  function read(brain,options){
    options=options||{};
    if(!options.liveVerified){
      return result('offline','KEIN LIVE-ENTRY · Erst Daten prüfen',
        options.historical
          ?'Der letzte Marktbericht ist eine historische Aufnahme. Er kann Kontext liefern, aber keinen aktuellen Entry bestätigen.'
          :'Es liegen keine verifizierten aktuellen WebSocket-Kurse vor.',
        [],
        ['Aktueller XAUUSD-Live-Tick und frische vollständige Trading-Brain-Daten.'],
        ['Ein alter BUY/SELL-Status darf nicht als aktuelle Bestätigung gelesen werden.'],
        'Kein FOMO-Entry auf Basis verzögerter oder fehlender Kurse.',
        'DATA_NOT_READY');
    }
    if(!brain||brain.symbol!=='XAUUSD'||!brain.report||!brain.decision){
      return result('offline','MARKTDATEN NICHT VERIFIZIERT',
        'Der Trading Brain Report ist unvollständig.',
        [],['Ein vollständiger verifizierter XAUUSD Trading-Brain-Report.'],[],
        'Nicht ohne überprüfbaren Markt-Kontext handeln.','DATA_NOT_READY');
    }
    const decision=brain.decision;
    const status=brain.status==='DATA_NOT_READY'||brain.report.status==='DATA_NOT_READY'
      ?'DATA_NOT_READY':KNOWN.has(decision.status)?decision.status:'AWAITING_DG_RULE';
    const direction=decision.direction==='bullish'?'BUY':
      decision.direction==='bearish'?'SELL':null;
    const tradingBias=decision.tradingBias||brain.htfContext?.trading?.state||null;
    const macroBias=decision.macroBias||brain.htfContext?.macro?.state||null;
    const isReady=status==='BUY_READY'||status==='SELL_READY';
    const isWatch=status==='WATCH_BUY'||status==='WATCH_SELL';
    const isConfirmation=status==='BUY_CONFIRMATION'||status==='SELL_CONFIRMATION';
    const isWaiting=status==='WAIT'||status==='DATA_NOT_READY'||status==='AWAITING_DG_RULE';
    const poi=decision.primaryPoi||null;
    const confirmation=decision.confirmation||null;
    const entryZone=decision.entryZone;
    const pros=[],missing=[],risks=[];
    const basicReason=Array.isArray(decision.reasons)?decision.reasons[0]:null;

    if(!isWaiting&&status!=='MISSED'&&poi&&poi.type&&poi.timeframe){
      pros.push('Relevanter POI: '+poi.type+' ('+poi.timeframe+
        (poi.quality?' · Qualität '+poi.quality:'')+').');
    }
    if(!isWaiting&&status!=='MISSED'&&poi?.reaction){
      pros.push('POI-Reaktion ist im bestehenden Trading Brain dokumentiert.');
    }
    if(!isWaiting&&status!=='MISSED'&&confirmation&&CONFIRMED.has(confirmation.status)){
      pros.push('15M Confirmation laut DG Engine: '+confirmation.status+'.');
    }
    if((isReady||isConfirmation||isWatch)&&basicReason)pros.push('DG Engine: '+basicReason);

    if(isWaiting){
      missing.push(
        (Array.isArray(decision.missingRequirements)&&decision.missingRequirements[0])||
        basicReason||'Noch keine vollständige DG Setup-Kette belegt.'
      );
    }else if(isWatch){
      missing.push('Valide Reaktion am relevanten POI abwarten.');
    }else if(isConfirmation){
      missing.push('15M Confirmation nach deinen DG-Regeln muss bestätigt werden.');
    }else if(status==='MISSED'){
      missing.push('Auf ein neues Setup mit eigenem POI, Sweep und Confirmation warten.');
    }
    if(!isReady&&status!=='MISSED'&&!missing.length){
      missing.push('Die aktuelle Entry-Freigabe aus der DG Engine fehlt.');
    }

    if(tradingBias==='BEARISH'&&direction==='BUY'){
      risks.push('Möglicher Long gegen den bearishen Trading Bias (Daily/4H).');
    }else if(tradingBias==='BULLISH'&&direction==='SELL'){
      risks.push('Möglicher Short gegen den bullishen Trading Bias (Daily/4H).');
    }else if(tradingBias==='NEUTRAL_MIXED'&&direction){
      risks.push('Trading Bias ist neutral/gemischt; die Richtung ist nicht durch den HTF-Kontext alleine gestützt.');
    }
    if(macroBias&&tradingBias&&
      ((macroBias==='BEARISH'&&tradingBias==='BULLISH')||
       (macroBias==='BULLISH'&&tradingBias==='BEARISH'))){
      risks.push('Macro- und Trading-Bias widersprechen sich: möglicher Korrekturkontext.');
    }

    if(isReady){
      if(!entryZone||typeof entryZone!=='object'||
        typeof entryZone.priceLow!=='number'||typeof entryZone.priceHigh!=='number'){
        risks.push('Keine eindeutig definierte Entry-Zone aus der DG Engine. Keinen Entry-Preis erfinden.');
      }
      if(typeof decision.invalidation!=='number'||!Number.isFinite(decision.invalidation)){
        risks.push('Kein bestätigter Invalidationspunkt/Stop Loss. Risiko ist nicht vollständig geklärt.');
      }
      if(!Array.isArray(decision.targets)||!decision.targets.length){
        risks.push('Kein valides Markt-Target in der Entry-Richtung vorhanden.');
      }
    }

    const reason=status==='MISSED'
      ?'Der Markt hat den ursprünglichen Setup-Kontext verlassen. Ein nachträglicher Einstieg ist laut DG-Regeln kein Ersatz.'
      :isReady
        ?'Die bestehende DG Entry Engine meldet READY. Das ist eine dokumentierte Setup-Bestätigung, keine sichere Kursprognose.'
        :isConfirmation
          ?'Der Kontext hat sich entwickelt, doch die entscheidende Confirmation ist noch nicht vollständig.'
          :isWatch
            ?'Der Kontext ist interessant. Beobachten statt dem Preis hinterherlaufen.'
            :isWaiting
              ?'Die vollständigen DG-Kriterien für einen Entry sind aktuell nicht belegt.'
              :'Kein verwertbarer Entry-Status.';
    const kind=status==='MISSED'?'missed':isReady?'ready':isConfirmation||isWatch?'watch':'wait';
    const antiFomo=status==='MISSED'
      ?'BEWEGUNG VERPASST: Nicht chasen. Ein neuer Trade braucht ein neues valides Setup.'
      :isReady
        ?'READY ist keine Pflicht zum Einstieg. Nur handeln, wenn Entry, Invalidierung und Markt-Ziel für dich nachvollziehbar sind.'
        :'NO FOMO: Warten ist eine gültige Trading-Entscheidung. Ein verpasster Move ist besser als ein erzwungener Entry.';
    return result(kind,titles[status],reason,pros,missing,risks,antiFomo,status);
  }
  return{read};
});
