/* DG OS Sleep Intelligence — WHOOP is queried only with an existing authenticated session. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document){root.DGSleepInsights=api;api.mount(root.document,root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop';
  const ZONE='Europe/Zurich';
  const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  const mean=xs=>{const a=xs.map(number).filter(v=>v!==null);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
  const mins=h=>number(h)===null?null:Math.round(number(h)*60);
  const duration=value=>{const m=number(value);if(m===null)return '—';const n=Math.max(0,Math.round(m));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m';};
  const dateFormat=(value,opts)=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('de-CH',{timeZone:ZONE,...opts}).format(d):'—';};
  const time=value=>dateFormat(value,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const label=value=>dateFormat(value,{weekday:'short',day:'2-digit',month:'2-digit'});
  const delta=(value,prior,unit,up=true)=>{
    const a=number(value),b=number(prior);if(a===null||b===null)return 'Noch kein Vergleich';
    const diff=Math.round(a-b);if(!diff)return 'Unverändert zur letzten Nacht';
    return (diff>0?'+':'−')+Math.abs(diff)+' '+unit+' zur letzten Nacht · '+((diff>0)===up?'besser':'weniger günstig');
  };
  function summary(rows){
    const nights=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.start&&x.end&&number(x.durationHours)!==null).sort((a,b)=>new Date(b.end)-new Date(a.end));
    const latest=nights[0]||null,prev=nights[1]||null;
    const current=nights.slice(0,7),previous=nights.slice(7,14);
    return {nights,latest,prev,week:mean(current.map(x=>mins(x.durationHours))),older:mean(previous.map(x=>mins(x.durationHours))),
      perf:mean(current.map(x=>x.performance)),hrv:mean(current.map(x=>x.hrvMs)),rhr:mean(current.map(x=>x.restingHeartRate))};
  }
  function insights(s){
    const a=s.latest,b=s.prev;
    if(!a)return ['Noch keine bewertete Hauptschlafphase vorhanden.'];
    const out=[];
    if(b){const d=mins(a.durationHours)-mins(b.durationHours);out.push('Schlafdauer: '+Math.abs(d)+' Minuten '+(d>0?'länger':d<0?'kürzer':'gleich lang')+' als in der vorherigen Nacht.');}
    if(b&&number(a.performance)!==null&&number(b.performance)!==null)out.push('Schlafleistung: '+Math.round(a.performance)+' % statt '+Math.round(b.performance)+' %.');
    if(s.week!==null&&s.older!==null)out.push('Ø der letzten 7 Nächte: '+duration(s.week)+' ('+(s.week>=s.older?'+':'−')+Math.abs(Math.round(s.week-s.older))+' Min. zur Vorwoche).');
    if(b&&number(a.hrvMs)!==null&&number(b.hrvMs)!==null)out.push('HRV: '+Math.round(a.hrvMs)+' ms statt '+Math.round(b.hrvMs)+' ms. Einzelne Schwankungen sind nicht automatisch besser oder schlechter.');
    out.push('Der WHOOP-Schlafbeginn zeigt die geschätzte Uhrzeit, nicht die Dauer bis zum Einschlafen. Dafür brauchen wir deine Bettgehzeit.');
    return out;
  }
  function mount(doc,win){
    const box=doc.getElementById('sleepIntelligence');if(!box)return;
    const el=id=>doc.getElementById(id),set=(id,text)=>{const e=el(id);if(e)e.textContent=text;};
    let lastDays=30,loadedAt=0,loading=false;
    const hide=()=>{box.hidden=true;set('sleepIntelligenceState','Verbinde WHOOP, um den Verlauf zu sehen.');};
    function stageBar(a){
      const host=el('sleepStageMix');if(!host)return;host.replaceChildren();
      const values=[['Light','Leichtschlaf',mins(a.lightHours)],['Deep','Tiefschlaf',mins(a.deepHours)],['Rem','REM',mins(a.remHours)],['Awake','Wachzeit',mins(a.awakeHours)]];
      const total=values.reduce((v,x)=>v+(x[2]||0),0);
      for(const [id,name,n] of values){
        set('sleepStage'+id,name+': '+duration(n));if(!total||n===null||n<=0)continue;
        const e=doc.createElement('div');e.className='dgos-sleep-stage '+id.toLowerCase();
        e.style.width=100*n/total+'%';e.title=name+': '+duration(n);e.setAttribute('aria-label',e.title);host.append(e);
      }
    }
    function bars(nights,metric,element){
      const host=el(element);if(!host)return;host.replaceChildren();
      const rows=nights.slice(0,Math.min(lastDays,30)).reverse();
      const values=rows.map(x=>metric==='durationHours'?mins(x.durationHours):number(x.hrvMs));
      const max=Math.max(1,...values.filter(x=>x!==null));
      rows.forEach((row,i)=>{
        const n=values[i];const b=doc.createElement('div');b.className='dgos-sleep-bar'+(n===null?' is-missing':'');
        b.style.setProperty('--bar-height',Math.max(3,100*(n||0)/max)+'%');
        const text=label(row.end)+': '+(n===null?'kein Wert':metric==='durationHours'?duration(n):Math.round(n)+' ms');
        b.title=text;b.setAttribute('role','img');b.setAttribute('aria-label',text);host.append(b);
      });
    }
    function render(payload){
      const s=summary(payload.nights),a=s.latest,b=s.prev;
      if(!a){box.hidden=false;set('sleepIntelligenceState','Noch keine vollständigen Schlafdaten verfügbar.');return;}
      box.hidden=false;set('sleepIntelligenceState',s.nights.length+' Nächte · WHOOP · Datenstand '+label(a.end));
      set('sleepNightLabel','Letzte Nacht · '+label(a.end));
      set('sleepDuration',duration(mins(a.durationHours)));set('sleepDurationDelta',delta(mins(a.durationHours),b?mins(b.durationHours):null,'Min.'));
      set('sleepPerformance',number(a.performance)===null?'—':Math.round(a.performance)+' %');set('sleepPerformanceDelta',delta(a.performance,b?.performance,'Pkt.'));
      set('sleepEfficiency',number(a.efficiency)===null?'—':Math.round(a.efficiency)+' %');set('sleepEfficiencyDelta',delta(a.efficiency,b?.efficiency,'Pkt.'));
      set('sleepRecovery',number(a.recovery)===null?'—':Math.round(a.recovery)+' %');set('sleepRecoveryDelta',delta(a.recovery,b?.recovery,'Pkt.'));
      set('sleepBedtime',time(a.start));set('sleepWake',time(a.end));
      set('sleepNeed',duration(mins(a.neededHours)));set('sleepAwake',duration(mins(a.awakeHours)));
      set('sleepWeeklyAvg',duration(s.week));set('sleepWeeklyPerformance',s.perf===null?'—':Math.round(s.perf)+' %');
      set('sleepWeeklyHrv',s.hrv===null?'—':Math.round(s.hrv)+' ms');set('sleepWeeklyRhr',s.rhr===null?'—':Math.round(s.rhr)+' bpm');
      stageBar(a);bars(s.nights,'durationHours','sleepDurationBars');bars(s.nights,'hrvMs','sleepHrvBars');
      const notes=el('sleepFindings');if(notes){notes.replaceChildren();insights(s).forEach(t=>{const li=doc.createElement('li');li.textContent=t;notes.append(li);});}
      const history=el('sleepNightHistory');if(history){history.replaceChildren();s.nights.slice(0,7).forEach(n=>{
        const line=doc.createElement('div');line.className='dgos-sleep-history-row';
        [label(n.end),duration(mins(n.durationHours)),number(n.performance)===null?'—':Math.round(n.performance)+' %',number(n.hrvMs)===null?'—':Math.round(n.hrvMs)+' ms'].forEach((t,i)=>{
          const item=doc.createElement('span');item.textContent=t;if(!i)item.className='dgos-sleep-history-date';line.append(item);
        });history.append(line);
      });}
    }
    async function refresh(force=false){
      const token=win.localStorage.getItem('dgos.whoopSession');if(!token){hide();return;}
      if(loading||(!force&&Date.now()-loadedAt<15*60*1000))return;
      loading=true;set('sleepIntelligenceState','Schlafdaten werden geladen …');
      try{
        const r=await win.fetch(EDGE+'/history?days='+lastDays,{cache:'no-store',headers:{Authorization:'Bearer '+token}});
        if(!r.ok)throw new Error(r.status===401?'WHOOP-Autorisierung auf diesem Gerät erneuern':'Verlauf momentan nicht verfügbar ('+r.status+')');
        render(await r.json());loadedAt=Date.now();
      }catch(e){box.hidden=false;set('sleepIntelligenceState',(e.message||'Ladefehler')+' · Bitte später erneut versuchen.');}
      finally{loading=false;}
    }
    el('sleepRange')?.addEventListener('change',event=>{const x=Number(event.target.value);lastDays=[7,30,90].includes(x)?x:30;loadedAt=0;refresh(true);});
    el('sleepRefresh')?.addEventListener('click',()=>refresh(true));
    win.addEventListener('dgos-whoop-session',()=>refresh(true));
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)refresh();});
    if(win.localStorage.getItem('dgos.whoopSession'))refresh();
  }
  return {summary,insights,duration,delta,mount};
});
