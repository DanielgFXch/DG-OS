/* DG OS: natural language WHOOP questions. Read-only; never guesses health values. */
(function(root){
'use strict';
const BASE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop';
const zone='Europe/Zurich';
const n=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const duration=h=>n(h)===null?'unbekannt':Math.floor(h)+' Stunden '+Math.round((h-Math.floor(h))*60)+' Minuten';
const value=(x,suffix)=>n(x)===null?'kein Wert':Math.round(x)+suffix;
const localDay=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
const localToday=()=>localDay(new Date());
const dateLabel=date=>new Intl.DateTimeFormat('de-CH',{timeZone:zone,day:'numeric',month:'long'}).format(new Date(date));
const previousDay=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
function intent(raw){
 const q=String(raw||'').toLowerCase().replace(/[?!.,]/g,' ').replace(/\s+/g,' ').trim();
 if(!/(schlaf|geschlafen|schlafe|erholt|recovery|hrv|ruhepuls)/.test(q))return null;
 if(!/(wie|war|habe|hab|analyse|vergleich|unterschied|besser|schlechter|wieviel|wie viel|woche|heute|gestern|letzte nacht)/.test(q))return null;
 if(/letzte woche|vorwoche|wochenvergleich/.test(q))return 'week';
 if(/gestern/.test(q))return 'yesterday';
 return 'latest';
}
function describe(row){
 return 'Am '+dateLabel(row.end)+' hast du '+duration(row.durationHours)+' geschlafen. '+
 (n(row.performance)!==null?'Deine WHOOP-Schlafleistung lag bei '+value(row.performance,' Prozent')+'. ':'')+
 (n(row.deepHours)!==null?'Geschätzter Tiefschlaf: '+duration(row.deepHours)+'. ':'')+
 (n(row.remHours)!==null?'Geschätzter REM-Schlaf: '+duration(row.remHours)+'. ':'')+
 (n(row.recovery)!==null?'Recovery: '+value(row.recovery,' Prozent')+'. ':'')+
 (n(row.hrvMs)!==null?'HRV: '+value(row.hrvMs,' Millisekunden')+'. ':'');
}
function compare(a,b){
 if(!a||!b||n(a.durationHours)===null||n(b.durationHours)===null)return '';
 const diff=Math.round((a.durationHours-b.durationHours)*60);
 return diff===0?'Du hast etwa gleich lang geschlafen wie in der Vergleichsnacht.':
 'Das sind '+Math.abs(diff)+' Minuten '+(diff>0?'mehr':'weniger')+' als in der Vergleichsnacht.';
}
async function answer(raw,session,request){
 const cmd=intent(raw);if(!cmd)return null;
 if(!session)return 'WHOOP ist auf diesem Gerät noch nicht verbunden. Öffne Gesundheit und verbinde WHOOP, damit ich deine echten Schlafwerte lesen kann.';
 const headers={Authorization:'Bearer '+session};
 try{
  const r=await request(BASE+'/history?days=30',{cache:'no-store',headers});
  if(r.ok){
   const data=await r.json();
   const rows=(Array.isArray(data.nights)?data.nights:[]).filter(x=>x&&!x.nap&&x.start&&x.end).sort((a,b)=>new Date(b.end)-new Date(a.end));
   if(!rows.length)return 'WHOOP liefert noch keine vollständigen Schlafdaten.';
   const wanted=cmd==='yesterday'?previousDay(localToday()):null;
   const a=wanted?rows.find(x=>localDay(x.end)===wanted):rows[0];
   if(!a)return 'Für gestern ('+wanted+') liegt mir keine abgeschlossene WHOOP-Schlafaufzeichnung vor.';
   if(cmd==='week'){
     const wk=rows.slice(0,7),prior=rows.slice(7,14);
     const avg=xs=>xs.reduce((s,x)=>s+Number(x.durationHours||0),0)/xs.length;
     if(wk.length<3||prior.length<3)return 'Für einen zuverlässigen Wochenvergleich fehlen noch einige WHOOP-Nächte.';
     const d=Math.round((avg(wk)-avg(prior))*60);
     return 'In den letzten sieben aufgezeichneten Nächten hast du im Schnitt '+duration(avg(wk))+' geschlafen. Das sind '+Math.abs(d)+' Minuten '+(d<0?'weniger':'mehr')+' als in den sieben Nächten davor. Die Werte sind WHOOP-Schätzungen.';
   }
   const b=rows.find(x=>new Date(x.end)<new Date(a.end));
   return describe(a)+compare(a,b)+' Die Schlafphasen sind WHOOP-Schätzungen.';
  }
  if(r.status!==404)throw new Error('history_'+r.status);
  const s=await request(BASE+'/summary',{cache:'no-store',headers});
  if(!s.ok)throw new Error('summary_'+s.status);
  const x=await s.json(),sleep=x.sleep||null;
  if(!sleep)return 'WHOOP liefert zurzeit noch keine abgeschlossene Schlafnacht.';
  if(cmd==='yesterday'&&localDay(sleep.end)!==previousDay(localToday()))
    return 'Die WHOOP-Kurzansicht enthält nur die letzte Nacht. Für gestern muss die sichere Verlaufsschnittstelle noch aktiviert werden.';
  if(cmd==='week')return 'Für den Wochenvergleich muss die WHOOP-Verlaufsschnittstelle noch aktiviert werden.';
  return describe({...sleep,recovery:x.recovery?.score??null,hrvMs:x.recovery?.hrvMs??null})+' Für genaue Vergleiche brauchen wir den WHOOP-Verlauf.';
 }catch(_){return 'Deine WHOOP-Schlafdaten sind momentan nicht erreichbar. Bitte prüfe die Verbindung unter Gesundheit.';}
}
root.DGJarvisSleep={intent,answer};
})(typeof window!=='undefined'?window:globalThis);
