/* DG Trading Intelligence HUD — presentation of read-only observable facts. */
(() => {
  'use strict';
  const root=document.getElementById('dgSessionIntel');
  const intelligence=window.DGSessionIntel;
  if(!root||!intelligence)return;
  const $=id=>document.getElementById(id);
  const set=(id,value)=>{const node=$(id);if(node)node.textContent=value===undefined||value===null||value===''?'—':String(value);};
  const number=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'—';
  const time=iso=>{
    if(!iso)return'—';
    const d=new Date(iso);
    if(!Number.isFinite(d.getTime()))return'—';
    return new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(d)+' CH';
  };
  const stateLabel={
    BULLISH:'BULLISH',BEARISH:'BEARISH',NEUTRAL_MIXED:'MIXED',AWAITING_DG_RULE:'AWAITING DG RULE',
    UNAVAILABLE:'KEINE DATEN',STRUCTURE_ONLY:'STRUKTUR'
  };
  const eventLabel={OPEN:'OFFEN',RETURN_INSIDE:'GENOMMEN + RÜCKKEHR',TAKEN_NO_RETURN:'GENOMMEN · KEINE RÜCKKEHR'};
  function browserCandleSource(){
    try {
      if(typeof marketServerReachable!=='undefined' && marketServerReachable &&
         typeof marketServerState!=='undefined' && marketServerState?.candles)
        return {candles:marketServerState.candles,source:'Always-On Server · abgeschlossene H1-Kerzen',brain:typeof tradingBrainState!=='undefined'?tradingBrainState:null};
    } catch {}
    try {
      if(typeof MarketBrain!=='undefined' && MarketBrain?.candles) {
        const source=MarketBrain.candles;
        const hourly=Array.isArray(source.h1)?source.h1:Array.isArray(source.h1?.series)?source.h1.series:
          Array.isArray(source['1h']?.series)?source['1h'].series:[];
        if(hourly.length)return {candles:source,source:'Letzter Markt-Snapshot · H1 (kein Live-Server)',brain:null};
      }
    }catch{}
    return null;
  }
  function sourceData(){
    const src=browserCandleSource();
    if(src){
      // Prefer the SAME module's result from the Always-On Server, if deployed.
      const precomputed=src.brain?.sessionIntelligence;
      if(precomputed?.model==='OBSERVATIONS_ONLY')return precomputed;
      return intelligence.computeSessionIntelligence({candlesByTimeframe:src.candles,brain:src.brain,source:src.source,now:new Date()});
    }
    return intelligence.computeSessionIntelligence({source:'Keine historischen H1-Kerzen verbunden',now:new Date()});
  }
  function setBias(id,detailId,payload,defaultText){
    const node=$(id);
    const b=payload||{};
    const value=stateLabel[b.state]||b.state||'KEINE DATEN';
    set(id,value);
    node.dataset.bias=b.state||'UNAVAILABLE';
    set(detailId,Array.isArray(b.reasoning)&&b.reasoning.length?b.reasoning[0]:defaultText);
  }
  function displayEvent(element,event){
    const node=$(element),value=eventLabel[event?.state]||'NICHT BERECHNET';
    set(element,value);
    if(node)node.dataset.observed=event?.state==='RETURN_INSIDE'?'return':
      event?.state==='TAKEN_NO_RETURN'?'taken':'open';
  }
  function addEvidence(host,value){
    const li=document.createElement('li');
    li.textContent=value;
    host.append(li);
  }
  function render(){
    const data=sourceData();
    const badge=$('dgIntelStatus');
    const status=data.status==='OBSERVED'?'H1 BEOBACHTET':data.status==='HISTORICAL'?'HISTORISCHE DATEN':'DATEN FEHLEN';
    badge.textContent=status;
    badge.dataset.state=data.status==='OBSERVED'?'observed':data.status==='HISTORICAL'?'historical':'wait';
    const bias=data.bias||{};
    setBias('dgIntelMacro','dgIntelMacroReason',bias.macro,'Monthly/Weekly noch nicht nach DG-Bias ausgewertet.');
    setBias('dgIntelMedium','dgIntelMediumReason',bias.medium,'Daily/4H noch nicht nach DG-Bias ausgewertet.');
    const intra=bias.intraday||{};
    const h1Text=['bullish','bearish'].includes(intra.external)?intra.external.toUpperCase():
      ['bullish','bearish'].includes(intra.internal)?intra.internal.toUpperCase():'NICHT BESTIMMT';
    set('dgIntelH1',h1Text);
    set('dgIntelH1Reason','Externe Struktur: '+(intra.external||'unklar')+' · Interne: '+(intra.internal||'unklar')+' (kein Entry-Bias)');
    set('dgIntelInducement','AWAITING DG RULE');
    set('dgIntelInducementReason',data.inducement?.reason||'Ungeprüfte interne Liquidität ist keine bestätigte Inducement.');
    const evidence=$('dgIntelEvidence');evidence.replaceChildren();
    if(!data.asiasession){
      ['dgIntelAsiaDate','dgIntelAsiaHigh','dgIntelAsiaLow','dgIntelHighSweep','dgIntelLowSweep','dgIntelLondonMeta','dgIntelNYMeta','dgIntelNYRange'].forEach(id=>set(id,'—'));
      set('dgIntelAsiaContext',data.reason||'Keine vollständige Asia-Range erkannt.');
      set('dgIntelLondonContext','Asia-Liquidität kann ohne vollständige Session-H1-Daten nicht bewertet werden.');
      set('dgIntelNYContext','Noch keine echte Session-Abfolge verfügbar.');
      addEvidence(evidence,data.reason||'Datenquelle verbinden, dann bewertet Jarvis die realen H1-Kerzen.');
    }else{
      const asia=data.asiasession,london=data.london||{},ny=data.newYork||{};
      set('dgIntelAsiaDate',asia.date+' UTC');
      set('dgIntelAsiaHigh',number(asia.high));
      set('dgIntelAsiaLow',number(asia.low));
      set('dgIntelAsiaContext','Range '+number(asia.range)+' USD · '+asia.candles+' abgeschlossene H1-Kerzen (00:00–08:00 UTC).');
      set('dgIntelLondonMeta',(london.observedCandles||0)+'/8 H1');
      displayEvent('dgIntelHighSweep',london.asiaHigh);
      displayEvent('dgIntelLowSweep',london.asiaLow);
      set('dgIntelLondonContext',london.note);
      set('dgIntelNYMeta',(ny.observedCandles||0)+'/8 H1');
      set('dgIntelNYContext',ny.context);
      set('dgIntelNYRange',ny.range?'NY High '+number(ny.range.high)+' · Low '+number(ny.range.low)+(ny.complete?'':' · vorläufig'):'NY High/Low: noch keine geschlossenen H1-Kerzen.');
      const h=london.asiaHigh||{},lo=london.asiaLow||{};
      addEvidence(evidence,'Asia-Range vollständig am '+asia.date+' (UTC).');
      for(const [label,sweep] of [['Asia High',h],['Asia Low',lo]]){
        if(!sweep.at){addEvidence(evidence,label+': nach vorliegenden London-H1-Kerzen offen.');continue;}
        addEvidence(evidence,label+' bei '+time(sweep.at)+' überschritten (Extrem '+number(sweep.extreme)+').');
        addEvidence(evidence,sweep.returnedAt?'Rückkehr innerhalb der Range: H1-Schlusskurs '+time(sweep.returnedAt)+'.':'Keine bestätigte Rückkehr auf H1 in den bisher verfügbaren Kerzen.');
      }
      if(london.sequence==='UNKNOWN_SAME_H1_CANDLE')
        addEvidence(evidence,'Reihenfolge Asia High / Low innerhalb derselben H1-Kerze unklar; keine intrabar Annahme.');
      if(data.freshness?.stale)addEvidence(evidence,'Historische Momentaufnahme: '+(data.freshness.hoursSinceLastClosed||0)+' Stunden seit letzter H1-Schlusskerze.');
    }
    const date=data.sessionDate?'Beobachteter Handelstag '+data.sessionDate+' UTC · ':'';
    set('dgIntelProvenance',date+(data.source||'H1')+' · zuletzt geprüft '+time(data.asOf)+'. Beobachtung ≠ Buy/Sell.');
  }
  $('dgIntelRefresh').addEventListener('click',render);
  let lastRefresh=0;
  const scheduled=()=>{
    if(document.hidden || document.body.dataset.dgosRoute!=='trading')return;
    if(Date.now()-lastRefresh>=15000){lastRefresh=Date.now();render();}
  };
  window.addEventListener('focus',render);
  document.addEventListener('visibilitychange',scheduled);
  window.addEventListener('hashchange',scheduled);
  setInterval(scheduled,15000);
  render();
})();
