/* Personal calendar: device-only appointments. No provider credentials or API calls. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = 'dgos.personal.events.v1';
  const zone = 'Europe/Zurich';
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: zone, year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const date = value => new Date(value + 'T12:00:00Z');
  const iso = value => value.toISOString().slice(0,10);
  const add = (value, n) => { const d = date(value); d.setUTCDate(d.getUTCDate()+n); return iso(d); };
  const format = (value, options) => new Intl.DateTimeFormat('de-CH', {timeZone:'UTC', ...options}).format(date(value));
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date(value).getTime()) && iso(date(value)) === value;
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  let selected = today(), view = 'month', events = [], storageReadable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(saved) || !saved.every(e => e && typeof e.id==='string' && typeof e.title==='string' && e.title.trim() && validDate(e.date) && validTime(e.start) && validTime(e.end) && e.end>e.start)) throw Error('invalid');
    events = saved;
  } catch (_) { storageReadable = false; $('personalNotice').textContent = 'Gespeicherte Termine konnten nicht gelesen werden. Neue Einträge sind gesperrt, damit nichts überschrieben wird.'; }
  const node = (tag, text, cls) => { const el = document.createElement(tag); if(text!==undefined) el.textContent=text; if(cls) el.className=cls; return el; };
  function persist(next) {
    if(!storageReadable) return false;
    try { localStorage.setItem(key,JSON.stringify(next)); events=next; $('personalNotice').textContent='Auf diesem Gerät gespeichert · keine Cloud-Synchronisierung.'; return true; }
    catch (_) { $('personalNotice').textContent='Speichern nicht möglich. Browser-Speicher ist gesperrt oder voll.'; return false; }
  }
  function range() {
    if(view==='day') return [selected];
    let first, count;
    if(view==='week') {first=add(selected,-((date(selected).getUTCDay()+6)%7));count=7;}
    else {first=selected.slice(0,7)+'-01';first=add(first,-((date(first).getUTCDay()+6)%7));count=42;}
    return Array.from({length:count},(_,i)=>add(first,i));
  }
  function render() {
    const days=range(), grid=$('calendarGrid'); grid.replaceChildren(); grid.dataset.view=view;
    $('calendarPeriod').textContent=view==='month'?format(selected,{month:'long',year:'numeric'}):view==='day'?format(selected,{day:'numeric',month:'long',year:'numeric'}):format(days[0],{day:'numeric',month:'short'})+' – '+format(days[6],{day:'numeric',month:'short',year:'numeric'});
    document.querySelectorAll('[data-calendar-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.calendarView===view)));
    if(view!=='day') ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d=>grid.append(node('span',d,'personal-weekday')));
    days.forEach(day=>{
      const items=events.filter(e=>e.date===day).sort((a,b)=>a.start.localeCompare(b.start));
      const cell=node('button',undefined,'personal-day');cell.type='button';cell.classList.toggle('outside',day.slice(0,7)!==selected.slice(0,7));cell.classList.toggle('is-today',day===today());cell.setAttribute('aria-pressed',String(day===selected));cell.setAttribute('aria-label',format(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+items.length+' lokale Termine');
      cell.append(node('span',String(Number(day.slice(-2))),'personal-day-number'));
      items.slice(0,2).forEach(e=>cell.append(node('span',e.start+' '+e.title,'personal-event-chip')));
      if(items.length>2) cell.append(node('small','+'+(items.length-2)+' weitere'));
      cell.addEventListener('click',()=>{selected=day;render();});grid.append(cell);
    });
    $('personalCount').textContent=String(events.filter(e=>e.date===today()).length);
    $('agendaHeading').textContent=view==='week'?'Termine dieser Woche':format(selected,{weekday:'long',day:'numeric',month:'long'});
    const list=$('personalAgenda');list.replaceChildren();
    const items=events.filter(e=>view==='week'?days.includes(e.date):e.date===selected).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    if(!items.length) list.append(node('p','Keine lokalen Termine für diesen Zeitraum. Deine verbundenen Kalender erscheinen nach der Einrichtung.','personal-empty'));
    items.forEach(e=>{
      const row=node('div',undefined,'personal-agenda-row'), info=node('div');
      info.append(node('strong',e.title),node('small',format(e.date,{day:'numeric',month:'short'})+' · '+e.start+'–'+e.end+' · Auf diesem Gerät'));
      const del=node('button','Entfernen');del.type='button';del.setAttribute('aria-label',e.title+' entfernen');del.addEventListener('click',()=>{if(persist(events.filter(item=>item.id!==e.id))) render();});row.append(info,del);list.append(row);
    });
  }
  function move(direction) {
    if(view==='month') {const d=date(selected.slice(0,7)+'-01');d.setUTCMonth(d.getUTCMonth()+direction);selected=iso(d);}
    else selected=add(selected,direction*(view==='week'?7:1));
    render();
  }
  $('calendarPrevious').onclick=()=>move(-1);$('calendarNext').onclick=()=>move(1);
  $('calendarToday').onclick=()=>{selected=today();render();};
  document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{view=b.dataset.calendarView;render();});
  $('newLocalEvent').disabled=!storageReadable;
  $('newLocalEvent').onclick=()=>{$('localEventForm').reset();$('localEventDate').value=selected;$('localEventError').textContent='';$('localEventDialog').showModal();$('localEventTitle').focus();};
  $('closeLocalEvent').onclick=()=>$('localEventDialog').close();
  $('localEventForm').onsubmit=e=>{
    e.preventDefault();
    const entry={id:crypto.randomUUID(),title:$('localEventTitle').value.trim(),date:$('localEventDate').value,start:$('localEventStart').value,end:$('localEventEnd').value};
    if(!entry.title || !validDate(entry.date) || !validTime(entry.start) || !validTime(entry.end) || entry.end<=entry.start) {$('localEventError').textContent='Bitte Titel und Datum prüfen. Das Ende muss nach dem Beginn am gleichen Tag liegen.';return;}
    if(persist([...events,entry])) {selected=entry.date;$('localEventDialog').close();render();}
    else $('localEventError').textContent='Der Termin konnte nicht gespeichert werden.';
  };
  function greet() {
    const now=new Date(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
    $('personalGreeting').textContent=(hour<11?'Guten Morgen':hour<18?'Guten Tag':'Guten Abend')+', Gomes.';
    $('personalDate').textContent=new Intl.DateTimeFormat('de-CH',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)+' · Europe/Zurich';
    $('personalCount').textContent=String(events.filter(e=>e.date===today()).length);
  }
  greet();render();setInterval(greet,60000);
})();
