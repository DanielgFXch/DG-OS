'use strict';
/* DG OS Jarvis · spoken dialogue intent & fact-checked trading readout.
   No provider keys, no orders, no invented MT5/TradingView trades.
   Shared by text form and microphone so every completed answer takes the
   existing dgos-jarvis-final-response -> voice path. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSJarvisConversation=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const tradeWords=/\b(?:trading|trades?|positionen?|position|gold|xau(?:usd)?|markt(?:analyse)?|chart|candles?|kerzen?|liquidity|liquidität|sweep|asia|london|new\s*york|fvg|order\s*blocks?|bias|setups?|entry|einstieg|stop\s*loss|stopps?|gewinn|verlust|performance|rr|risiko|tp\d?)\b/i;
  const askWords=/\b(?:analysier\w*|prüf\w*|check\w*|bewert\w*|erklär\w*|warum|wieso|wie|was|wann|wo|welche\w*|kann\w*|soll\w*|zeig\w*|sag\w*|erzähl\w*|berichte\w*|einschätz\w*|aktuell|heute|gestern|letzten|letzte|letzter|momentan|jetzt|signale?|aufgebaut|aussehen|aussieht)\b/i;
  const ownTrades=/\b(?:mein\w*|unser\w*|letzten?\s+(?:zwei|drei|\d+)|mt5|metatrader|kontoauszug|kontoverlauf|trading\s*historie|trade\s*historie|meinem\s*konto)\b/i;
  function isTradingQuestion(question){
    const q=String(question||'').toLowerCase();
    return tradeWords.test(q) && (askWords.test(q) || q.includes('?'));
  }
  function asksForOwnTrades(question){
    const q=String(question||'').toLowerCase();
    return /\b(?:trades?|positionen?|performance|gewinn|verlust|kontoverlauf|kontoauszug|mt5|metatrader)\b/i.test(q) && ownTrades.test(q);
  }
  function formatDate(date){
    return new Intl.DateTimeFormat('de-CH',{
      timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',
      hour:'2-digit',minute:'2-digit'
    }).format(date)+' Uhr (CH)';
  }

  const GOLD_STATUS_QUESTION=/(?:gold|xau\s*\/?\s*usd)/i;
  const GOLD_STATUS_WORDS=/(?:wo\s+steh|wie\s+(?:steh|sieht)|was\s+(?:soll|machen|tun)|jetzt|aktuell|gerade|kurs|preis|markt|kaufen|verkaufen|long|short|analyse|einschätz|richtung)/i;
  function isGoldStatusQuestion(question){
    const q=String(question||'');
    return GOLD_STATUS_QUESTION.test(q)&&GOLD_STATUS_WORDS.test(q);
  }
  function formatGold(price){
    return new Intl.NumberFormat('de-DE',{
      minimumFractionDigits:2,maximumFractionDigits:2
    }).format(price);
  }
  function readLivePrice(quote,now){
    const price=quote?.price;
    const at=Date.parse(quote?.at||'');
    const age=(now.getTime()-at)/1000;
    if(typeof price!=='number'||!Number.isFinite(price)||price<=0||
       !Number.isFinite(at)||age < -5||age>20)return null;
    return{price,ageSeconds:Math.max(0,Math.round(age))};
  }
  function buildLiveGoldAnswer(brain,quote,options,now){
    const liveQuote=readLivePrice(quote,now);
    const lines=[];
    if(liveQuote){
      lines.push('Gold, XAUUSD, steht laut bestätigtem TwelveData-Live-WebSocket bei '+
        formatGold(liveQuote.price)+' US-Dollar je Feinunze. '+
        'Letzter Tick vor '+liveQuote.ageSeconds+' Sekunden.');
    }else{
      lines.push('Für Gold liegt aktuell kein verifizierter Livepreis vor. '+
        'Ich nenne dir deshalb keinen angeblich aktuellen Kurs.');
    }

    const trend=options.trendContext?.read?.(brain)||null;
    const clarity=options.setupClarity?.read?.(brain,{liveVerified:true})||null;
    if(trend?.available){
      lines.push('Trading Bias auf Daily und 4 Stunden: '+trend.tradingBias+
        '. Macro Bias auf Monthly und Weekly: '+trend.macroBias+'.');
      if(trend.downTargets?.length){
        lines.push('Relevante Ziele unterhalb: '+trend.downTargets.slice(0,2)
          .map(t=>formatGold(t.price)+' ('+t.reason+')').join('; ')+'.');
      }
      if(trend.upTargets?.length){
        lines.push('Relevante Ziele oberhalb: '+trend.upTargets.slice(0,2)
          .map(t=>formatGold(t.price)+' ('+t.reason+')').join('; ')+'.');
      }
      if(trend.sweptLows?.length){
        const low=trend.sweptLows[0];
        lines.push(low.label+' bei '+formatGold(low.price)+' ist als abgeholt registriert. '+
          (low.reactionConfirmed
            ?'Eine H1-Reaktion ist dokumentiert.'
            :'Eine bestätigte H1-Reaktion fehlt noch.'));
      }
      if(trend.countertrend?.isCountertrendContext){
        lines.push('Ein möglicher Long wäre derzeit gegen den bearishen Trading Trend. '+
          'Das ist ein Beobachtungsszenario und kein bestätigter Kauf.');
      }
    }else{
      lines.push('Der vollständige DG-Trendkontext ist noch nicht belastbar. '+
        'Ich erfinde keinen Bias und keine Ziele.');
    }
    if(clarity){
      lines.push('DG-Setup-Status: '+clarity.entryStatus+'. '+clarity.reason);
      if(clarity.missing?.length)lines.push('Noch offen: '+clarity.missing[0]);
      if(clarity.risks?.length)lines.push('Zu beachten: '+clarity.risks[0]);
      lines.push(clarity.antiFomo);
    }else{
      lines.push('Ein möglicher Entry bleibt unbestätigt, solange nicht alle DG-Regeln geprüft sind. '+
        'Kein FOMO und kein Einstieg nur wegen eines Sweeps.');
    }
    return lines.join(' ');
  }
  function answerTrading(question,options={}){
    if(asksForOwnTrades(question)){
      return 'Ich kann deine persönlichen Trades noch nicht direkt aus MT5 oder deinem Broker auslesen. '+
        'Für eine seriöse Auswertung deiner letzten Trades brauche ich echte Ein- und Ausstiege, '+
        'Stop-Loss, Gebühren und Ergebnisse, etwa aus einem MT5-Export. '+
        'Ohne diese Daten erfinde ich keine Trefferquote oder Performance.';
    }
    const now=options.now instanceof Date?options.now:new Date();
    // Reachability is not evidence of a live price. The caller must have
    // passed the strict DGTradingEvidenceGate and the quote must be recent.
    const verifiedQuote=readLivePrice(options.liveQuote,now);
    const live=options.liveVerified===true&&verifiedQuote&&
      options.liveBrain?.symbol==='XAUUSD'&&options.liveBrain?.report&&
      options.liveBrain?.decision?options.liveBrain:null;
    const snapshot=options.historicalSnapshot;
    const at=new Date(snapshot?.updatedAt||'');
    const age=now.getTime()-at.getTime();
    const historical=!live&&snapshot?.mode==='PERIODIC_READ_ONLY' &&
      snapshot?.symbol==='XAUUSD'&&snapshot?.brain?.report&&
      snapshot?.brain?.decision&&Number.isFinite(age)&&age>=0&&age<14*86400000;
    const brain=live||(historical?snapshot.brain:null);
    if(!brain)return 'Ich kann Gold gerade nicht zuverlässig analysieren: Es sind keine gültigen Trading-Brain-Daten oder kein ausreichend frischer Livepreis verfügbar. '+
      'Die Session-Uhr ist kein Kursfeed und ich gebe ohne belegte Kerzen keine Buy- oder Sell-Empfehlung. Kein FOMO.';

    if(live&&isGoldStatusQuestion(question)){
      return buildLiveGoldAnswer(live,options.liveQuote,options,now);
    }

    const answer=typeof options.answerMarketQuestion==='function'
      ?String(options.answerMarketQuestion(question,brain,now)||'').trim():'';
    // A recorded H1 closing price is strictly historical, NEVER a current
    // gold quote. A user asking for the price must hear that distinction.
    if(historical){
      const lastH1=snapshot.brain?.htfContext?.h1?.lastCandle;
      const h1Close=typeof lastH1?.close==='number'&&Number.isFinite(lastH1.close)
        ?lastH1.close:null;
      const prefix='XAUUSD · Historische Marktaufnahme vom '+formatDate(at)+'. '+
        (isGoldStatusQuestion(question)&&h1Close!==null
          ?'Letzter dokumentierter H1-Schlusskurs: '+formatGold(h1Close)+
            ' US-Dollar je Feinunze, nicht der aktuelle Livepreis. ':'')+
        'Das ist KEIN Live-Chart und keine gültige aktuelle Entry-Bestätigung. ';
      const text=answer.replace(/\b(?:BUY_READY|SELL_READY|BUY CONFIRMATION|SELL CONFIRMATION)\b/gi,'DATA_NOT_READY');
      return prefix+(text||'Für diese Frage liegt noch keine belegte Auswertung vor.')+
        (isGoldStatusQuestion(question)?' Für eine Handlung jetzt fehlen verifizierte aktuelle Kurse und die vollständige DG-Confirmation. Kein FOMO.':'');
    }
    const quote=readLivePrice(options.liveQuote,now);
    return 'XAUUSD · Datenquelle: bestätigter Market Server. '+
      (isGoldStatusQuestion(question)&&quote?'Gold Livepreis: '+formatGold(quote.price)+
        ' US-Dollar je Feinunze, Tick vor '+quote.ageSeconds+' Sekunden. ':'')+
      (answer||'Der Marktserver liefert noch keine konkrete Auswertung für diese Frage.')+
      ' Prüfe Zeitstempel, Chart und eigenes Risiko vor einem Trade.';
  }

  return Object.freeze({isTradingQuestion,asksForOwnTrades,isGoldStatusQuestion,answerTrading});
});
