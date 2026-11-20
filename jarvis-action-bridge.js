/* DG OS Jarvis: verified owner actions for voice and keyboard.
   Never claim a write succeeded until the secured API returns its saved ID. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSJarvisActions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BASE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/';
  const blocked=/\b(?:überweis\w*|geld\s+senden|jetzt\s+zahlen|zahlung\s+ausführen|mail\s+abschicken|e-?mail\s+senden|termin\s+(?:absagen|stornieren|verschieben))\b/i;
  const question=/^(?:was|wie|warum|wieso|wann|wo|welche|zeig|öffne|lies|kannst du mir sagen)\b/i;
  function label(name){
    const s=name.trim();
    if(/^(?:gruppenunfall|groupe?\s+mutuel)$/i.test(s))return 'Groupe Mutuel';
    if(/^for\s*traders$/i.test(s))return 'ForTraders';
    return s;
  }
  function timeFrom(s){
    const m=/\bum\s+(\d{1,2})(?:(?:[:.])([0-5]\d))?\s*(?:uhr)?\b/i.exec(s);
    return m&&Number(m[1])<24?m[1].padStart(2,'0')+':'+(m[2]||'00'):'';
  }
  function withoutDate(s){
    return s.replace(/\b(?:spätestens|bis\s+zum|bis|für|am|auf)\s+(?:den\s+)?(?:\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|(?:nächsten?|naechsten?|diesen|kommenden)?\s*(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag))\b/gi,' ')
      .replace(/\b(?:heute|morgen|übermorgen|uebermorgen)\b/gi,' ')
      .replace(/\b(?:nächste|naechste|kommende|übernächste|uebernaechste)\s+woche\b/gi,' ')
      .replace(/\bum\s+\d{1,2}(?:(?::|\.)\d{2})?\s*(?:uhr)?\b/gi,' ')
      .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  function parse(raw,life,now=new Date()){
    if(typeof raw!=='string'||raw.length>1000)return null;
    const text=life?.stripWake?.(raw)||raw.trim();
    if(!text||blocked.test(text)||question.test(text))return null;
    const when=life?.dueDate?.(text,now)||null;
    if(when&&/\bwegen\s+/i.test(text)&&/\b(?:erinner\w*|notier\w*|merk\w*|muss|müssen|soll|sollte|todo|to-do|aufgabe|spätestens|kümmer\w*)\b/i.test(text)){
      const m=/\bwegen\s+(.+)$/i.exec(text);
      if(m){
        const entries=m[1].replace(/[.!?]+$/,'').split(/\s*,\s*(?:wegen\s+)?|\s+(?:und|sowie)\s+(?:wegen\s+)?/i)
          .map(s=>label(s.replace(/^wegen\s+/i,'').replace(/\s+(?:klären|prüfen|erledigen|kümmern)\s*$/i,'').trim())).filter(Boolean);
        if(entries.length>=2&&entries.length<=8&&entries.every(s=>s.length>=3&&s.length<=65&&!/[\n<>[\]{}]/.test(s)))
          return {intent:'tasks',date:when.date,dateLabel:when.label,items:[...new Set(entries)].map(title=>({title:title+' klären',notes:'Als offene Aufgabe vorgemerkt. Es wurde nichts bezahlt oder versendet.'}))};
      }
    }
    if(/\b(?:termin|meeting|treffen|arzttermin|besprechung)\b/i.test(text)&&
       /\b(?:eintrag\w*|trag\w*|erstell\w*|speicher\w*|notier\w*|plan\w*|vereinbar\w*|habe|haben)\b/i.test(text)&&
       !/\b(?:absagen|stornieren|verschieben|löschen)\b/i.test(text)){
      if(!when)return {intent:'clarify',message:'An welchem Datum soll ich den Termin eintragen?'};
      const time=timeFrom(text);
      if(!time)return {intent:'clarify',message:'Um welche Uhrzeit soll ich den Termin eintragen? Sag beispielsweise: «Trag Termin Arzt am Sonntag um 15 Uhr ein.»'};
      let title=withoutDate(text)
        .replace(/^(?:(?:ich|wir)\s+)?(?:habe|haben)\s+/i,'')
        .replace(/^(?:bitte\s+)?(?:trag\w*|eintrag\w*|erstell\w*|speicher\w*|notier\w*|plan\w*|vereinbar\w*)\s+(?:mir\s+)?/i,'')
        .replace(/^(?:einen?\s+)?(?:termin|meeting|treffen|arzttermin|besprechung)\s*(?:(?:bei|mit|für|fuer|wegen|zum|zur)\s+)?/i,'')
        .replace(/\b(?:eintragen|ein|erstellen|anlegen|speichern|vormerken)\s*$/i,'')
        .trim().replace(/^[,.:;-]+|[,.:;-]+$/g,'');
      title='Termin'+(title?': '+title:'');
      return {intent:'appointment',title:title.slice(0,240),date:when.date,time};
    }
    if(!when&&/^(?:bitte\s+)?(?:notier\w*|schreib\w*)\b/i.test(text)&&/\bnotiz\b|^notier/i.test(text)){
      let title=text.replace(/^(?:bitte\s+)?(?:notier\w*|schreib\w*)\s*(?:(?:mir|dir)\s+)?(?:eine\s+)?(?:notiz\s*)?(?:dass\s+|:\s*|über\s+|zu\s+)?/i,'').trim();
      if(title.length>=4&&title.length<=240&&title!==text)return {intent:'note',title};
    }
    if(when&&/^(?:erinnere?\s+(?:mich|uns)|erinnerung|reminder|denk\s+dran|denke\s+daran)\b/i.test(text)){
      let task=withoutDate(text.replace(/^(?:erinnere?\s+(?:mich|uns)|erinnerung|reminder|denk\s+dran|denke\s+daran)\s*/i,''))
        .replace(/^(?:(?:daran|darauf)\s*,?\s*)?(?:(?:dass|an|wegen|zu)\s+)?/i,'').replace(/[.!?,;]+$/,'').trim();
      if(task.length<3||task.length>190||/[\n<>[\]{}]/.test(task))
        return {intent:'clarify',message:'Was genau soll ich dir für '+when.label+' notieren?'};
      return {intent:'tasks',date:when.date,dateLabel:when.label,time:timeFrom(text),items:[{title:task[0].toUpperCase()+task.slice(1),notes:'Als Aufgabe notiert. Eine Push-Benachrichtigung wird dadurch nicht automatisch aktiviert.'}]};
    }
    return null;
  }
  function create(options={}){
    let busy=false;
    const confirmed=new Map();
    function session(){
      try{return globalThis.localStorage?.getItem('dgos.deviceSession')||globalThis.localStorage?.getItem('dgos.whoopSession')||'';}catch{return '';}
    }
    async function post(endpoint,token,body){
      const control=new AbortController(),timeout=setTimeout(()=>control.abort(),22000);
      try{
        const res=await fetch(BASE+endpoint,{method:'POST',cache:'no-store',signal:control.signal,
          headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
        const result=await res.json().catch(()=>({}));
        if(!res.ok)throw Error(res.status===401?'Geräteverbindung abgelaufen. Bitte Telegram-Kopplung erneuern.':
          'Serverfehler ('+res.status+'). Bitte später erneut versuchen.');
        return result;
      }finally{clearTimeout(timeout);}
    }
    function handle(raw){
      const action=parse(raw,options.lifeIntent||globalThis.DGOSLifeIntent);
      if(!action)return false;
      if(action.intent==='clarify'){options.onQuestion?.(action.message);return true;}
      if(busy){options.onQuestion?.('Ich bin noch am Speichern. Bitte zuerst meine Bestätigung abwarten.');return true;}
      const token=session();
      if(!token){options.onError?.('Nicht gespeichert. Bitte dieses Gerät zuerst mit Jarvis über Telegram verbinden.');return true;}
      const key=JSON.stringify(action);
      if(confirmed.has(key)&&Date.now()-confirmed.get(key)<90000){
        options.onQuestion?.('Diesen Auftrag habe ich bereits gerade gespeichert. Es wurde nichts doppelt angelegt.');
        return true;
      }
      busy=true;
      options.onThinking?.('Ich speichere deinen Auftrag …');
      void (async()=>{
        try{
          if(action.intent==='tasks'){
            const saved=[],failed=[];
            for(const item of action.items){
              try{
                const result=await post('tasks/create',token,{title:item.title,dueDate:action.date,dueTime:action.time||undefined,notes:item.notes,priority:'normal'});
                if(!result.task?.id||result.task.title!==item.title||result.task.due_date!==action.date)throw Error('Bestätigung fehlt');
                saved.push(item.title);
              }catch(_){failed.push(item.title);}
            }
            if(saved.length)options.onUpdate?.('tasks');
            if(!failed.length){
              confirmed.set(key,Date.now());
              options.onSuccess?.((saved.length>1?saved.length+' Aufgaben':'Eine Aufgabe')+' für '+action.date+
                (action.time?' um '+action.time+' Uhr':'')+' in DG-OS gespeichert: '+saved.join('; ')+
                '. Ich habe keine E-Mail verschickt und keine Zahlung ausgeführt.'+
                (action.time?' Push-Erinnerungen sind nicht automatisch aktiviert.':''));
            }else{
              options.onError?.(saved.length+' von '+action.items.length+' Aufgaben gespeichert.'+
                (saved.length?' Gespeichert: '+saved.join('; ')+'.':'')+
                ' Nicht bestätigt: '+failed.join('; ')+'. Bitte nur die fehlenden erneut versuchen.');
            }
          }else if(action.intent==='appointment'){
            const result=await post('jarvis-private?action=add',token,{kind:'appointment',title:action.title,date:action.date,time:action.time,source:'voice'});
            if(!result.item?.id||result.item.kind!=='appointment'||result.item.date!==action.date)throw Error('Terminbestätigung fehlt');
            confirmed.set(key,Date.now());options.onUpdate?.('private');
            options.onSuccess?.('Termin «'+action.title+'» am '+action.date+' um '+action.time+
              ' Uhr im DG-OS-Kalender gespeichert. Kein Google-Kalender-Termin erstellt.');
          }else if(action.intent==='note'){
            const result=await post('jarvis-private?action=add',token,{kind:'note',title:action.title,source:'voice'});
            if(!result.item?.id||result.item.title!==action.title)throw Error('Notizbestätigung fehlt');
            confirmed.set(key,Date.now());options.onUpdate?.('private');
            options.onSuccess?.('Notiz «'+action.title+'» in DG-OS gespeichert.');
          }
        }catch(e){options.onError?.('Nicht gespeichert: '+(e?.message||'Die Verbindung ist gerade nicht verfügbar.'));}
        finally{busy=false;}
      })();
      return true;
    }
    return {handle,isBusy:()=>busy};
  }
  return {parse,create};
});