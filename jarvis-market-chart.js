'use strict';
/* DG OS Jarvis Market Chart · authentic TwelveData candles only.
 * Native HiDPI canvas + smooth modal, no vendor API key, no chart library,
 * no synthetic candles, no entry lines or hypothetical profits.
 */
(function(root,factory){
  const engine=factory();
  if(typeof module==='object'&&module.exports)module.exports=engine;
  if(root&&root.document)root.DGOSJarvisMarketChart=engine;
})(typeof window!=='undefined'?window:globalThis,function(){
  const VALID_TF=Object.freeze({'5min':'5M','15min':'15M','1h':'1H','4h':'4H',daily:'1D'});
  const OUTPUT=['5min','15min','1h','4h','daily'];
  function shouldOpen(query){
    const q=String(query||'').toLocaleLowerCase('de').trim();
    const chart=/\b(?:chart|charts|kerzen(?:chart)?|candlestick|tradingview|goldchart|gold-chart)\b/i.test(q);
    const market=/\b(?:gold|xau(?:usd)?|markt(?:analyse)?|liquidity|liquidität|sweep|fvg|order\s*block|bias)\b/i.test(q);
    const action=/(?:öffn\w*|aufmach\w*|zeig\w*|analysier\w*|anschauen|anschau\w*|prüf\w*|check\w*|erklär\w*|wie\s+sieht|betrachte)/iu.test(q);
    const ownTrades=/\b(?:meine?\s+(?:letzten?\s+)?(?:\w+\s+){0,2}trades?|meine?\s+performance|mt5|kontoauszug|tradehistorie)\b/i.test(q);
    return !ownTrades && (chart&&(action||/\?$/.test(q)||q.startsWith('hey jarvis')) || market&&action);
  }
  function parseTime(value){
    if(typeof value!=='string')return NaN;
    const d=value.trim();
    if(!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(d))return NaN;
    const iso=d.includes(' ')?d.replace(' ','T')+'Z':d.includes('T')?d+'Z':d+'T00:00:00Z';
    return Date.parse(iso);
  }
  function normalizeCandles(payload,timeframe){
    if(!Object.hasOwn(VALID_TF,timeframe) || !payload || !['XAU/USD','XAUUSD'].includes(payload.symbol))
      return [];
    const raw=payload.candlesByTimeframe?.[timeframe]?.series;
    if(!Array.isArray(raw))return [];
    const rows=[];
    const times=new Set();
    for(const bar of raw){
      const time=parseTime(bar?.datetime);
      const open=Number(bar?.open),high=Number(bar?.high),low=Number(bar?.low),close=Number(bar?.close);
      if(!Number.isFinite(time)||times.has(time)||![open,high,low,close].every(n=>Number.isFinite(n)&&n>0)||
        high<Math.max(open,close,low)||low>Math.min(open,close,high)||high===low)continue;
      times.add(time);
      rows.push({time,open,high,low,close});
    }
    return rows.sort((a,b)=>a.time-b.time);
  }
  const fmtPrice=n=>Number.isFinite(n)?n.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const fmtTime=t=>new Intl.DateTimeFormat('de-CH',{
    timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
  }).format(new Date(t));
  const $=id=>document.getElementById(id);
  const state={timeframe:'1h',bars:[],payload:null,visible:64,offset:0,hover:-1,drag:null,
    lastLoad:0,loading:null,raf:0,renderPending:false,observing:false,active:false};
  function status(value,warn=false){
    const el=$('jmcFeedStatus');if(!el)return;
    el.textContent=value;el.dataset.warning=String(warn);
  }
  function dataLabel(){
    const at=Date.parse(state.payload?.updatedAt||'');
    if(!Number.isFinite(at))return 'KURSZEIT UNBEKANNT';
    const age=Date.now()-at;
    if(age<0)return 'ZEITSTEMPEL PRÜFEN';
    if(age>86400000)return 'HISTORISCHE DATEN';
    if(age>20*60000)return 'ZEITVERZÖGERT';
    return 'AKTUELLE DATENAUFNAHME';
  }
  function showInformation(){
    const valid=state.bars;
    const last=valid[valid.length-1];
    $('jmcCandleCount').textContent=valid.length?valid.length+' echte Kerzen':'Keine Kerzendaten';
    $('jmcDataTime').textContent=state.payload?.updatedAt?
      'TwelveData · Datenaufnahme '+fmtTime(Date.parse(state.payload.updatedAt))+' CH':'TwelveData · Datenzeit nicht verfügbar';
    $('jmcLastPrice').textContent=last?fmtPrice(last.close):'—';
    $('jmcLastPriceLabel').textContent='Letzter Kerzenschluss · '+(VALID_TF[state.timeframe]||'');
    status(dataLabel(),dataLabel()!=='AKTUELLE DATENAUFNAHME');
    for(const button of document.querySelectorAll('[data-jmc-timeframe]')){
      const selected=button.dataset.jmcTimeframe===state.timeframe;
      button.setAttribute('aria-pressed',String(selected));
    }
    if(!last){
      $('jmcOhlc').textContent='Keine echten Candles für diesen Zeitraum verfügbar.';
    }else{
      renderOHLC(last);
    }
  }
  function renderOHLC(bar){
    if(!bar){$('jmcOhlc').textContent='—';return;}
    $('jmcOhlc').textContent=fmtTime(bar.time)+' CH  ·  O '+fmtPrice(bar.open)+'   H '+fmtPrice(bar.high)+
      '   L '+fmtPrice(bar.low)+'   C '+fmtPrice(bar.close);
  }
  async function loadData(force=false){
    if(state.loading)return state.loading;
    if(!force&&state.payload&&Date.now()-state.lastLoad<60000)return state.payload;
    status('KERZENDATEN LADEN');
    const loader=async()=>{
      try{
        const response=await fetch('./data/market.json?jarvis-chart='+Date.now(),{cache:'no-store'});
        if(!response.ok)throw Error('market_feed_unavailable');
        const data=await response.json();
        if(!['XAU/USD','XAUUSD'].includes(data?.symbol)||!Number.isFinite(Date.parse(data?.updatedAt||'')))
          throw Error('market_feed_invalid');
        state.payload=data;state.lastLoad=Date.now();
        applyTimeframe(state.timeframe);
      }catch(e){
        if(!state.payload){state.bars=[];state.offset=0;}
        const message='Marktdaten derzeit nicht erreichbar. Keine Demo-Kerzen.';
        status(message,true);
        $('jmcOhlc').textContent=message;
        scheduleDraw();
      }finally{state.loading=null;}
      return state.payload;
    };
    state.loading=loader();
    return state.loading;
  }
  function applyTimeframe(timeframe){
    if(!Object.hasOwn(VALID_TF,timeframe))return false;
    state.timeframe=timeframe;
    state.bars=normalizeCandles(state.payload,timeframe);
    state.offset=0;state.hover=-1;
    state.visible=Math.min(72,Math.max(22,state.bars.length||64));
    showInformation();
    scheduleDraw();
    return true;
  }
  function scheduleDraw(){
    if(!state.active||state.renderPending)return;
    state.renderPending=true;
    state.raf=(window.requestAnimationFrame||function(cb){return setTimeout(cb,16)})(()=>{
      state.renderPending=false;draw();
    });
  }
  function draw(){
    if(!state.active)return;
    const canvas=$('jmcCanvas'),panel=$('jmcChartViewport');if(!canvas||!panel)return;
    const width=Math.max(panel.clientWidth,280),height=Math.max(panel.clientHeight,260);
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const pixelsW=Math.round(width*dpr),pixelsH=Math.round(height*dpr);
    if(canvas.width!==pixelsW||canvas.height!==pixelsH){canvas.width=pixelsW;canvas.height=pixelsH;}
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    const pad={top:22,right:76,bottom:35,left:18},plotWidth=width-pad.left-pad.right;
    const plotHeight=height-pad.top-pad.bottom;
    ctx.fillStyle='#071523';ctx.fillRect(0,0,width,height);
    ctx.font='11px -apple-system,BlinkMacSystemFont,system-ui,sans-serif';
    ctx.textBaseline='middle';
    if(!state.bars.length||plotWidth<90||plotHeight<110){
      ctx.fillStyle='#9cb3c6';ctx.textAlign='center';
      ctx.fillText('Warte auf echte XAUUSD-Kerzendaten',width/2,height/2);
      return;
    }
    const maxVisible=Math.min(state.bars.length,Math.round(state.visible));
    const end=Math.max(maxVisible,state.bars.length-Math.round(state.offset));
    const start=Math.max(0,end-maxVisible),bars=state.bars.slice(start,end);
    if(!bars.length)return;
    let hi=-Infinity,lo=Infinity;
    for(const candle of bars){hi=Math.max(hi,candle.high);lo=Math.min(lo,candle.low);}
    const range=Math.max(hi-lo,0.01),margin=range*.15;
    hi+=margin;lo-=margin;
    const yFor=value=>pad.top+(hi-value)/(hi-lo)*plotHeight;
    const xFor=index=>pad.left+plotWidth*(index+.5)/bars.length;
    ctx.save();
    ctx.strokeStyle='rgba(111,163,206,.12)';ctx.lineWidth=1;
    for(let i=0;i<=5;i++){
      const y=pad.top+(plotHeight*i/5);
      ctx.beginPath();ctx.moveTo(pad.left,y+.5);ctx.lineTo(width-pad.right,y+.5);ctx.stroke();
      const price=hi-(hi-lo)*i/5;
      ctx.textAlign='left';ctx.fillStyle='#839bb2';ctx.fillText(fmtPrice(price),width-pad.right+11,y);
    }
    for(let i=0;i<=5;i++){
      const x=pad.left+plotWidth*i/5;
      ctx.beginPath();ctx.moveTo(x+.5,pad.top);ctx.lineTo(x+.5,height-pad.bottom);ctx.stroke();
      const idx=Math.min(bars.length-1,Math.round(i/5*(bars.length-1)));
      ctx.textAlign='center';ctx.fillStyle='#819aaf';
      ctx.fillText(new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',
        day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(bars[idx].time)),
        Math.max(58,Math.min(width-110,x)),height-15);
    }
    const step=plotWidth/bars.length;
    const bodyWidth=Math.max(1.25,Math.min(13,step*.65));
    for(let i=0;i<bars.length;i++){
      const b=bars[i],x=xFor(i);
      const up=b.close>=b.open;
      const color=up?'#6ce1c7':'#ff9d99';
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,Math.min(1.7,step*.14));
      ctx.beginPath();ctx.moveTo(x,yFor(b.high));ctx.lineTo(x,yFor(b.low));ctx.stroke();
      const top=Math.min(yFor(b.open),yFor(b.close)),bottom=Math.max(yFor(b.open),yFor(b.close));
      ctx.globalAlpha=.94;ctx.fillRect(x-bodyWidth/2,top,bodyWidth,Math.max(1.3,bottom-top));ctx.globalAlpha=1;
    }
    const last=state.bars[state.bars.length-1];
    if(last.time>=bars[0].time && last.time<=bars[bars.length-1].time){
      const py=yFor(last.close);
      ctx.setLineDash([5,5]);ctx.strokeStyle='rgba(103,211,248,.63)';
      ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(width-pad.right,py);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#143c57';ctx.fillRect(width-pad.right+1,py-12,pad.right-5,24);
      ctx.fillStyle='#cff3ff';ctx.textAlign='center';ctx.font='bold 11px system-ui';
      ctx.fillText(fmtPrice(last.close),width-pad.right/2+1,py);
    }
    if(state.hover>=start && state.hover<end){
      const i=state.hover-start,bar=bars[i],x=xFor(i),y=yFor(bar.close);
      ctx.setLineDash([3,4]);ctx.lineWidth=1;ctx.strokeStyle='rgba(174,225,244,.55)';
      ctx.beginPath();ctx.moveTo(x,pad.top);ctx.lineTo(x,height-pad.bottom);
      ctx.moveTo(pad.left,y);ctx.lineTo(width-pad.right,y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#d2f5ff';ctx.beginPath();ctx.arc(x,y,3.4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function pointerIndex(clientX){
    const canvas=$('jmcCanvas'),bounds=canvas.getBoundingClientRect(),width=Math.max(280,bounds.width);
    const plot=width-94;
    const count=Math.min(state.bars.length,Math.round(state.visible));
    const end=Math.max(count,state.bars.length-Math.round(state.offset));
    const index=Math.floor((clientX-bounds.left-18)/plot*count);
    return Math.min(state.bars.length-1,Math.max(0,end-count+index));
  }
  function onPointerMove(event){
    if(state.drag){
      const step=Math.max(3,($('jmcCanvas').getBoundingClientRect().width-94)/state.visible);
      const delta=Math.round((event.clientX-state.drag.startX)/step);
      const max=Math.max(0,state.bars.length-state.visible);
      state.offset=Math.max(0,Math.min(max,state.drag.offset+delta));
    }
    state.hover=pointerIndex(event.clientX);
    renderOHLC(state.bars[state.hover]);
    scheduleDraw();
  }
  function zoom(direction){
    const next=Math.round(state.visible*(direction>0?0.8:1.25));
    state.visible=Math.max(15,Math.min(state.bars.length||150,Math.min(150,next)));
    state.offset=Math.max(0,Math.min(state.offset,Math.max(0,state.bars.length-state.visible)));
    scheduleDraw();
  }
  function setAnalysis(text){
    const host=$('jmcJarvisAnswer');
    if(host)host.textContent=String(text||'').trim()||'Frag Jarvis, was er auf dem Chart prüfen soll.';
  }
  function isOpen(){
    const d=$('jarvisMarketDialog');return Boolean(d&&(d.open||d.hasAttribute('open')));
  }
  function close(){
    const dialog=$('jarvisMarketDialog');if(!dialog)return;
    if(typeof dialog.close==='function'&&dialog.open)dialog.close();
    else dialog.removeAttribute('open');
    state.active=false;
    if(state.raf)(window.cancelAnimationFrame||clearTimeout)(state.raf);
    state.renderPending=false;
  }
  async function open(options={}){
    const dialog=$('jarvisMarketDialog');
    if(!dialog)return false;
    const query=String(options.query||'').trim();
    if(query)$('jmcQuestion').textContent=query.slice(0,300);
    if(options.answer)setAnalysis(options.answer);
    else if(query)setAnalysis('Jarvis prüft die verfügbaren Kerzendaten …');
    if(!isOpen()){
      if(typeof dialog.showModal==='function')dialog.showModal();
      else dialog.setAttribute('open','');
    }
    state.active=true;
    scheduleDraw();
    await loadData();
    scheduleDraw();
    return true;
  }
  function bind(){
    const dialog=$('jarvisMarketDialog');if(!dialog)return;
    $('jmcClose').addEventListener('click',close);
    dialog.addEventListener('close',()=>{state.active=false;state.drag=null;state.hover=-1;});
    dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
    $('jmcReload').addEventListener('click',()=>void loadData(true));
    $('jmcZoomIn').addEventListener('click',()=>zoom(1));
    $('jmcZoomOut').addEventListener('click',()=>zoom(-1));
    $('jmcFit').addEventListener('click',()=>{state.visible=Math.min(110,Math.max(15,state.bars.length));state.offset=0;scheduleDraw();});
    for(const button of document.querySelectorAll('[data-jmc-timeframe]'))
      button.addEventListener('click',()=>applyTimeframe(button.dataset.jmcTimeframe));
    const canvas=$('jmcCanvas');
    canvas.addEventListener('pointerdown',event=>{
      state.drag={startX:event.clientX,offset:state.offset};
      canvas.setPointerCapture?.(event.pointerId);onPointerMove(event);
    });
    canvas.addEventListener('pointermove',onPointerMove);
    canvas.addEventListener('pointerup',()=>{state.drag=null;});
    canvas.addEventListener('pointercancel',()=>{state.drag=null;});
    canvas.addEventListener('pointerleave',()=>{if(!state.drag){state.hover=-1;scheduleDraw();}});
    canvas.addEventListener('wheel',event=>{
      if(!isOpen())return;
      event.preventDefault();zoom(event.deltaY<0?1:-1);
    },{passive:false});
    if(typeof ResizeObserver!=='undefined'){
      const obs=new ResizeObserver(scheduleDraw);obs.observe($('jmcChartViewport'));state.observing=true;
    }
    window.addEventListener('resize',scheduleDraw);
    window.addEventListener('dgos-jarvis-final-response',event=>{
      if(isOpen()&&event.detail?.text)setAnalysis(event.detail.text);
    });
    window.addEventListener('pagehide',close);
    $('jmcCoach')?.addEventListener('click',()=>{
      const map={'5min':'m5','15min':'m15','1h':'h1','4h':'h4',daily:'d1'};
      const tf=map[state.timeframe]||'m5';
      close();
      window.DGOSTradingCoach?.open({timeframe:tf});
    });
    $('jmcReplay').addEventListener('click',()=>{
      // Reuse the existing iOS gesture-unlocked Jarvis voice path. A paid
      // response reuses the already generated blob when available.
      const replay=$('jvHeroRead')||$('jvRead');
      if(replay && typeof replay.click==='function')replay.click();
      else $('jmcVoiceStatus').textContent='Stimme nicht verfügbar. Prüfe Jarvis Voice Control.';
    });
    window.addEventListener('dgos-jarvis-voice-state',event=>{
      if(!isOpen())return;
      const state=String(event.detail?.state||'');
      const label={
        SPRICHT:'Jarvis spricht · Wiedergabe nicht unabhängig bestätigt',
        STARTET:'Stimme wird gestartet',GENERIEREN:'Audio wird erstellt',
        STARTEN:'iPhone blockiert Auto-Ton · ▶ tippen',
        FEHLER:'Sprachausgabe prüfen',STUMM:'Stimme ist ausgeschaltet',
        BEREIT:'Sprachausgabe bereit'
      };
      if(label[state])$('jmcVoiceStatus').textContent=label[state];
    });
    $('jmcBackToTrading').addEventListener('click',()=>{
      close();
      document.querySelector('.bottom-nav button[data-target="tradingWorkspace"]')?.click();
    });
    $('jmcAskAgain').addEventListener('click',()=>{
      close();
      const input=$('jarvisLifeCommandInput');
      input?.focus();
      input?.scrollIntoView?.({behavior:'smooth',block:'center'});
    });
    const launch=$('jmcOpenButton');
    launch?.addEventListener('click',()=>void open({query:'Zeig mir den Gold-Chart'}));
  }
  if(typeof document!=='undefined') {
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
    else bind();
  }
  return Object.freeze({shouldOpen,parseTime,normalizeCandles,open,close,applyTimeframe});
});
