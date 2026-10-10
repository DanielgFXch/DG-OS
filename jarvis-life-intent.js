/* German-first Jarvis due-date interpreter. No financial transactions.
   "Nächste Woche" means next week's Monday (Europe/Zurich), explicitly
   disclosed to owner. Ambiguous references are clarified, not guessed. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSLifeIntent=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const weekdays=['sonntag','montag','dienstag','mittwoch','donnerstag','freitag','samstag'];
  const dateOnly=d=>d.toISOString().slice(0,10);
  function todayZurich(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return m.year+'-'+m.month+'-'+m.day;
  }
  function plusDays(date,days){
    const d=new Date(date+'T12:00:00.000Z');
    d.setUTCDate(d.getUTCDate()+days);
    return dateOnly(d);
  }
  function dueDate(phrase,now=new Date()){
    const text=phrase.toLocaleLowerCase('de');
    const today=todayZurich(now);
    const index=new Date(today+'T12:00:00Z').getUTCDay();
    const nextMonday=plusDays(today,(8-index)%7||7);
    let base=null, label='';
    if(/\bübernächste\s+woche\b|\buebernaechste\s+woche\b/.test(text)){base=plusDays(nextMonday,7);label='Montag übernächste Woche';}
    else if(/\b(?:nächste|naechste|kommende)\s+woche\b/.test(text)){base=nextMonday;label='Montag nächste Woche';}
    else if(/\bübermorgen\b|\buebermorgen\b/.test(text)){base=plusDays(today,2);label='Übermorgen';}
    else if(/\bmorgen\b/.test(text)){base=plusDays(today,1);label='Morgen';}
    else if(/\bheute\b/.test(text)){base=today;label='Heute';}
    const weekday=new RegExp('\\b(?:am\\s+)?(?:nächsten?\\s+|naechsten?\\s+|diesen\\s+)?('+weekdays.join('|')+')\\b','i').exec(text);
    if(weekday){
      const target=weekdays.indexOf(weekday[1].toLocaleLowerCase('de'));
      if(base&&/woche/.test(text)){
        // Monday of selected next week; explicit weekday inside that same week.
        const mondayIndex=new Date(base+'T12:00:00Z').getUTCDay();
        const diff=(target-mondayIndex+7)%7;
        return {date:plusDays(base,diff),label:weekday[1]+' nächste Woche'};
      }
      const delta=(target-index+7)%7||7;
      return {date:plusDays(today,delta),label:'Nächster '+weekday[1]};
    }
    if(base)return {date:base,label};
    return null;
  }
  function stripWake(raw){
    return String(raw||'').trim()
      .replace(/^(?:(?:hey|hallo|hi|ok|okay)\s+)*(?:jarvis[\s,:-]*)?/i,'')
      .replace(/^(?:(?:hey|hallo|hi|bitte|also)\s+)+/i,'').trim();
  }
  function parseScheduledCommand(raw,now=new Date()){
    if(typeof raw!=='string'||!raw.trim()||raw.length>400)return null;
    const s=stripWake(raw);
    if(!s||/^(?:was|wie|warum|wann|wo|welche|zeig|öffne|lies)\b/i.test(s))return null;
    if(/\b(?:nicht|nichts|kein|keine|keinen|ohne|vielleicht|eventuell|falls)\b/i.test(s))return null;
    const when=dueDate(s,now);
    if(!when)return null;
    if(!/\b(?:muss|müssen|soll|sollte|werde|will|möchte|moechte|erinner(?:e)?|vergiss|nicht\s+vergessen|to.?do|aufgabe|erledigen|abholen|kaufen|bezahlen|zahlen|machen)\b/i.test(s))return null;
    let desc=s
      .replace(/^(?:(?:kannst du|könntest du)\s+)?(?:(?:mich|mir)\s+)?(?:bitte\s+)?/i,'')
      .replace(/^(?:(?:ich|wir)\s+)?(?:muss|müssen|soll|sollte|will|möchte|moechte|werde)\s+/i,'')
      .replace(/^(?:erinner(?:e)?\s+(?:mich|uns)\s+(?:bitte\s+)?(?:daran\s+)?|vergiss\s+(?:bitte\s+)?nicht\s+|aufgabe\s+)/i,'')
      .replace(/\b(?:am\s+)?(?:nächsten?|naechsten?|diesen)\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi,' ')
      .replace(/\b(?:am\s+)(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi,' ')
      .replace(/\b(?:übernächste|uebernaechste|nächste|naechste|kommende)\s+woche\b/gi,' ')
      .replace(/\b(?:heute|morgen|übermorgen|uebermorgen)\b/gi,' ')
      .replace(/^(?:noch|bitte|daran|dass|das|die|den|dem|mir|für|fuer)\s+/i,'')
      .replace(/\s+/g,' ').replace(/^[,:-]+|[.!?]+$/g,'').trim();
    // "Ich muss DAS morgen bezahlen" without image/item does not identify what.
    if(/^(?:das|dies|dieses|es|etwas|irgendetwas|eine\s+rechnung|einen\s+beleg)(?:\s+(?:bezahlen|zahlen|machen|erledigen|kaufen))?$/i.test(desc) || /^(?:zahlen|bezahlen|kaufen|machen|erledigen|bestellen|prüfen|pruefen)$/i.test(desc) || !desc || desc.length>160)
      return {intent:'task_clarify',dueDate:when.date,dateLabel:when.label};
    // Strongly bound to actionable statement; never infer an amount/recipient.
    const hasVerb=/\b(?:kaufen|holen|besorgen|zahlen|bezahlen|überweisen|ueberweisen|machen|erledigen|abholen|anrufen|buchen|schicken|abgeben|bestellen|prüfen|pruefen|einreichen|kündigen|kuendigen|putzen|waschen|einzahlen)\b/i.test(desc);
    if(!hasVerb) return {intent:'task_clarify',dueDate:when.date,dateLabel:when.label};
    const type=/\b(?:bezahlen|zahlen|überweisen|ueberweisen|einzahlen)\b/i.test(desc)?'payment_reminder':
      /\b(?:kaufen|holen|besorgen|bestellen)\b/i.test(desc)?'purchase_reminder':'task';
    if(/[\n<>[\]{}]/.test(desc))return null;
    return {intent:'task_create',title:desc[0].toLocaleUpperCase('de')+desc.slice(1),
      dueDate:when.date,dateLabel:when.label,kind:type};
  }
  function parsePhotoReference(raw,now=new Date()){
    const s=stripWake(raw);
    if(!/^(?:(?:ich|wir)\s+)?(?:muss|müssen|soll|möchte|moechte|will)\s+(?:das|dies|es)\b|^(?:das|dies|es)\s+(?:muss|soll)\b/i.test(s))return null;
    const when=dueDate(s,now);
    if(!when)return null;
    const action=/\b(?:bezahlen|zahlen|überweisen|ueberweisen)\b/i.test(s)?'payment_reminder':
      /\b(?:kaufen|besorgen|bestellen)\b/i.test(s)?'purchase_reminder':
      /\b(?:machen|erledigen|prüfen|pruefen|abgeben)\b/i.test(s)?'task':'unknown';
    if(action==='unknown')return null;
    return {intent:'photo_reference',kind:action,dueDate:when.date,dateLabel:when.label};
  }
  return {todayZurich,plusDays,dueDate,stripWake,parseScheduledCommand,parsePhotoReference};
});