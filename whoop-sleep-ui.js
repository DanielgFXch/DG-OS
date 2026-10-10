/* DG OS WHOOP History UI. Private data only via existing WHOOP owner session. */
(()=>{
  'use strict';
  const root=document.getElementById('whoopSleepAnalysis');
  const api=window.DGOSWhoopSleep;
  if(!root||!api)return;
  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop';
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{const node=el(id);if(node)node.textContent=value;};
  const dateLabel=date=>new Intl.DateTimeFormat('de-CH',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  const dayShort=date=>new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  const n=v=>api.number(v);
  const fmt=mins=>mins===null||mins===undefined?'—':api.duration(Math.max(0,Math.round(mins)));
  const percent=value=>n(value)===null?'—':Math.round(n(value))+' %';
  const token=()=>{try{return localStorage.getItem('dgos.whoopSession')||'';}catch{return '';}};
  let rows=[],current='',period='day',busy=false,lastFetch=0;
  const status=s=>text('dgwSleepNotice',s);
  const dateBack=(date,n)=>api.dayAdd(date,n);
  const range=(a,b)=>a+' – '+b;
  function arrow(id,enabled){el(id).disabled=!enabled;}
  function showMetric(id,value){text(id,value);}
  function ring(performance){
    const value=n(performance);
    const p=value===null?0:Math.max(0,Math.min(100,value));
    el('dgwSleepCircle').style.setProperty('--pct',p+'%');
    el('dgwSleepCircle').setAttribute('aria-label',value===null?'Schlafleistung nicht erfasst':'Schlafleistung '+Math.round(value)+' Prozent');
    text('dgwSleepPercent',value===null?'—':Math.round(value)+' %');
  }
  function diff(id,noteId,record,reference,label,comparisonKey='duration_min'){
    if(!record||!reference||n(record[comparisonKey])===null||n(reference[comparisonKey])===null){
      text(id,'—');text(noteId,'Kein Vergleich verfügbar');el(id).removeAttribute('data-direction');return;
    }
    const delta=Math.round(n(record[comparisonKey])-n(reference[comparisonKey]));
    text(id,delta===0?'±0 Min.':(delta>0?'+':'−')+fmt(Math.abs(delta)));
    text(noteId,label+' · '+fmt(n(reference[comparisonKey])));
    el(id).dataset.direction=delta>0?'positive':delta<0?'negative':'neutral';
  }
  function chart(series,selected){
    const container=el('dgwSleepBars');container.replaceChildren();
    const actual=series.filter(p=>p.record).map(p=>n(p.record.duration_min)||0);
    const maximum=Math.max(480,...actual);
    for(const point of series){
      const button=document.createElement('button');button.type='button';button.className='dgw-bar';
      button.dataset.missing=String(!point.record);
      button.setAttribute('aria-pressed',String(point.sleep_date===selected));
      button.setAttribute('aria-label',dateLabel(point.sleep_date)+': '+(point.record?fmt(n(point.record.duration_min)):'keine Daten'));
      const shape=document.createElement('span');shape.className='dgw-bar-shape';
      shape.style.height=point.record?(Math.max(6,Math.min(100,100*n(point.record.duration_min)/maximum))*1.12)+'px':'2px';
      const day=document.createElement('span');day.className='dgw-bar-day';day.textContent=point.sleep_date.slice(8,10);
      button.append(shape,day);
      button.addEventListener('click',()=>{current=point.sleep_date;period='day';syncTabs();render();});
      container.append(button);
    }
  }
  function syncTabs(){
    root.querySelectorAll('[data-dgw-period]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.dgwPeriod===period)));
  }
  function renderTop(data){
    // Real percentages, never confuse 6h45 duration with 81% sleep score.
    const perf=n(data?.sleep?.performance),recovery=n(data?.recovery?.score),strain=n(data?.cycle?.strain);
    const cards=document.querySelectorAll('#personalHealth .personal-health-values>div>strong');
    [perf,recovery,strain===null?null:(strain/21)*100].forEach((value,i)=>{
      if(!cards[i])return;
      cards[i].style.setProperty('--whoop-pct',(value===null?0:Math.max(0,Math.min(100,value)))+'%');
    });
    text('whoopSleepPerformance',perf!==null?'Schlafleistung '+Math.round(perf)+' %':'Schlafleistung —');
  }
  function render(){
    const summary=api.compute(rows,current);
    if(summary.empty){
      text('dgwSleepSource','Noch keine Schlafhistorie gespeichert');
      text('dgwSleepRange','Keine Aufzeichnungen');
      text('dgwSleepInsight','WHOOP einmal verbinden oder deinen Export unten importieren.');
      ring(null);chart([],null);return;
    }
    current=summary.date;
    const today=summary.current;
    const comparisonLabels=el('dgwVsYesterday').closest('.dgw-comparison')?.querySelector('span');
    const previousLabels=el('dgwVsLastWeek').closest('.dgw-comparison')?.querySelector('span');
    if(comparisonLabels)comparisonLabels.textContent=period==='day'?'Gestern':period==='week'?'Diese Woche':'Letzte 30 Tage';
    if(previousLabels)previousLabels.textContent=period==='day'?'Vor einer Woche':period==='week'?'Vorwoche':'Vorherige 30 Tage';
    const displayPeriod=period==='day'?1:period==='week'?7:30;
    const windowDays=Array.from({length:displayPeriod},(_,i)=>dateBack(current,i-displayPeriod+1));
    const windowRows=windowDays.map(d=>summary.rows.find(r=>r.sleep_date===d)).filter(Boolean);
    const avg=key=>api.avg(windowRows,key);
    const headline=period==='day'?(today?.duration_min??null):avg('duration_min');
    const perf=period==='day'?today?.performance:avg('performance');
    const stages=key=>period==='day'?today?.[key]:avg(key);
    const beginning=windowDays[0];
    const label=period==='day'?dateLabel(current):dayShort(beginning)+' – '+dateLabel(current);
    text('dgwSleepRange',label);
    ring(perf);
    text('dgwSleepDuration',fmt(headline));
    text('dgwSleepNeed','Schlafbedarf: '+fmt(stages('needed_min')));
    const countMessage=period==='day'?'':('Durchschnitt aus '+windowRows.length+' von '+displayPeriod+' Tagen. ');
    text('dgwSleepInsight',period==='day'?summary.current?summary.summary:'Für diesen Tag fehlen die WHOOP-Schlafdaten.':
      countMessage+(headline!==null?'Deine durchschnittliche Schlafdauer beträgt '+fmt(headline)+'.':'Zu wenige Daten für einen Vergleich.'));
    const stagesMap={'dgwDeep':'deep_min','dgwRem':'rem_min','dgwLight':'light_min','dgwAwake':'awake_min'};
    Object.entries(stagesMap).forEach(([id,key])=>showMetric(id,fmt(stages(key))));
    showMetric('dgwEfficiency',percent(stages('efficiency')));
    showMetric('dgwConsistency',percent(stages('consistency')));
    // WHOOP records sleep onset, not the time taken to fall asleep:
    // do not infer a sleep-latency metric from these timestamps.
    const localClock=value=>{
      if(!value)return '—';
      const epoch=new Date(value);
      if(!Number.isFinite(epoch.getTime()))return '—';
      return new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit'}).format(epoch);
    };
    showMetric('dgwSleepStart',period==='day'?localClock(today?.sleep_start):'—');
    showMetric('dgwWakeTime',period==='day'?localClock(today?.wake_time):'—');
    if(period==='day'){
      diff('dgwVsYesterday','dgwVsYesterdayNote',today,summary.yesterday,'Vortag');
      diff('dgwVsLastWeek','dgwVsLastWeekNote',today,summary.lastWeek,'Gleicher Wochentag');
      text('dgwAverage7',fmt(summary.average7));
      text('dgwAverage7Note',summary.improvement===null?'Vorwoche: zu wenige Daten':
        (summary.improvement>=0?'+':'−')+fmt(Math.abs(summary.improvement))+' gegenüber Vorwoche');
      el('dgwAverage7').removeAttribute('data-direction');
    }else{
      const prevDates=Array.from({length:displayPeriod},(_,i)=>dateBack(beginning,i-displayPeriod));
      const previous=prevDates.map(d=>summary.rows.find(r=>r.sleep_date===d)).filter(Boolean);
      const older=api.avg(previous,'duration_min');
      text('dgwVsYesterday',fmt(avg('duration_min')));
      text('dgwVsYesterdayNote','Ø in diesem '+(period==='week'?'Wochen':'Monats')+'zeitraum');
      const delta=older===null||headline===null||previous.length<Math.ceil(displayPeriod/2)||windowRows.length<Math.ceil(displayPeriod/2)?null:Math.round(headline-older);
      text('dgwVsLastWeek',delta===null?'—':(delta>=0?'+':'−')+fmt(Math.abs(delta)));
      text('dgwVsLastWeekNote',delta===null?'Vorperiode: zu wenige Daten':'Vergleich zur Vorperiode');
      el('dgwVsLastWeek').dataset.direction=delta===null?'neutral':delta>0?'positive':delta<0?'negative':'neutral';
      text('dgwAverage7',fmt(summary.average7));text('dgwAverage7Note','Ø letzte 7 Tage');
    }
    const chartDays=period==='month'?30:14;
    const series=Array.from({length:chartDays},(_,i)=>{
      const day=dateBack(current,i-chartDays+1);
      return {sleep_date:day,record:summary.rows.find(r=>r.sleep_date===day)||null};
    });
    text('dgwTrendTitle','Schlafdauer · Tagesverlauf');
    text('dgwTrendDescription','Letzte '+chartDays+' Kalendertage');
    el('dgwSleepBars').dataset.range=period;
    chart(series,current);
    const latest=summary.latest;
    const currentAllowed=current<latest;
    arrow('dgwSleepNext',currentAllowed);
    text('dgwSleepSource',summary.rows.length+' Nächte · WHOOP-Verlauf bis '+dayShort(latest));
  }
  async function refresh(){
    if(busy)return;
    const active=token();
    if(!active){status('WHOOP-Verbindung erforderlich. Bitte oben WHOOP verbinden.');render();return;}
    busy=true;el('dgwSleepRefresh').disabled=true;
    try{
      const res=await fetch(EDGE+'/history',{headers:{Authorization:'Bearer '+active},cache:'no-store'});
      if(res.status===401){status('Deine WHOOP-Sitzung ist abgelaufen. DG OS versucht sie automatisch wiederherzustellen.');return;}
      if(!res.ok)throw Error('Schlafdaten konnten gerade nicht geladen werden.');
      const payload=await res.json();
      const incoming=api.normalized(payload.records||[]);
      const oldLatest=rows.at(-1)?.sleep_date||'';
      rows=incoming;
      if(!current||current===oldLatest)current=incoming.at(-1)?.sleep_date||'';
      render();
      status(rows.length?'Historie sicher geladen. Vergleiche sind aktuell.':'Noch keine historischen Nächte. Nutze deinen Export unten.');
      lastFetch=Date.now();
    }catch(e){status(e.message||'Schlafanalyse konnte nicht geladen werden.');}
    finally{busy=false;el('dgwSleepRefresh').disabled=false;}
  }
  async function readZipFile(file){
    const buffer=await file.arrayBuffer(),view=new DataView(buffer);
    const total=view.byteLength;
    if(total<44||total>650000)throw Error('ZIP-Datei ungültig oder zu gross.');
    // Read ZIP central directory, not local-file sizes. WHOOP exports use
    // general-purpose bit 3 (local header sizes absent, data descriptor).
    let eocd=-1;
    for(let i=total-22;i>=Math.max(0,total-66000);i--){
      if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
    }
    if(eocd<0)throw Error('ZIP-Verzeichnis nicht gefunden.');
    const count=view.getUint16(eocd+10,true);
    let pos=view.getUint32(eocd+16,true);
    const decoder=new TextDecoder();
    for(let i=0;i<count&&i<50;i++){
      if(pos+46>total||view.getUint32(pos,true)!==0x02014b50)
        throw Error('ZIP-Verzeichnis beschädigt.');
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true);
      const compressed=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true);
      const nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
      const localOffset=view.getUint32(pos+42,true);
      if(pos+46+nameLength>total)throw Error('ZIP-Dateiname beschädigt.');
      const name=decoder.decode(new Uint8Array(buffer,pos+46,nameLength));
      pos+=46+nameLength+extra+comment;
      if(!name.toLowerCase().endsWith('schlaf.csv'))continue;
      if(flags&1)throw Error('Der WHOOP-Export ist verschlüsselt; bitte Schlaf.csv direkt auswählen.');
      if(uncompressed>450000)throw Error('Die Schlafdatei ist zu gross.');
      if(localOffset+30>total||view.getUint32(localOffset,true)!==0x04034b50)
        throw Error('ZIP-Datei unvollständig.');
      const localName=view.getUint16(localOffset+26,true),localExtra=view.getUint16(localOffset+28,true);
      const start=localOffset+30+localName+localExtra;
      if(start+compressed>total)throw Error('ZIP-Datei unvollständig.');
      const part=new Uint8Array(buffer,start,compressed);
      if(method===0)return decoder.decode(part);
      if(method!==8||typeof DecompressionStream!=='function')
        throw Error('Bitte «Schlaf.csv» in der Dateien-App aus dem ZIP entpacken.');
      try{
        const decoded=new Blob([part]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(decoded).text();
      }catch{throw Error('ZIP-Entpackung nicht unterstützt. Bitte «Schlaf.csv» direkt auswählen.');}
    }
    throw Error('Keine «Schlaf.csv» im ZIP gefunden.');
  }
  async function importFile(file){
    if(!file)return;
    if(file.size>600000)throw Error('Datei zu gross. Bitte WHOOP Schlaf.csv wählen.');
    const raw=file.name.toLowerCase().endsWith('.zip')?await readZipFile(file):await file.text();
    const records=api.parseWhoopCSV(raw);
    if(!records.length)throw Error('Keine Hauptschlaf-Aufzeichnungen gefunden. Nickerchen werden ausgeschlossen.');
    const owner=token();
    if(!owner)throw Error('Zuerst WHOOP in DG OS verbinden.');
    const res=await fetch(EDGE+'/history-import',{
      method:'POST',headers:{Authorization:'Bearer '+owner,'Content-Type':'application/json'},
      cache:'no-store',body:JSON.stringify({records})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(res.status===401?'WHOOP-Sitzung abgelaufen. Bitte neu öffnen.':'Der sichere WHOOP-Import ist fehlgeschlagen.');
    status('Import abgeschlossen: '+data.total+' Nächte verarbeitet. '+data.imported+' neu bzw. aktualisiert.');
    current='';
    await refresh();
  }
  el('dgwSleepPrev').addEventListener('click',()=>{
    if(!current)return;
    current=dateBack(current,-(period==='day'?1:period==='week'?7:30));render();
  });
  el('dgwSleepNext').addEventListener('click',()=>{
    if(!current)return;
    const last=rows.at(-1)?.sleep_date;
    current=dateBack(current,period==='day'?1:period==='week'?7:30);
    if(current>last)current=last;
    render();
  });
  root.querySelectorAll('[data-dgw-period]').forEach(btn=>btn.addEventListener('click',()=>{
    period=btn.dataset.dgwPeriod;syncTabs();render();
  }));
  el('dgwSleepRefresh').addEventListener('click',refresh);
  el('dgwWhoopImportFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    status('WHOOP-Export wird gelesen und privat importiert …');
    try{await importFile(file);}catch(error){status(error.message||'WHOOP-Datei konnte nicht verarbeitet werden.');}
    finally{event.target.value='';}
  });
  window.addEventListener('dgos-whoop-updated',event=>{renderTop(event.detail);if(Date.now()-lastFetch>20000)void refresh();});
  window.addEventListener('dgos-whoop-session',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastFetch>180000)void refresh();});
  syncTabs();
  void refresh();
  window.DGOSWhoopSleepUI={refresh};
})();