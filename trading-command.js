/* DG OS v0.57.0 — Trading Session Command Center
   Presentation layer only. Reads existing real Market/Trading Brain state and
   never creates market facts, entry rules, targets or probabilities. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const root = $('tradingCommandCenter');
  if (!root) return;

  const STATUS_STAGE = {
    WAIT:'WAIT',
    DATA_NOT_READY:'WAIT',
    MISSED:'WAIT',
    WATCH_BUY:'WATCH',
    WATCH_SELL:'WATCH',
    BUY_CONFIRMATION:'WATCH',
    SELL_CONFIRMATION:'WATCH',
    BUY_READY:'READY',
    SELL_READY:'READY'
  };
  const STATUS_DIRECTION = {
    WATCH_BUY:'BUY', BUY_CONFIRMATION:'BUY', BUY_READY:'BUY',
    WATCH_SELL:'SELL', SELL_CONFIRMATION:'SELL', SELL_READY:'SELL'
  };
  const STATUS_CLASS = {
    WAIT:'is-wait', DATA_NOT_READY:'is-wait', MISSED:'is-wait',
    WATCH_BUY:'is-watch', WATCH_SELL:'is-watch',
    BUY_CONFIRMATION:'is-watch', SELL_CONFIRMATION:'is-watch',
    BUY_READY:'is-ready-buy', SELL_READY:'is-ready-sell'
  };
  const LIQ_LABEL = {
    active:'OPEN',
    approaching:'APPROACHING',
    touched:'TOUCHED',
    sweeped:'SWEPT',
    invalid:'—'
  };
  const BIAS_LABEL = {
    BULLISH:'BULLISH',
    BEARISH:'BEARISH',
    NEUTRAL_MIXED:'NEUTRAL',
    AWAITING_DG_RULE:'—'
  };
  const SESSION_LABEL = {asia:'Asia',london:'London',ny:'New York'};
  const POI_LABEL = {fvg:'FVG',orderBlock:'Order Block',ifvg:'iFVG',breaker:'Breaker'};

  function text(id, value) {
    const el = $(id);
    if (el) el.textContent = value == null || value === '' ? '—' : String(value);
  }

  function fmt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    try {
      if (typeof fmtPrice === 'function') return fmtPrice(value);
    } catch (_) {}
    return value.toFixed(2);
  }

  function sessionsDef() {
    try {
      if (typeof SESSIONS !== 'undefined' && Array.isArray(SESSIONS)) return SESSIONS;
    } catch (_) {}
    return [
      {id:'asia',name:'Asia',startHour:0,endHour:8},
      {id:'london',name:'London',startHour:8,endHour:16},
      {id:'ny',name:'New York',startHour:13,endHour:21}
    ];
  }

  function windowFor(session, now) {
    try {
      if (typeof sessionWindowToday === 'function') return sessionWindowToday(session, now);
    } catch (_) {}
    const y=now.getUTCFullYear(),m=now.getUTCMonth(),d=now.getUTCDate();
    return {
      start:new Date(Date.UTC(y,m,d,session.startHour,0,0)),
      end:new Date(Date.UTC(y,m,d,session.endHour,0,0))
    };
  }

  function currentSession(now) {
    const defs=sessionsDef();
    const active=defs
      .map(session=>({session,...windowFor(session,now)}))
      .filter(item=>now>=item.start&&now<item.end)
      .sort((a,b)=>b.start-a.start);
    if(active.length) return {session:active[0].session,state:'active'};

    const upcoming=defs
      .map(session=>({session,...windowFor(session,now)}))
      .filter(item=>item.start>now)
      .sort((a,b)=>a.start-b.start);
    if(upcoming.length) return {session:upcoming[0].session,state:'upcoming'};

    return {session:defs[0],state:'upcoming-next-day'};
  }

  function brainState() {
    try { return typeof tradingBrainState !== 'undefined' ? tradingBrainState : null; }
    catch (_) { return null; }
  }

  function serverIsReachable() {
    try { return Boolean(typeof marketServerReachable !== 'undefined' && marketServerReachable); }
    catch (_) { return false; }
  }

  function sessionData() {
    try {
      if (typeof currentSessionZoneData === 'function') return currentSessionZoneData();
    } catch (_) {}
    return null;
  }

  function liquidityData() {
    try {
      if (typeof currentSessionZoneLiquidity === 'function') return currentSessionZoneLiquidity() || [];
    } catch (_) {}
    return [];
  }

  function currentPrice() {
    try {
      if (typeof currentSessionZonePrice === 'function') return currentSessionZonePrice();
    } catch (_) {}
    return null;
  }

  function decisionFrom(brain) {
    if (!brain) return null;
    return brain.decision || brain.entry || (brain.report && brain.report.entry) || null;
  }

  function reportFrom(brain) {
    return brain && brain.report ? brain.report : null;
  }

  function biasFrom(brain) {
    if (!brain) return null;
    const report=reportFrom(brain);
    const htf=(report && report.htfBias) || brain.htfContext || {};
    return (htf.trading && htf.trading.state) || htf.overallBias || htf.bias || null;
  }

  function relevantSessionIds(id) {
    if (id === 'ny') return ['asia','london','ny'];
    if (id === 'london') return ['asia','london'];
    return ['asia'];
  }

  function liquidityForLevel(liquidity, id) {
    return (liquidity || []).find(item=>item && item.id===id) || null;
  }

  function buildSessionLevels(sessionCtx) {
    const host=$('tradingSessionLevels');
    if (!host) return;
    host.replaceChildren();

    const sessions=sessionData();
    const liquidity=liquidityData();
    const ids=relevantSessionIds(sessionCtx.session.id);
    let rendered=0;

    ids.forEach(id=>{
      const session=(sessions && sessions[id]) || null;
      if (!session || typeof session.high!=='number' || typeof session.low!=='number') return;

      [['High','High',session.high],['Low','Low',session.low]].forEach(([label,suffix,price])=>{
        const liq=liquidityForLevel(liquidity,id+suffix);
        const row=document.createElement('div');
        row.className='trading-session-level';
        if (liq && liq.status) row.dataset.state=liq.status;

        const left=document.createElement('div');
        const sessionLabel=document.createElement('span');
        sessionLabel.textContent=(SESSION_LABEL[id]||id)+' '+label;
        const state=document.createElement('small');
        state.textContent=liq && liq.status ? (LIQ_LABEL[liq.status]||liq.status.toUpperCase()) : '—';
        left.append(sessionLabel,state);

        const strong=document.createElement('strong');
        strong.textContent=fmt(price);
        row.append(left,strong);
        host.append(row);
        rendered+=1;
      });
    });

    if (!rendered) {
      const empty=document.createElement('div');
      empty.className='trading-empty';
      empty.textContent='Noch keine echten Session-Level verfügbar.';
      host.append(empty);
    }
  }

  function buildRelevantZones(brain) {
    const host=$('tradingRelevantZones');
    if (!host) return;
    host.replaceChildren();

    const report=reportFrom(brain);
    if (!report) {
      const empty=document.createElement('div');
      empty.className='trading-empty';
      empty.textContent='Trading Brain nicht verbunden – keine Zonenbewertung.';
      host.append(empty);
      return;
    }

    const bullish=(report.freshBullishPOIs||[]).slice(0,2).map(p=>({...p,side:'BUY'}));
    const bearish=(report.freshBearishPOIs||[]).slice(0,2).map(p=>({...p,side:'SELL'}));
    const items=[...bearish,...bullish].slice(0,4);

    if(!items.length){
      const empty=document.createElement('div');
      empty.className='trading-empty';
      empty.textContent='Aktuell keine relevanten frischen DG-Zonen.';
      host.append(empty);
      return;
    }

    items.forEach(poi=>{
      const row=document.createElement('div');
      row.className='trading-zone-row '+(poi.side==='BUY'?'is-buy':'is-sell');

      const left=document.createElement('div');
      const side=document.createElement('span');
      side.textContent=poi.side+' · '+(POI_LABEL[poi.type]||poi.type||'POI');
      const meta=document.createElement('small');
      meta.textContent=[poi.timeframe,poi.quality?String(poi.quality).toUpperCase():null].filter(Boolean).join(' · ');
      left.append(side,meta);

      const strong=document.createElement('strong');
      strong.textContent=poi.range || (
        typeof poi.priceLow==='number' && typeof poi.priceHigh==='number'
          ? fmt(poi.priceLow)+' – '+fmt(poi.priceHigh)
          : '—'
      );
      row.append(left,strong);
      host.append(row);
    });
  }

  function buildLiquidityRead(sessionCtx) {
    const liquidity=liquidityData();
    const relevantIds=new Set(relevantSessionIds(sessionCtx.session.id));
    const sessionItems=(liquidity||[]).filter(item=>{
      if(!item||!item.id) return false;
      return [...relevantIds].some(id=>item.id===id+'High'||item.id===id+'Low');
    });
    const swept=sessionItems.filter(item=>item.status==='sweeped');
    const touched=sessionItems.filter(item=>item.status==='touched');

    text('tradingLiquidityState', swept.length ? swept.length+' SWEPT' : touched.length ? touched.length+' TOUCHED' : 'NO SWEEP');
    text('tradingLiquidityDetail',
      swept.length
        ? swept.map(item=>item.label||item.id).slice(0,2).join(' · ')
        : touched.length
          ? touched.map(item=>item.label||item.id).slice(0,2).join(' · ')
          : 'Noch keine relevante Session-Liquidity geholt.'
    );
    text('tradingSweptSummary',
      swept.length
        ? swept.map(item=>(item.label||item.id)+' ✓').slice(0,3).join(' · ')
        : 'Noch keine'
    );
    return {swept,touched};
  }

  function waitingLabel(decision) {
    if (!decision) return {title:'BRAIN DATA',detail:'Trading Brain ist nicht verbunden.'};
    const status=decision.status||'WAIT';
    if(status==='BUY_READY'||status==='SELL_READY') return {title:'SETUP READY',detail:'DG-Regelkette ist vollständig. Keine automatische Order.'};
    if(status==='BUY_CONFIRMATION'||status==='SELL_CONFIRMATION') return {title:'15M CONFIRM',detail:(decision.reasons&&decision.reasons[0])||'Confirmation ausstehend.'};
    if(status==='WATCH_BUY'||status==='WATCH_SELL') return {title:'REACTION',detail:(decision.reasons&&decision.reasons[0])||'Reaktion am POI ausstehend.'};
    if(status==='DATA_NOT_READY') return {title:'MARKTDATEN',detail:(decision.reasons&&decision.reasons[0])||'Erforderliche Daten fehlen.'};
    if(status==='MISSED') return {title:'NEUES SETUP',detail:(decision.reasons&&decision.reasons[0])||'Setup verpasst – nicht hinterherjagen.'};
    return {
      title:'LIQ / POI',
      detail:(decision.missingRequirements&&decision.missingRequirements[0]) ||
        (decision.reasons&&decision.reasons[0]) ||
        'Noch keine vollständige Setup-Kette.'
    };
  }

  function primaryTarget(brain, decision) {
    if(!brain||!decision) return null;
    const report=reportFrom(brain);
    const targets=brain.targets || (report&&report.targets) || decision.targets || [];
    const direction=decision.direction==='bullish'||STATUS_DIRECTION[decision.status]==='BUY'?'up':
      decision.direction==='bearish'||STATUS_DIRECTION[decision.status]==='SELL'?'down':null;
    if(!direction) return null;
    return targets.find(t=>t&&t.direction===direction&&t.priority==='PRIMARY') ||
      targets.find(t=>t&&t.direction===direction) || null;
  }

  function render() {
    const now=new Date();
    const ctx=currentSession(now);
    const brain=brainState();
    const decision=decisionFrom(brain);
    const bias=biasFrom(brain);
    const report=reportFrom(brain);
    const realBrain=Boolean(serverIsReachable() && brain && report);

    text('tradingActiveSession',
      (SESSION_LABEL[ctx.session.id]||ctx.session.name||ctx.session.id).toUpperCase()+
      ' SESSION · '+(ctx.state==='active'?'AKTIV':'NÄCHSTE')
    );
    text('tradingZoneSession',(SESSION_LABEL[ctx.session.id]||ctx.session.name||'AUTO').toUpperCase());

    const dataState=$('tradingCommandDataState');
    if(dataState){
      dataState.classList.toggle('is-live',realBrain);
      dataState.classList.toggle('is-offline',!realBrain);
      const span=dataState.querySelector('span');
      if(span) span.textContent=realBrain?'TRADING BRAIN LIVE':'BRAIN OFFLINE';
    }

    const status=decision&&decision.status?decision.status:'WAIT';
    const stage=STATUS_STAGE[status]||'WAIT';
    const direction=STATUS_DIRECTION[status] || (
      decision&&decision.direction==='bullish'?'BUY':
      decision&&decision.direction==='bearish'?'SELL':'Kein Entry'
    );

    text('tradingDecisionStage',stage);
    text('tradingDecisionDirection',direction);
    const badge=$('tradingDecisionBadge');
    if(badge){
      badge.className='trading-decision-badge '+(STATUS_CLASS[status]||'is-wait');
    }

    const biasText=BIAS_LABEL[bias]||bias||'—';
    text('tradingBiasNow',biasText);
    text('tradingBiasContext',
      realBrain
        ? ((report.htfBias&&report.htfBias.trading&&report.htfBias.trading.reasoning) ||
           (report.htfBias&&report.htfBias.reasoning&&report.htfBias.reasoning[0]) ||
           'Daily / 4H Kontext aus dem DG Trading Brain.')
        : 'Keine Richtung ohne echte Trading-Brain-Daten.'
    );

    const liquidityRead=buildLiquidityRead(ctx);
    buildSessionLevels(ctx);
    buildRelevantZones(brain);

    const waiting=waitingLabel(decision);
    text('tradingWaitingFor',waiting.title);
    text('tradingWaitingDetail',waiting.detail);

    let scenarioTitle='Noch kein valides Szenario';
    let scenarioText='Trading Brain ist nicht verbunden. Jarvis zeigt keine Richtung aus Simulation oder erfundenen Daten.';
    if(realBrain && decision){
      const side=STATUS_DIRECTION[status] || (decision.direction==='bullish'?'BUY':decision.direction==='bearish'?'SELL':null);
      if(side==='BUY') scenarioTitle=stage==='READY'?'BUY READY · bullishes Szenario':'Bullishes Szenario im Fokus';
      else if(side==='SELL') scenarioTitle=stage==='READY'?'SELL READY · bearishes Szenario':'Bearishes Szenario im Fokus';
      else if(bias==='BULLISH') scenarioTitle='Bullisher Kontext · noch WAIT';
      else if(bias==='BEARISH') scenarioTitle='Bearisher Kontext · noch WAIT';
      else scenarioTitle='Kein klarer Pfad · WAIT';

      scenarioText=(decision.reasons&&decision.reasons[0]) ||
        (report.summary ? String(report.summary).split('\n').find(line=>/Entry Status:/i.test(line)) : '') ||
        'Noch keine vollständige DG-Setup-Kette.';
    }
    text('tradingScenarioTitle',scenarioTitle);
    text('tradingScenarioText',scenarioText);

    const target=primaryTarget(brain,decision);
    text('tradingPrimaryTarget',target ? fmt(target.price)+(target.reason?' · '+target.reason:'') : '—');

    const sessionName=SESSION_LABEL[ctx.session.id]||ctx.session.name||'Session';
    let summary=sessionName+(ctx.state==='active'?' ist aktiv. ':' ist als Nächstes relevant. ');
    if(realBrain){
      summary+=stage+' · '+biasText+'. ';
      summary+=liquidityRead.swept.length
        ? liquidityRead.swept.length+' relevante Session-Liquidity-Level wurden gesweept.'
        : 'Noch kein relevanter Session-Sweep.';
    }else{
      summary+='Session-Level können angezeigt werden; ohne echten Trading Brain gibt Jarvis bewusst kein Richtungsszenario aus.';
    }
    text('tradingSessionSummary',summary);
  }

  $('tradingBackPersonal')?.addEventListener('click',()=>{
    const home=document.querySelector('.bottom-nav button[data-target="personalHome"]');
    if(home) home.click();
    else {
      history.pushState({dgosRoute:'home'},'',location.pathname+location.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  const oldRouteBar=$('dgosRouteBar');
  function routeChanged(){
    if(document.body.dataset.dgosRoute==='trading') render();
  }

  window.addEventListener('hashchange',routeChanged);
  window.addEventListener('popstate',routeChanged);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
  window.addEventListener('focus',render);

  // Existing trading data can update every 3s from the real Always-On server.
  // This display polls the already-computed state only; it never recomputes rules.
  setInterval(render,3000);
  render();
})();
