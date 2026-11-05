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
  function answerTrading(question,options={}){
    if(asksForOwnTrades(question)){
      return 'Ich kann deine persönlichen Trades noch nicht direkt aus MT5 oder deinem Broker auslesen. '+
        'Für eine seriöse Auswertung deiner letzten Trades brauche ich echte Ein- und Ausstiege, '+
        'Stop-Loss, Gebühren und Ergebnisse, etwa aus einem MT5-Export. '+
        'Ohne diese Daten erfinde ich keine Trefferquote oder Performance.';
    }
    const now=options.now instanceof Date?options.now:new Date();
    const live=options.liveBrain?.report&&options.liveBrain?.decision?options.liveBrain:null;
    const snapshot=options.historicalSnapshot;
    const at=new Date(snapshot?.updatedAt||'');
    const age=now.getTime()-at.getTime();
    const historical=!live && snapshot?.mode==='PERIODIC_READ_ONLY' &&
      snapshot?.symbol==='XAUUSD' && snapshot?.brain?.report &&
      snapshot?.brain?.decision && Number.isFinite(age) && age>=0 && age<14*86400000;
    const brain=live||(historical?snapshot.brain:null);
    if(!brain)return 'Ich kann Gold gerade nicht zuverlässig analysieren: Es sind keine gültigen Trading-Brain-Daten verfügbar. '+
      'Die Session-Uhr ist kein Kursfeed und ich gebe ohne belegte Kerzen keine Buy- oder Sell-Empfehlung.';
    const answer=typeof options.answerMarketQuestion==='function'
      ?String(options.answerMarketQuestion(question,brain,now)||'').trim():'';
    // Never present scheduled data as live, or show historical BUY/SELL approval.
    if(historical){
      const prefix='XAUUSD · Historische Marktaufnahme vom '+formatDate(at)+'. '+
        'Das ist KEIN Live-Chart und keine gültige aktuelle Entry-Bestätigung. ';
      const text=answer.replace(/\b(?:BUY_READY|SELL_READY|BUY CONFIRMATION|SELL CONFIRMATION)\b/gi,'DATA_NOT_READY');
      return prefix+(text||'Für diese Frage liegt noch keine belegte Auswertung vor.');
    }
    return 'XAUUSD · Datenquelle: verbundener Market Server. '+
      (answer||'Der Marktserver liefert noch keine konkrete Auswertung für diese Frage.')+
      ' Prüfe Zeitstempel, Chart und eigenes Risiko vor einem Trade.';
  }
  return Object.freeze({isTradingQuestion,asksForOwnTrades,answerTrading});
});
