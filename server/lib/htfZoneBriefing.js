'use strict';

// DG Jarvis HTF Zone Intelligence: transport/formatting only.
// Reuses the already-scored real DG Trading Brain report; NO new trading
// rules, POI detectors, backtested probabilities or automatic orders.
// Default times are proposals, not market-session facts. All times Europe/Zurich.
const ZONE_TYPES = Object.freeze({fvg:'FVG',orderBlock:'Order Block'});
const ALLOWED_TF = new Set(['H1','4H','Daily']);
const GRACE_MINUTES = 20;
const ZURICH = 'Europe/Zurich';

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB',{
    timeZone: ZURICH, year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function validTime(time) {
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||'')) throw new Error('Invalid Europe/Zurich briefing time');
  const [h,m]=time.split(':').map(Number);
  return h*60+m;
}
function nextBriefing(now, sentKeys, options={}) {
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf())) return null;
  const p=localParts(now);
  if(p.weekday==='Sat'||p.weekday==='Sun') return null;
  const nowMinute=Number(p.hour)*60+Number(p.minute);
  const day=`${p.year}-${p.month}-${p.day}`;
  const keys=new Set(sentKeys||[]);
  const slots=[
    {id:'london',label:'LONDON',time:options.londonTime||'08:50'},
    {id:'new-york',label:'NEW YORK',time:options.newYorkTime||'13:50'}
  ];
  for(const slot of slots) {
    const minute=validTime(slot.time);
    const key=`htf-${day}-${slot.id}`;
    if(nowMinute>=minute&&nowMinute<minute+GRACE_MINUTES&&!keys.has(key)){
      return {...slot,key};
    }
  }
  return null;
}

function parseRange(raw) {
  if(typeof raw!=='string') return null;
  const match=raw.trim().match(/^(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)$/);
  if(!match) return null;
  const low=Number(match[1]), high=Number(match[2]);
  return Number.isFinite(low)&&Number.isFinite(high)&&low>0&&high>low
    ? {low,high,text:`${low.toFixed(2)} – ${high.toFixed(2)}`} : null;
}
function overlapping(a,b) {return a.low<=b.high&&b.low<=a.high;}
function collectZones(report,side,max=2) {
  const source=side==='buy'?report&&report.freshBullishPOIs:report&&report.freshBearishPOIs;
  const options=(Array.isArray(source)?source:[]).flatMap((p,i)=>{
    if(!p||p.status!=='fresh'||!ALLOWED_TF.has(p.timeframe)||!ZONE_TYPES[p.type]||
       (p.quality!=='high'&&p.quality!=='medium')) return [];
    const range=parseRange(p.range);
    return range?[{...p,rangeData:range,order:i}]:[];
  });
  const candidates=options.map(p=>{
    const overlappingTFs=[...new Set(options.filter(other=>
      other!==p&&other.timeframe!==p.timeframe&&overlapping(p.rangeData,other.rangeData)
    ).map(other=>other.timeframe==='H1'?'1H':other.timeframe))];
    return {...p,overlappingTFs};
  });
  candidates.sort((a,b)=>
    Number(b.overlappingTFs.length>0)-Number(a.overlappingTFs.length>0) ||
    Number(b.quality==='high')-Number(a.quality==='high') ||
    (typeof b.score==='number'?b.score:-1)-(typeof a.score==='number'?a.score:-1) ||
    a.order-b.order
  );
  return candidates.slice(0,max);
}
function zoneText(p, side) {
  const label=side==='buy'?'🟢 BUY ZONE':'🔴 SELL ZONE';
  const tf=p.timeframe==='H1'?'1H':p.timeframe;
  const direction=side==='buy'?'Bullish':'Bearish';
  const quality=p.quality==='high'?'HIGH':'MEDIUM';
  const lines=[
    `${label}: ${p.rangeData.text}`,
    `${tf} ${direction} ${ZONE_TYPES[p.type]} | DG Quality: ${quality}`,
    'Status: FRISCH / noch nicht als abgeholt markiert'
  ];
  if(p.overlappingTFs.length) lines.push(`HTF-Überschneidung: ${p.overlappingTFs.join(', ')}`);
  const reasons=(Array.isArray(p.reasons)?p.reasons:[]).filter(r=>typeof r==='string'&&r.startsWith('✓')).slice(0,3);
  if(reasons.length) lines.push('Warum: '+reasons.map(r=>r.replace(/^✓\s*/, '')).join('; '));
  return lines.join('\n');
}
function buildHTFZoneBriefing(slot,brain,options={}) {
  if(!slot||!brain||!brain.report) return null;
  const sell=collectZones(brain.report,'sell');
  const buy=collectZones(brain.report,'buy');
  const now=options.now instanceof Date?options.now:new Date();
  const p=localParts(now);
  const lines=[`🧠 DG JARVIS | ${slot.label} HTF ANALYSIS`,
    'XAUUSD • 1H / 4H / Daily','',
    `Zeit: ${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute} (Europe/Zurich)`];
  if(typeof options.price==='number'&&Number.isFinite(options.price)&&options.price>0){
    lines.push(`Kurs bei Analyse: ${options.price.toFixed(2)}`);
  } else {
    lines.push('Aktueller Kurs: nicht zuverlässig verfügbar');
  }
  lines.push('');
  if(!sell.length&&!buy.length) {
    lines.push('Keine frischen HTF-FVG-/Order-Block-Zonen mit DG-Qualität HIGH/MEDIUM erkannt. Keine Zone erfinden.');
  } else {
    if(sell.length) {sell.forEach(z=>lines.push(zoneText(z,'sell'),''));}
    else lines.push('🔴 SELL ZONE: keine qualifizierte frische HTF-Zone','');
    if(buy.length) {buy.forEach(z=>lines.push(zoneText(z,'buy'),''));}
    else lines.push('🟢 BUY ZONE: keine qualifizierte frische HTF-Zone','');
  }
  lines.push('JARVIS: HTF-Zonen zur Beobachtung – kein automatisches BUY-/SELL-Signal.',
    'Ein POI-Touch allein ist KEIN Entry. DG Confirmation/Entry-Regeln separat prüfen.');
  return lines.join('\n').trim();
}

// Only publish when the existing HTF feeds have been received recently.
// A connected quote without fresh candles is insufficient evidence for a zone.
function isHTFDataReady(marketState,now=new Date()) {
  if(!marketState||typeof marketState.getHealth!=='function') return false;
  const health=marketState.getHealth();
  if(!health.htfReady) return false;
  const ageLimit={weekly:10*24*60*60*1000,daily:5*24*60*60*1000,
    '4h':12*60*60*1000,'1h':3*60*60*1000};
  for(const [tf,maxAge] of Object.entries(ageLimit)) {
    const input=marketState.candlesByTimeframe&&marketState.candlesByTimeframe[tf];
    if(!input||!Array.isArray(input.series)||input.series.length<3) return false;
    const updated=marketState.lastCandleUpdateAt&&marketState.lastCandleUpdateAt[tf];
    const age=updated?now.getTime()-new Date(updated).getTime():Infinity;
    if(!Number.isFinite(age)||age<0||age>maxAge) return false;
  }
  return true;
}
function freshPrice(marketState,now=new Date()) {
  const price=marketState&&marketState.quote&&marketState.quote.price;
  const at=marketState&&marketState.lastPriceUpdateAt;
  if(typeof price!=='number'||!Number.isFinite(price)||price<=0||!at) return null;
  const age=now-new Date(at);
  return age>=0&&age<=5*60*1000?price:null;
}

module.exports={nextBriefing,buildHTFZoneBriefing,collectZones,parseRange,isHTFDataReady,freshPrice};
