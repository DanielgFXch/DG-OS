/* DG OS · DG SESSION CLOCK v1
 * Always reads local device time and converts to UTC for the exact existing
 * DG strategy windows. It is a TIME CLOCK, never fabricated market data.
 * Existing H1 market brain, sweeps, risk and orders remain unchanged.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGTradingSessionClock=api;
  if(root.document)api.mount(root.document,root);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const HOUR=3600000,DAY=24*HOUR;
  const SESSIONS=Object.freeze([
    {id:'asia',name:'ASIA',start:0,end:8},
    {id:'london',name:'LONDON',start:8,end:16},
    {id:'ny',name:'NEW YORK',start:13,end:21}
  ]);
  const clampSeconds=n=>Math.max(0,Math.ceil(n/1000));
  function clockString(ms){
    const n=clampSeconds(ms);
    return [Math.floor(n/3600),Math.floor(n%3600/60),n%60]
      .map(v=>String(v).padStart(2,'0')).join(':');
  }
  function stamp(ms){
    return new Date(ms).toISOString();
  }
  function isWorkday(day){
    const week=new Date(day).getUTCDay();
    return week>=1&&week<=5;
  }
  function windowsAt(time){
    const now=time instanceof Date?time:new Date(time);
    const ms=now.getTime();
    if(!Number.isFinite(ms))return null;
    const midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    const windows=[];
    // Include previous day only to keep the function robust for future
    // cross-midnight windows. Current DG windows never cross midnight.
    for(let offset=-1;offset<=8;offset++){
      const day=midnight+offset*DAY;
      if(!isWorkday(day))continue;
      for(const session of SESSIONS){
        windows.push({...session,startMs:day+session.start*HOUR,
          endMs:day+session.end*HOUR});
      }
    }
    const active=windows.filter(s=>s.startMs<=ms&&ms<s.endMs)
      .sort((a,b)=>a.startMs-b.startMs);
    const next=windows.filter(s=>s.startMs>ms)
      .sort((a,b)=>a.startMs-b.startMs)[0]||null;
    const end=active.length?Math.min(...active.map(s=>s.endMs)):null;
    const nextActiveStart=windows.filter(s=>s.startMs>ms)
      .sort((a,b)=>a.startMs-b.startMs)[0]?.startMs??null;
    const boundaries=windows.filter(s=>s.startMs>ms||s.endMs>ms)
      .flatMap(s=>[s.startMs,s.endMs]).filter(x=>x>ms);
    const nextChange=Math.min(...boundaries);
    const weekend=[0,6].includes(now.getUTCDay());
    return {
      now:stamp(ms),
      active:active.map(s=>({...s,startAt:stamp(s.startMs),endAt:stamp(s.endMs)})),
      next:next?{...next,startAt:stamp(next.startMs),endAt:stamp(next.endMs)}:null,
      weekend,
      state:active.length>1?'overlap':active.length===1?'active':weekend?'weekend':'between',
      changeAt:Number.isFinite(nextChange)?stamp(nextChange):null,
      changeInSeconds:Number.isFinite(nextChange)?clampSeconds(nextChange-ms):null,
      changeType:active.length===1&&nextActiveStart!==null&&nextActiveStart<end?
        'OVERLAP_START':active.length>1?'OVERLAP_END':
        active.length?'SESSION_END':'NEXT_SESSION',
      untilEnd: end===null?null:clockString(end-ms),
      untilNext:next?clockString(next.startMs-ms):null
    };
  }
  const timeInZurich=ms=>new Intl.DateTimeFormat('de-CH',{
    timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(ms);
  function paint(doc,now){
    const host=doc.getElementById('dgTradingSessionClock');
    if(!host)return null;
    const data=windowsAt(now);
    if(!data)return null;
    const text=(id,value)=>{const el=doc.getElementById(id);if(el)el.textContent=value;};
    const name=data.active.length>1?
      data.active.map(s=>s.name).join(' + '):
      data.active.length?data.active[0].name:
      data.weekend?'WOCHENENDE':'SESSION-PAUSE';
    const label=data.active.length>1?'OVERLAP AKTIV':
      data.active.length?'SESSION AKTIV':
      data.weekend?'REGULÄRE SESSION-PAUSE':'NÄCHSTE SESSION';
    host.dataset.state=data.state;
    text('dgTradingSessionState',label);
    text('dgTradingSessionName',name);
    text('dgTradingSessionCounterLabel',data.changeType==='OVERLAP_START'?'OVERLAP IN':
      data.changeType==='OVERLAP_END'?'ÜBERLAPPUNG ENDET IN':
      data.changeType==='SESSION_END'?'ENDET IN':'STARTET IN');
    text('dgTradingSessionCountdown',data.active.length?
      clockString(new Date(data.changeAt).getTime()-new Date(data.now).getTime()):
      (data.untilNext||'—'));
    const nextName=data.active.length?
      (data.changeType==='OVERLAP_START'?
        'New York startet um '+timeInZurich(new Date(data.changeAt))+' Uhr CH, London bleibt aktiv.':
        data.active.length>1?
          'London und New York aktiv. London endet '+timeInZurich(new Date(data.changeAt))+' Uhr CH.':
          'Session endet '+timeInZurich(new Date(data.changeAt))+' Uhr CH.') :
      data.next?
        'Nächste: '+data.next.name+' · '+timeInZurich(new Date(data.next.startAt))+' Uhr CH.':
        'Noch keine nächste Session.';
    text('dgTradingSessionSub',nextName);
    text('dgTradingSessionLocalTime',timeInZurich(new Date(data.now))+' CH');
    for(const session of SESSIONS){
      const pill=doc.getElementById('dgTradingSessionPill'+session.id);
      if(!pill)continue;
      const active=data.active.some(a=>a.id===session.id);
      pill.dataset.active=active?'true':'false';
      pill.setAttribute('aria-label',session.name+(active?' aktiv':' momentan inaktiv'));
      const status=pill.querySelector('[data-session-status]');
      if(status)status.textContent=active?'AKTIV':'—';
    }
    return data;
  }
  function mount(doc,root){
    if(!doc.getElementById('dgTradingSessionClock'))return;
    const tick=()=>{
      if(doc.body?.dataset?.dgosRoute!=='trading')return;
      paint(doc,new Date());
    };
    tick();
    const timer=root.setInterval(tick,1000);
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)tick();});
    root.addEventListener('focus',tick);
    root.addEventListener('hashchange',tick);
    root.addEventListener('popstate',tick);
    // Retain one timer per page, no duplicated intervals on route switches.
    root.addEventListener('pagehide',()=>root.clearInterval(timer),{once:true});
  }
  return Object.freeze({SESSIONS,windowsAt,clockString,timeInZurich,paint,mount});
});
