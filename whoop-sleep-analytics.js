/* WHOOP historical sleep: date-safe German comparisons, CSV reader and daily trends.
 * Pure, offline-testable; no health data persists in frontend/browser storage. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSWhoopSleep=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const msDay=86400000;
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  function dayAdd(date,delta){
    const n=Date.parse(date+'T12:00:00Z');
    if(!datePattern.test(date)||!Number.isFinite(n))return '';
    return new Date(n+delta*msDay).toISOString().slice(0,10);
  }
  function number(value){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    const n=Number(String(value).trim().replace(',','.'));
    return Number.isFinite(n)?n:null;
  }
  function integer(value,max=1800){
    const n=number(value);
    return n!==null&&n>=0&&n<=max?Math.round(n):null;
  }
  function localOffset(value,offset){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))return null;
    const tz=typeof offset==='string'&&/^UTC[+-]\d{2}:\d{2}$/.test(offset)?offset.slice(3):'+00:00';
    const d=new Date(value.replace(' ','T')+tz);
    return Number.isFinite(d.getTime())?d.toISOString():null;
  }
  function parseCSV(raw){
    if(typeof raw!=='string'||raw.length>500000)throw Error('CSV zu gross');
    const text=raw.replace(/^\uFEFF/,'');
    const rows=[],line=[];
    let cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){
        if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"')quoted=false;
        else cell+=ch;
      }else if(ch==='"')quoted=true;
      else if(ch===','||ch===';'&&text.slice(0,text.indexOf('\n')).includes(';')){
        line.push(cell);cell='';
      }else if(ch==='\n'||ch==='\r'){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        line.push(cell);cell='';
        if(line.some(x=>String(x).trim()))rows.push([...line]);
        line.length=0;
      }else cell+=ch;
    }
    if(quoted)throw Error('CSV-Anführungszeichen unvollständig');
    if(cell||line.length){line.push(cell);if(line.some(x=>x.trim()))rows.push([...line]);}
    if(rows.length<2)return [];
    const keys=rows.shift().map(k=>k.trim());
    return rows.map(cols=>Object.fromEntries(keys.map((key,i)=>[key,cols[i]||''])));
  }
  function parseWhoopCSV(raw){
    const csv=parseCSV(raw);
    if(csv.length>800)throw Error('Export enthält zu viele Zeilen');
    if(!csv.length||!Object.hasOwn(csv[0],'Beginn des Aufwachens')||
      !Object.hasOwn(csv[0],'Schlafdauer (Min.)'))
      throw Error('Bitte die Datei «Schlaf.csv» aus deinem WHOOP-Export verwenden');
    const byDate=new Map();
    for(const row of csv){
      if(String(row['Nickerchen']).trim().toLowerCase()==='true')continue;
      const wake=String(row['Beginn des Aufwachens']||'');
      const date=wake.slice(0,10);
      const duration=integer(row['Schlafdauer (Min.)'],1500);
      if(!datePattern.test(date)||!duration||Date.parse(date+'T12:00:00Z')<Date.parse('2020-01-01'))continue;
      const offset=row['Zeitzone des Zyklus'];
      const record={
        sleep_date:date,
        sleep_start:localOffset(row['Beginn des Schlafs'],offset),
        wake_time:localOffset(wake,offset),
        duration_min:duration,
        in_bed_min:integer(row['Dauer im Bett (Min.)']),
        deep_min:integer(row['Dauer des Tiefschlafs (Min.)']),
        rem_min:integer(row['Dauer des REM-Schlafs (Min.)']),
        light_min:integer(row['Dauer des Leichtschlafs (Min.)']),
        awake_min:integer(row['Dauer des Aufwachens (Min.)']),
        needed_min:integer(row['Schlafbedarf (Min.)']),
        performance:integer(row['Schlafleistung %'],100),
        efficiency:integer(row['Schlafeffizienz %'],100),
        consistency:integer(row['Schlafbeständigkeit %'],100),
        respiratory_rate:number(row['Atemfrequenz (Atemzüge/Min.)'])
      };
      // Rare multiple main sleeps: keep the longer record, never sum naps.
      if(!byDate.has(date)||byDate.get(date).duration_min<duration)byDate.set(date,record);
    }
    return Array.from(byDate.values()).sort((a,b)=>a.sleep_date.localeCompare(b.sleep_date));
  }
  function duration(minutes){
    const value=integer(minutes,1800);
    if(value===null)return '—';
    const h=Math.floor(value/60),m=value%60;
    return h+' Std. '+String(m).padStart(2,'0')+' Min.';
  }
  function avg(rows,key){
    const values=rows.map(row=>number(row?.[key])).filter(x=>x!==null);
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function normalized(rows){
    if(!Array.isArray(rows))return [];
    const byDate=new Map();
    for(const row of rows){
      const date=row?.sleep_date;
      const val=integer(row?.duration_min,1500);
      if(!datePattern.test(date||'')||!val)continue;
      if(!byDate.has(date)||row.source==='whoop_live')byDate.set(date,{...row,duration_min:val});
    }
    return Array.from(byDate.values()).sort((a,b)=>a.sleep_date.localeCompare(b.sleep_date));
  }
  function compute(records,anchor){
    const rows=normalized(records);
    if(!rows.length)return {empty:true,rows:[],date:null};
    const latest=rows.at(-1).sleep_date;
    const date=datePattern.test(anchor||'')&&anchor<=latest?anchor:latest;
    const map=new Map(rows.map(row=>[row.sleep_date,row]));
    const current=map.get(date)||null;
    const yesterday=map.get(dayAdd(date,-1))||null;
    const lastWeek=map.get(dayAdd(date,-7))||null;
    const weekDays=Array.from({length:7},(_,i)=>dayAdd(date,i-6));
    const previousDays=Array.from({length:7},(_,i)=>dayAdd(date,i-13));
    const week=weekDays.map(d=>map.get(d)).filter(Boolean);
    const previous=previousDays.map(d=>map.get(d)).filter(Boolean);
    const series=Array.from({length:14},(_,i)=>{
      const sleep_date=dayAdd(date,i-13);
      return {sleep_date,record:map.get(sleep_date)||null};
    });
    const wa=avg(week,'duration_min'),pa=avg(previous,'duration_min');
    const wPerf=avg(week,'performance'),pPerf=avg(previous,'performance');
    const improvement=wa!==null&&pa!==null&&week.length>=3&&previous.length>=3?wa-pa:null;
    const statements=[];
    if(current){
      const required=number(current.needed_min);
      const actual=number(current.duration_min);
      if(required!==null&&required>0){
        const missing=Math.max(0,Math.round(required-actual));
        statements.push(missing>30?'Du hast '+duration(missing)+' weniger als deinen WHOOP-Schlafbedarf geschlafen.':'Du hast deinen erfassten Schlafbedarf nahezu erreicht.');
      }
      const perf=number(current.performance);
      if(perf!==null)statements.push('Schlafleistung laut WHOOP: '+Math.round(perf)+' %.');
      if(yesterday){
        const delta=current.duration_min-yesterday.duration_min;
        statements.push('Gegenüber gestern '+(delta>=0?'+'+duration(delta):'−'+duration(-delta))+' Schlaf.');
        if(number(current.performance)!==null&&number(yesterday.performance)!==null){
          const score=Math.round(number(current.performance)-number(yesterday.performance));
          statements.push('Deine WHOOP-Schlafleistung liegt gegenüber gestern '+(score>=0?'um '+score+' Prozentpunkte höher.':'um '+Math.abs(score)+' Prozentpunkte niedriger.'));
        }
      }
      if(lastWeek){
        const delta=current.duration_min-lastWeek.duration_min;
        statements.push('Gegenüber demselben Wochentag letzte Woche '+(delta>=0?'+'+duration(delta):'−'+duration(-delta))+'.');
        if(number(current.performance)!==null&&number(lastWeek.performance)!==null){
          const score=Math.round(number(current.performance)-number(lastWeek.performance));
          statements.push('Schlafleistung im Vergleich zur Vorwoche: '+(score>=0?'+':'−')+Math.abs(score)+' Prozentpunkte.');
        }
      }
      if(improvement!==null)statements.push('7-Tage-Durchschnitt '+(improvement>=0?'gestiegen':'gesunken')+' um '+duration(Math.abs(Math.round(improvement)))+' gegenüber der Vorwoche.');
    }
    const summary=statements.length?statements.join(' '):'Für diesen Tag liegen noch keine Schlafwerte vor.';
    return {empty:false,rows,date,latest,current,yesterday,lastWeek,week,previous,series,
      average7:wa,averagePrevious7:pa,performance7:wPerf,performancePrevious7:pPerf,
      improvement,weekDays,previousDays,summary};
  }
  return {dayAdd,parseCSV,parseWhoopCSV,normalized,avg,compute,duration,integer,number};
});