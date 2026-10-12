/* DG OS | Health: date attached to REAL WHOOP sleep (Europe/Zurich).
 * Sleep is attributed to the LOCAL WAKE-UP DATE. Never assume that a
 * successful sync means the most recent night belongs to today.
 * Does not modify original WHOOP numbers, API calls, or current selection.
 */
(() => {
  'use strict';
  const card=document.querySelector('#personalHealth .dgh-sleep-card');
  const health=document.getElementById('personalHealth');
  if(!card||!health||card.querySelector('.dgh-sleep-day-chip'))return;

  const pill=document.createElement('div');
  pill.className='dgh-sleep-day-chip';
  pill.dataset.kind='pending';
  pill.setAttribute('role','note');
  const title=document.createElement('span');
  title.className='dgh-day-label';
  const dateText=document.createElement('small');
  dateText.className='dgh-day-date';
  pill.append(title,dateText);
  card.prepend(pill);

  const isoFmt=new Intl.DateTimeFormat('sv-SE',{
    timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
  });
  const humanFmt=new Intl.DateTimeFormat('de-CH',{
    timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric'
  });
  const today=()=>isoFmt.format(new Date());

  function apply(kind,iso,label){
    pill.dataset.kind=kind;
    title.textContent=label;
    dateText.textContent=iso?humanFmt.format(new Date(iso+'T12:00:00Z')):'';
    pill.setAttribute('aria-label',dateText.textContent
      ?label+' · '+dateText.textContent
      :label);
  }
  function fromWake(wake){
    if(typeof wake!=='string')return false;
    const dt=new Date(wake);
    if(!Number.isFinite(dt.getTime()))return false;
    const iso=isoFmt.format(dt);
    if(iso===today())apply('today',iso,'HEUTE');
    else apply('previous',iso,'LETZTER SCHLAF');
    return true;
  }
  apply('pending','','SCHLAFDATEN');

  window.addEventListener('dgos-whoop-updated',event=>{
    const sleep=event.detail?.sleep;
    // The authenticated WHOOP endpoint returns the wake timestamp as
    // sleep.end; a sync timestamp alone is NOT the recorded sleep date.
    if(!fromWake(sleep?.end))apply('pending','','DATUM OFFEN');
  });
  window.addEventListener('dgos-whoop-history-loaded',event=>{
    // Real live API sleep (if available) takes precedence over archive data.
    // The archive date is shown as saved history, never as a live metric.
    if(health.dataset.whoopSync==='live')return;
    const iso=event.detail?.latestDate;
    if(typeof iso!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(iso))return;
    const parsed=new Date(iso+'T12:00:00Z');
    if(!Number.isFinite(parsed.getTime())||isoFmt.format(parsed)!==iso)return;
    apply('history',iso,'GESPEICHERT');
  });
})();
