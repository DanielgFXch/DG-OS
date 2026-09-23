/* Personal calendar: local appointments + Google Calendar through the secure DG OS Hub. */
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
  let selected = today(), view = 'day', events = [], cloudEvents = [], jarvisEvents = [], storageReadable = true;
  let hubState = null, cloudRangeKey = '', cloudRequestId = 0, suppressCloudRefresh = false, jarvisRangeKey = '', jarvisRequestId = 0;

  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(saved) || !saved.every(e => e && typeof e.id==='string' && typeof e.title==='string' && e.title.trim() && validDate(e.date) && validTime(e.start) && validTime(e.end) && e.end>e.start)) throw Error('invalid');
    events = saved;
  } catch (_) {
    storageReadable = false;
    $('personalNotice').textContent = 'Gespeicherte Termine konnten nicht gelesen werden. Neue lokale Einträge sind gesperrt, damit nichts überschrieben wird.';
  }

  const node = (tag, text, cls) => { const el = document.createElement(tag); if(text!==undefined) el.textContent=text; if(cls) el.className=cls; return el; };

  function persist(next) {
    if(!storageReadable) return false;
    try {
      localStorage.setItem(key,JSON.stringify(next));
      events=next;
      $('personalNotice').textContent='Lokaler Termin auf diesem Gerät gespeichert.';
      return true;
    } catch (_) {
      $('personalNotice').textContent='Speichern nicht möglich. Browser-Speicher ist gesperrt oder voll.';
      return false;
    }
  }

  function range() {
    if(view==='day') return [selected];
    let first, count;
    if(view==='week') { first=add(selected,-((date(selected).getUTCDay()+6)%7)); count=7; }
    else { first=selected.slice(0,7)+'-01'; first=add(first,-((date(first).getUTCDay()+6)%7)); count=42; }
    return Array.from({length:count},(_,i)=>add(first,i));
  }

  function googleAccountLabel(account) {
    return account === 'business' ? 'Business Google' : 'Privat Google';
  }

  function allEvents() {
    return [...events.map(e=>Object.assign({source:'local'},e)), ...cloudEvents, ...jarvisEvents];
  }

  function render() {
    const days=range(), grid=$('calendarGrid'); grid.replaceChildren(); grid.dataset.view=view;
    const merged=allEvents();
    $('calendarPeriod').textContent=view==='month'?format(selected,{month:'long',year:'numeric'}):view==='day'?format(selected,{day:'numeric',month:'long',year:'numeric'}):format(days[0],{day:'numeric',month:'short'})+' – '+format(days[6],{day:'numeric',month:'short',year:'numeric'});
    document.querySelectorAll('[data-calendar-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.calendarView===view)));
    if(view!=='day') ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d=>grid.append(node('span',d,'personal-weekday')));

    days.forEach(day=>{
      const items=merged.filter(e=>e.date===day).sort((a,b)=>a.start.localeCompare(b.start));
      const cell=node('button',undefined,'personal-day');
      cell.type='button';
      cell.classList.toggle('outside',day.slice(0,7)!==selected.slice(0,7));
      cell.classList.toggle('is-today',day===today());
      cell.setAttribute('aria-pressed',String(day===selected));
      cell.setAttribute('aria-label',format(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', '+items.length+' Termine');
      cell.append(node('span',String(Number(day.slice(-2))),'personal-day-number'));
      items.slice(0,2).forEach(e=>{
        const prefix=e.allDay?'':e.start+' ';
        const chip=node('span',prefix+e.title,'personal-event-chip');
        if(e.source==='google') chip.classList.add('is-google');
        if(e.source==='jarvis') chip.classList.add('is-jarvis');
        cell.append(chip);
      });
      if(items.length>2) cell.append(node('small','+'+(items.length-2)+' weitere'));
      cell.addEventListener('click',()=>{selected=day;render();});
      grid.append(cell);
    });

    $('personalCount').textContent=String(merged.filter(e=>e.date===today()).length);
    $('agendaHeading').textContent=view==='week'?'Termine dieser Woche':format(selected,{weekday:'long',day:'numeric',month:'long'});
    const list=$('personalAgenda');list.replaceChildren();
    const items=merged.filter(e=>view==='week'?days.includes(e.date):e.date===selected).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    if(!items.length) list.append(node('p','Keine Termine für diesen Zeitraum.','personal-empty'));

    items.forEach(e=>{
      const row=node('div',undefined,'personal-agenda-row'), info=node('div');
      const source=e.source==='google'?(googleAccountLabel(e.account)+(e.calendarName?' · '+e.calendarName:'')):e.source==='jarvis'?'Jarvis · Telegram':'Auf diesem Gerät';
      const when=e.allDay?'Ganztägig':e.singleTime?e.start+' Uhr':e.start+'–'+e.end;
      info.append(node('strong',e.title),node('small',format(e.date,{day:'numeric',month:'short'})+' · '+when+' · '+source));
      row.append(info);
      if(e.source==='local'){
        const del=node('button','Entfernen');del.type='button';del.setAttribute('aria-label',e.title+' entfernen');
        del.addEventListener('click',()=>{if(persist(events.filter(item=>item.id!==e.id))) render();});
        row.append(del);
      }
      list.append(row);
    });

    if(!suppressCloudRefresh) refreshCloudForDays(days);
    refreshJarvisForDays(days);
  }

  function jarvisEventToLocal(event) {
    if(!event || !validDate(event.date) || typeof event.title!=='string' || !event.title.trim()) return null;
    const time=typeof event.time==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.time)?event.time:null;
    return {
      id:'jarvis:'+event.id,
      title:event.title.trim(),
      date:event.date,
      start:time||'00:00',
      end:time||'23:59',
      allDay:!time,
      singleTime:Boolean(time),
      source:'jarvis'
    };
  }

  function jarvisSession() {
    return localStorage.getItem('dgos.deviceSession') || localStorage.getItem('dgos.whoopSession') || '';
  }

  async function refreshJarvisForDays(days, force) {
    if(!days.length) return;
    const token=jarvisSession();
    if(!token) {
      jarvisEvents=[];
      return;
    }
    const key=days[0]+'|'+days[days.length-1];
    if(!force && jarvisRangeKey===key) return;
    jarvisRangeKey=key;
    const requestId=++jarvisRequestId;

    try {
      const params=new URLSearchParams({start:days[0],end:days[days.length-1]});
      const response=await fetch('https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/tasks/calendar?'+params.toString(),{
        cache:'no-store',
        headers:{Authorization:'Bearer '+token}
      });
      if(!response.ok) throw Error('jarvis_calendar_failed');
      const data=await response.json();
      if(requestId!==jarvisRequestId) return;
      jarvisEvents=(Array.isArray(data.events)?data.events:[]).map(jarvisEventToLocal).filter(Boolean);
      render();
    } catch (_) {
      if(requestId!==jarvisRequestId) return;
      jarvisEvents=[];
    }
  }

  function move(direction) {
    if(view==='month') {const d=date(selected.slice(0,7)+'-01');d.setUTCMonth(d.getUTCMonth()+direction);selected=iso(d);}
    else selected=add(selected,direction*(view==='week'?7:1));
    render();
  }

  function googleEventToLocal(event) {
    if(!event || !event.start) return null;
    if(event.start.date) {
      return {
        id:'google:'+event.account+':'+event.id,
        title:event.title||'(Ohne Titel)',
        date:event.start.date,
        start:'00:00',
        end:'23:59',
        allDay:true,
        source:'google',
        account:event.account,
        calendarName:event.calendarName||'Google Kalender'
      };
    }
    const startValue=event.start.dateTime, endValue=event.end&&event.end.dateTime;
    if(!startValue || !endValue) return null;
    const startDate=new Date(startValue), endDate=new Date(endValue);
    if(!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return null;
    const dayFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
    const timeFmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    return {
      id:'google:'+event.account+':'+event.id,
      title:event.title||'(Ohne Titel)',
      date:dayFmt.format(startDate),
      start:timeFmt.format(startDate),
      end:timeFmt.format(endDate),
      allDay:false,
      source:'google',
      account:event.account,
      calendarName:event.calendarName||'Google Kalender'
    };
  }

  async function readHubStatus() {
    try {
      const response=await fetch('./api/hub/status',{cache:'no-store',credentials:'same-origin'});
      const type=response.headers.get('content-type')||'';
      if(!response.ok || !type.includes('application/json')) throw Error('not_hub');
      hubState=await response.json();
    } catch (_) {
      hubState=null;
    }
    updateCalendarTargets();
    return hubState;
  }

  function connectedGoogleAccounts() {
    const accounts=hubState&&hubState.googleWorkspace&&Array.isArray(hubState.googleWorkspace.accounts)?hubState.googleWorkspace.accounts:[];
    if(!hubState||!hubState.googleWorkspace||!hubState.googleWorkspace.authenticated) return [];
    return accounts.filter(item=>item&&item.calendarConnected).map(item=>item.id);
  }

  function updateCalendarTargets() {
    const target=$('localEventTarget');
    if(!target) return;
    ['business','private'].forEach(id=>{
      const option=target.querySelector('option[value="'+id+'"]');
      if(!option) return;
      const connected=connectedGoogleAccounts().includes(id);
      option.disabled=!connected;
      option.textContent=(id==='business'?'Business Google':'Privat Google')+(connected?'':' · nicht verbunden');
    });
  }

  async function refreshCloudForDays(days, force) {
    if(!days.length) return;
    const key=days[0]+'|'+days[days.length-1];
    if(!force && cloudRangeKey===key) return;
    cloudRangeKey=key;
    const requestId=++cloudRequestId;

    if(!hubState) await readHubStatus();
    const accounts=connectedGoogleAccounts();
    if(!accounts.length) {
      cloudEvents=[];
      if(requestId===cloudRequestId) renderNoCloudLoop();
      return;
    }

    const timeMin=new Date(add(days[0],-1)+'T00:00:00Z').toISOString();
    const timeMax=new Date(add(days[days.length-1],2)+'T00:00:00Z').toISOString();
    try {
      const batches=await Promise.all(accounts.map(async account=>{
        const params=new URLSearchParams({account,timeMin,timeMax});
        const response=await fetch('./api/calendar/events?'+params.toString(),{cache:'no-store',credentials:'same-origin'});
        if(!response.ok) throw Error('calendar_fetch_failed');
        const data=await response.json();
        return Array.isArray(data.events)?data.events:[];
      }));
      if(requestId!==cloudRequestId) return;
      const visible=new Set(days);
      cloudEvents=batches.flat().map(googleEventToLocal).filter(Boolean).filter(e=>visible.has(e.date));
      $('personalNotice').textContent='Google Kalender synchronisiert · lokale Termine bleiben auf diesem Gerät.';
      renderNoCloudLoop();
    } catch (_) {
      if(requestId!==cloudRequestId) return;
      cloudEvents=[];
      $('personalNotice').textContent='Google Kalender konnte gerade nicht geladen werden. Lokale Termine bleiben verfügbar.';
      renderNoCloudLoop();
    }
  }

  function renderNoCloudLoop() {
    suppressCloudRefresh=true;
    try { render(); }
    finally { suppressCloudRefresh=false; }
  }

  $('calendarPrevious').onclick=()=>move(-1);
  $('calendarNext').onclick=()=>move(1);
  $('calendarToday').onclick=()=>{selected=today();render();};
  document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{view=b.dataset.calendarView;cloudRangeKey='';render();});

  $('newLocalEvent').disabled=!storageReadable;
  $('newLocalEvent').onclick=()=>{
    $('localEventForm').reset();
    $('localEventDate').value=selected;
    $('localEventTarget').value='local';
    $('localEventError').textContent='';
    updateCalendarTargets();
    $('localEventDialog').showModal();
    $('localEventTitle').focus();
  };
  $('closeLocalEvent').onclick=()=>$('localEventDialog').close();

  $('localEventForm').onsubmit=async e=>{
    e.preventDefault();
    const entry={
      id:crypto.randomUUID(),
      title:$('localEventTitle').value.trim(),
      date:$('localEventDate').value,
      start:$('localEventStart').value,
      end:$('localEventEnd').value
    };
    const target=$('localEventTarget').value;
    if(!entry.title || !validDate(entry.date) || !validTime(entry.start) || !validTime(entry.end) || entry.end<=entry.start) {
      $('localEventError').textContent='Bitte Titel und Datum prüfen. Das Ende muss nach dem Beginn am gleichen Tag liegen.';
      return;
    }

    if(target==='local'){
      if(persist([...events,entry])) {selected=entry.date;$('localEventDialog').close();render();}
      else $('localEventError').textContent='Der Termin konnte nicht gespeichert werden.';
      return;
    }

    if(!['business','private'].includes(target) || !connectedGoogleAccounts().includes(target)) {
      $('localEventError').textContent='Dieser Google Kalender ist noch nicht mit dem DG OS Hub verbunden.';
      return;
    }

    const submit=e.submitter; if(submit) submit.disabled=true;
    $('localEventError').textContent='Termin wird in Google Kalender gespeichert …';
    try {
      const response=await fetch('./api/calendar/events',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({account:target,title:entry.title,date:entry.date,start:entry.start,end:entry.end,calendarId:'primary'})
      });
      if(!response.ok) throw Error('create_failed');
      selected=entry.date;
      $('localEventDialog').close();
      cloudRangeKey='';
      await readHubStatus();
      render();
    } catch (_) {
      $('localEventError').textContent='Google-Termin konnte nicht gespeichert werden. Verbindung und Freigabe prüfen.';
    } finally {
      if(submit) submit.disabled=false;
    }
  };

  function greet() {
    const now=new Date(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
    $('personalGreeting').textContent=(hour>=5&&hour<11?'Guten Morgen':hour>=11&&hour<18?'Guten Tag':'Guten Abend')+', Gomes.';
    $('personalDate').textContent=new Intl.DateTimeFormat('de-CH',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)+' · Europe/Zurich';
    $('personalCount').textContent=String(allEvents().filter(e=>e.date===today()).length);
  }

  readHubStatus().finally(()=>{greet();render();});
  window.addEventListener('focus',()=>{jarvisRangeKey='';render();});
  window.addEventListener('dgos-device-session',()=>{jarvisRangeKey='';render();});
  setInterval(()=>{greet();jarvisRangeKey='';render();},60000);
})();

/* Secure Gmail center: same-origin DG OS server only. No OAuth tokens in browser storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const accounts = {
    business: { label: 'Business', email: 'imdanielgomes@gmail.com', statusId: 'emailBusinessStatus' },
    private: { label: 'Privat', email: 'gomesdani1999@gmail.com', statusId: 'emailPrivateStatus' }
  };
  const state = { apiAvailable:false,status:null,account:null,filter:'inbox',query:'',selected:new Set(),message:null,reply:null };
  const workspace = $('personalEmailWorkspace');
  if (!workspace) return;

  function remoteServerBase() {
    try {
      const value = localStorage.getItem('dgos.marketServerUrl') || '';
      if (!value) return '';
      return new URL(value.includes('://') ? value : 'https://' + value).origin;
    } catch (_) { return ''; }
  }
  function currentAccount(){ return state.account ? accounts[state.account] : null; }
  function statusAccount(id){ return state.status && Array.isArray(state.status.accounts) ? state.status.accounts.find(a=>a.id===id) : null; }
  function setNotice(text,tone){ const el=$('emailWorkspaceNotice'); el.textContent=text||''; el.dataset.tone=tone||''; }

  function setCardStatuses() {
    Object.entries(accounts).forEach(([id,account])=>{
      const el=$(account.statusId); if(!el) return;
      if(!state.apiAvailable){ el.textContent='Direktlink bereit · interne Ansicht nicht verbunden'; return; }
      if(!state.status||!state.status.configured){ el.textContent='Google OAuth noch nicht konfiguriert'; return; }
      const item=statusAccount(id);
      el.textContent=state.status.authenticated&&item&&item.connected?'Mit DG OS verbunden':'Google-Anmeldung erforderlich';
    });
  }

  async function api(path,options){
    const response=await fetch(path,Object.assign({cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}},options||{}));
    let body=null; try{body=await response.json();}catch(_){}
    if(!response.ok){const err=new Error(body&&body.error?body.error:'request_failed');err.status=response.status;throw err;}
    return body;
  }

  async function probeStatus(){
    try{
      const response=await fetch('./api/gmail/status',{cache:'no-store',credentials:'same-origin'});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json')) throw new Error('not_server_hosted');
      state.status=await response.json();state.apiAvailable=true;
      $('emailHubStatus').textContent=state.status.configured?'Sichere Gmail-Anbindung über den DG OS Server verfügbar.':'DG OS Server erkannt · Google Gmail OAuth ist noch nicht konfiguriert.';
    }catch(_){
      state.apiAvailable=false;state.status=null;
      const remote=remoteServerBase();
      $('emailHubStatus').textContent=remote?'Die interne Mailansicht läuft aus Sicherheitsgründen nur in der DG OS Server-Version. Direkte Gmail-Links bleiben verfügbar.':'Interne Mailansicht noch nicht verbunden. Direkte Gmail-Links bleiben verfügbar.';
    }
    setCardStatuses();
  }

  function setWorkspaceReady(ready){
    const toolbar=document.querySelector('.personal-email-toolbar');
    const layout=document.querySelector('.personal-email-layout');
    if(toolbar) toolbar.classList.toggle('hidden',!ready);
    if(layout) layout.classList.toggle('hidden',!ready);
    $('emailNewsletterActions').classList.add('hidden');
  }

  function updateWorkspaceControls(){
    const account=currentAccount();
    $('emailWorkspaceTitle').textContent=account?account.label+' E-Mail':'Postfach';
    $('emailWorkspaceAddress').textContent=account?account.email:'';
    const connect=$('emailConnect'),compose=$('emailCompose');
    if(!account){connect.disabled=true;compose.hidden=true;setWorkspaceReady(false);return;}

    if(!state.apiAvailable){
      const remote=remoteServerBase();
      connect.hidden=false;
      connect.disabled=false;
      connect.textContent=remote?'Sichere Server-Version öffnen':'Direkt in Gmail öffnen';
      compose.hidden=true;
      setWorkspaceReady(false);
      setNotice(remote
        ? 'Die interne Mailansicht ist hier nicht aktiv. Öffne die sichere DG OS Server-Version oder nutze Gmail direkt.'
        : 'Die sichere DG OS Mail-Verbindung ist noch nicht eingerichtet. Bis dahin kannst du dieses Postfach direkt in Gmail öffnen.','warn');
      return;
    }

    if(!state.status||!state.status.configured){
      connect.hidden=false;
      connect.disabled=true;
      connect.textContent='Google OAuth noch nicht eingerichtet';
      compose.hidden=true;
      setWorkspaceReady(false);
      setNotice('Google Gmail OAuth ist auf dem DG OS Server noch nicht konfiguriert. Es werden keine Maildaten abgerufen.','warn');
      return;
    }

    const item=statusAccount(state.account),connected=Boolean(state.status.authenticated&&item&&item.connected);
    connect.hidden=connected;
    connect.disabled=false;
    connect.textContent='Mit Google verbinden';
    compose.hidden=!connected;
    setWorkspaceReady(connected);
    if(!connected)setNotice('Dieses Postfach ist noch nicht mit DG OS verbunden. Verbinde es einmal sicher mit Google.','warn');
  }

  function showWorkspace(accountId){
    state.account=accountId;state.filter='inbox';state.query='';state.selected.clear();state.message=null;state.reply=null;
    workspace.classList.remove('hidden');document.body.classList.add('email-window-open');
    document.querySelectorAll('[data-email-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.emailFilter==='inbox')));
    $('emailSearch').value='';
    updateWorkspaceControls();
    $('emailMessageDetail').innerHTML='<p class="personal-empty">Öffne eine E-Mail, um sie hier zu lesen.</p>';
    if(state.apiAvailable&&state.status&&state.status.authenticated){const item=statusAccount(accountId);if(item&&item.connected)loadMessages();}
    $('emailCloseWorkspace').focus();
  }

  function closeWorkspace(){
    workspace.classList.add('hidden');document.body.classList.remove('email-window-open');
  }

  function formatMailDate(value){
    if(!value)return'';const date=new Date(Number(value));if(!Number.isFinite(date.getTime()))return'';
    return new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date);
  }
  function clearList(text){const list=$('emailMessageList');list.replaceChildren();const p=document.createElement('p');p.className='personal-empty';p.textContent=text;list.append(p);}
  function updateSelectedCount(){$('emailSelectedCount').textContent=state.selected.size+' ausgewählt';$('emailTrashSelected').disabled=state.selected.size===0;}

  function renderMessages(data){
    const list=$('emailMessageList');list.replaceChildren();state.selected.clear();updateSelectedCount();
    const messages=Array.isArray(data.messages)?data.messages:[];
    if(!messages.length){clearList(state.filter==='newsletters'?'Keine Newsletter in den geprüften Inbox-Mails erkannt.':'Keine E-Mails für diesen Filter.');return;}
    messages.forEach(message=>{
      const row=document.createElement('div');row.className='personal-email-message'+(message.unread?' is-unread':'');
      if(state.filter==='newsletters'){
        const check=document.createElement('input');check.type='checkbox';check.className='personal-email-select';check.setAttribute('aria-label',(message.subject||'Newsletter')+' auswählen');
        check.addEventListener('change',()=>{if(check.checked)state.selected.add(message.id);else state.selected.delete(message.id);updateSelectedCount();});row.append(check);
      }
      const open=document.createElement('button');open.type='button';open.className='personal-email-message-open';
      const top=document.createElement('span');top.className='personal-email-message-top';
      const from=document.createElement('strong');from.textContent=message.from||'Unbekannter Absender';
      const date=document.createElement('time');date.textContent=formatMailDate(message.internalDate);top.append(from,date);
      const subject=document.createElement('span');subject.className='personal-email-message-subject';subject.textContent=message.subject||'(Kein Betreff)';
      const snippet=document.createElement('small');snippet.textContent=message.snippet||'';open.append(top,subject,snippet);open.addEventListener('click',()=>openMessage(message.id));row.append(open);list.append(row);
    });
  }

  async function loadMessages(){
    if(!state.account)return;clearList('E-Mails werden geladen …');$('emailNewsletterActions').classList.toggle('hidden',state.filter!=='newsletters');
    setNotice(state.filter==='newsletters'?'Newsletter werden anhand von Gmail Promotions und Mailinglisten-Metadaten erkannt. Es wird nichts automatisch gelöscht.':'Postfach wird geladen …','');
    const params=new URLSearchParams({account:state.account,filter:state.filter});if(state.query)params.set('q',state.query);
    try{
      const data=await api('./api/gmail/messages?'+params.toString());renderMessages(data);
      setNotice(state.filter==='newsletters'?'Newsletter-Filter aktiv · Löschen verschiebt ausgewählte Mails nur in den Gmail-Papierkorb.':'Postfach aktuell.','ok');
    }catch(err){
      clearList('E-Mails konnten nicht geladen werden.');
      if(err.status===401){await probeStatus();updateWorkspaceControls();setNotice('Google-Sitzung erforderlich. Verbinde das Postfach erneut.','warn');}
      else setNotice('Abruf fehlgeschlagen. Es wurden keine Daten erfunden oder zwischengespeichert.','error');
    }
  }

  async function openMessage(id){
    const detail=$('emailMessageDetail');detail.innerHTML='<p class="personal-empty">E-Mail wird geladen …</p>';
    try{
      const message=await api('./api/gmail/message/'+encodeURIComponent(id)+'?account='+encodeURIComponent(state.account));state.message=message;state.reply=null;detail.replaceChildren();
      const header=document.createElement('div');header.className='personal-email-detail-head';const titleWrap=document.createElement('div');
      const subject=document.createElement('h3');subject.textContent=message.subject||'(Kein Betreff)';const meta=document.createElement('p');meta.textContent=(message.from||'')+(message.date?' · '+message.date:'');titleWrap.append(subject,meta);
      const actions=document.createElement('div');actions.className='personal-email-detail-actions';const reply=document.createElement('button');reply.type='button';reply.textContent='Antworten';reply.addEventListener('click',()=>openReply(message));
      const trash=document.createElement('button');trash.type='button';trash.className='danger';trash.textContent='In Papierkorb';trash.addEventListener('click',()=>trashMessages([message.id]));actions.append(reply,trash);header.append(titleWrap,actions);
      const body=document.createElement('pre');body.className='personal-email-body';body.textContent=message.body||'';detail.append(header,body);
      if(message.hasAttachments){const note=document.createElement('p');note.className='personal-email-attachment-note';note.textContent='Diese E-Mail enthält Anhänge. Anhänge werden in dieser Version noch nicht in DG OS geladen.';detail.append(note);}
    }catch(_){detail.innerHTML='<p class="personal-empty">E-Mail konnte nicht geladen werden.</p>';}
  }

  function extractAddress(from){
    const match=String(from||'').match(/<([^<>@\s]+@[^<>@\s]+)>/);if(match)return match[1];
    const direct=String(from||'').match(/[\w.!#$%&'*+/=?^_\x60{|}~-]+@[\w.-]+\.[A-Za-z]{2,}/);return direct?direct[0]:'';
  }
  function openCompose(){
    if(!currentAccount())return;state.reply=null;$('emailComposeForm').reset();$('emailComposeHeading').textContent='Neue E-Mail';$('emailComposeFrom').textContent='Von: '+currentAccount().email;$('emailComposeError').textContent='';$('emailComposeDialog').showModal();$('emailComposeTo').focus();
  }
  function openReply(message){
    state.reply={threadId:message.threadId||'',inReplyTo:message.messageIdHeader||'',references:[message.references||'',message.messageIdHeader||''].filter(Boolean).join(' ').trim()};
    $('emailComposeForm').reset();$('emailComposeHeading').textContent='Antworten';$('emailComposeFrom').textContent='Von: '+currentAccount().email;$('emailComposeTo').value=extractAddress(message.from);$('emailComposeSubject').value=/^re:/i.test(message.subject||'')?message.subject:'Re: '+(message.subject||'');$('emailComposeError').textContent='';$('emailComposeDialog').showModal();$('emailComposeBody').focus();
  }

  async function trashMessages(ids){
    if(!ids.length)return;const count=ids.length;
    if(!window.confirm(count===1?'Diese E-Mail in den Gmail-Papierkorb verschieben?':count+' E-Mails in den Gmail-Papierkorb verschieben?'))return;
    try{
      await api('./api/gmail/trash',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({account:state.account,messageIds:ids})});
      state.selected.clear();state.message=null;$('emailMessageDetail').innerHTML='<p class="personal-empty">E-Mail wurde in den Papierkorb verschoben.</p>';setNotice(count+(count===1?' E-Mail wurde':' E-Mails wurden')+' in den Gmail-Papierkorb verschoben.','ok');await loadMessages();
    }catch(_){setNotice('Verschieben in den Papierkorb ist fehlgeschlagen. Keine E-Mail wurde bewusst permanent gelöscht.','error');}
  }

  document.querySelectorAll('[data-email-account]').forEach(button=>button.addEventListener('click',()=>showWorkspace(button.dataset.emailAccount)));
  document.querySelectorAll('[data-email-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.emailFilter;state.selected.clear();document.querySelectorAll('[data-email-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));loadMessages();}));
  $('emailConnect').addEventListener('click',()=>{
    if(!state.account)return;
    if(!state.apiAvailable){
      const remote=remoteServerBase();
      if(remote){window.location.href=remote+'/?emailAccount='+encodeURIComponent(state.account)+'#personalEmail';return;}
      const account=currentAccount();
      if(account)window.location.href='https://mail.google.com/mail/u/?authuser='+encodeURIComponent(account.email)+'#inbox';
      return;
    }
    window.location.href='./api/gmail/oauth/start?account='+encodeURIComponent(state.account);
  });
  $('emailCompose').addEventListener('click',openCompose);$('emailCloseWorkspace').addEventListener('click',closeWorkspace);$('emailTrashSelected').addEventListener('click',()=>trashMessages(Array.from(state.selected)));$('closeEmailCompose').addEventListener('click',()=>$('emailComposeDialog').close());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!workspace.classList.contains('hidden')&&!$('emailComposeDialog').open)closeWorkspace();});
  $('emailSearchForm').addEventListener('submit',event=>{event.preventDefault();state.query=$('emailSearch').value.trim();loadMessages();});
  $('emailComposeForm').addEventListener('submit',async event=>{
    event.preventDefault();$('emailComposeError').textContent='';
    const payload={account:state.account,to:$('emailComposeTo').value.trim(),subject:$('emailComposeSubject').value.trim(),body:$('emailComposeBody').value};if(state.reply)Object.assign(payload,state.reply);
    try{await api('./api/gmail/send',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});$('emailComposeDialog').close();setNotice('E-Mail wurde über '+currentAccount().label+' gesendet.','ok');}
    catch(_){$('emailComposeError').textContent='E-Mail konnte nicht gesendet werden. Bitte Empfänger, Verbindung und Google-Anmeldung prüfen.';}
  });

  (async()=>{
    await probeStatus();const params=new URLSearchParams(window.location.search);
    const connectedAccount=params.get('gmail')==='connected'?params.get('account'):null;
    const requestedAccount=params.get('emailAccount');
    if(connectedAccount&&accounts[connectedAccount]){showWorkspace(connectedAccount);history.replaceState(null,'',window.location.pathname+window.location.hash);}
    else if(requestedAccount&&accounts[requestedAccount]){showWorkspace(requestedAccount);history.replaceState(null,'',window.location.pathname+window.location.hash);}
    else if(params.get('gmail')==='error'){$('emailHubStatus').textContent='Google-Verbindung wurde nicht abgeschlossen. Es wurden keine Maildaten gespeichert.';history.replaceState(null,'',window.location.pathname+window.location.hash);}
  })();
})();


/* DG OS Hub connector — one Jarvis bridge for personal services. */
(() => {
  'use strict';
  const input=document.getElementById('personalHubUrl');
  const button=document.getElementById('personalHubConnect');
  const status=document.getElementById('personalHubStatus');
  if(!input||!button||!status)return;
  const key='dgos.marketServerUrl';
  let localHubStatus=null;

  function normalize(value){
    const raw=String(value||'').trim();
    if(!raw)return'';
    try{
      const url=new URL(raw.includes('://')?raw:'https://'+raw);
      if(!/^https?:$/.test(url.protocol))return'';
      return url.origin;
    }catch(_){return'';}
  }

  function savedBase(){return normalize(localStorage.getItem(key)||'');}
  function setText(id,text){const el=document.getElementById(id);if(el)el.textContent=text;}

  function renderServices(data){
    localHubStatus=data||null;
    const workspace=data&&data.googleWorkspace;
    const accounts=workspace&&Array.isArray(workspace.accounts)?workspace.accounts:[];
    for(const id of ['business','private']){
      const item=accounts.find(account=>account.id===id);
      const target=id==='business'?'hubGoogleBusiness':'hubGooglePrivate';
      const buttonEl=document.querySelector('[data-google-connect="'+id+'"]');
      let text='Gmail + Kalender · nicht verbunden';
      if(workspace&&workspace.configured){
        if(workspace.authenticated&&item&&item.gmailConnected&&item.calendarConnected) text='Gmail + Kalender · verbunden';
        else if(workspace.authenticated&&item&&item.gmailConnected&&!item.calendarConnected) text='Gmail verbunden · Kalender neu freigeben';
        else text='Google-Anmeldung erforderlich';
      }else if(data&&data.server) text='Google OAuth noch nicht konfiguriert';
      else if(savedBase()) text='Hub gespeichert · Google noch verbinden';
      setText(target,text);
      if(buttonEl){
        buttonEl.textContent=(item&&item.gmailConnected&&item.calendarConnected)?'Neu verbinden':'Verbinden';
        buttonEl.disabled=Boolean(data&&data.server&&workspace&&!workspace.configured);
      }
    }
    if(data&&data.services){
      const telegram=Boolean(data.services.telegram&&data.services.telegram.connected);
      const whoop=data.services.whoop||null;
      setText('hubTelegramStatus',telegram?'Bot + Chat · verbunden':'Noch nicht verbunden');
      setText('hubTelegramBadge',telegram?'ON':'OFF');
      setText('hubWeatherStatus',data.services.weather&&data.services.weather.connected?'Open-Meteo · verbunden':'Nicht verbunden');
      setText('hubWhoopStatus',whoop&&whoop.authenticated?'WHOOP · verbunden':whoop&&whoop.configured?'OAuth · bereit':'OAuth · nicht konfiguriert');
      setText('hubWhoopBadge',whoop&&whoop.authenticated?'ON':'OFF');
    }else{
      setText('hubTelegramStatus',savedBase()?'Status in Server-Version sichtbar':'Hub erforderlich');
      setText('hubTelegramBadge','OFF');
      setText('hubWeatherStatus','Open-Meteo · verbunden');
      setText('hubWhoopStatus',savedBase()?'Status in Server-Version sichtbar':'OAuth · nicht verbunden');
      setText('hubWhoopBadge','OFF');
    }
  }

  async function readLocalHubStatus(){
    try{
      const response=await fetch('./api/hub/status',{cache:'no-store',credentials:'same-origin'});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json'))throw Error('not_hub');
      const data=await response.json();
      renderServices(data);
      if(data&&data.server){
        const origin=window.location.origin;
        localStorage.setItem(key,origin);
        input.value=origin;
        status.textContent='Verbunden · '+window.location.host;
      }
      return data;
    }catch(_){
      renderServices(null);
      return null;
    }
  }

  function showSaved(){
    const saved=savedBase();
    if(saved){input.value=saved;status.textContent='Gespeichert · '+new URL(saved).host;}
    else status.textContent='Noch nicht verbunden';
  }

  async function testHub(base){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(base+'/api/health',{cache:'no-store',signal:controller.signal});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json'))throw new Error('invalid_hub');
      const data=await response.json();
      if(!data||typeof data!=='object')throw new Error('invalid_hub');
      return true;
    }finally{clearTimeout(timeout);}
  }

  button.addEventListener('click',async()=>{
    const base=normalize(input.value);
    if(!base){status.textContent='Bitte eine gültige Server-Adresse eingeben.';input.focus();return;}
    button.disabled=true;status.textContent='Verbindung wird geprüft …';
    try{
      await testHub(base);
      localStorage.setItem(key,base);
      input.value=base;
      status.textContent='Verbunden · '+new URL(base).host;
      renderServices(null);
      window.dispatchEvent(new CustomEvent('dgos-hub-connected',{detail:{url:base}}));
    }catch(_){
      status.textContent='Nicht erreichbar · Server-Adresse oder Deployment prüfen.';
    }finally{button.disabled=false;}
  });

  document.querySelectorAll('[data-google-connect]').forEach(connect=>{
    connect.addEventListener('click',()=>{
      const account=connect.dataset.googleConnect;
      let base='';
      if(localHubStatus&&localHubStatus.server) base=window.location.origin;
      else base=savedBase();
      if(!base){
        status.textContent='Zuerst den DG OS Hub verbinden.';
        input.focus();
        return;
      }
      window.location.href=base+'/api/gmail/oauth/start?account='+encodeURIComponent(account);
    });
  });

  showSaved();
  readLocalHubStatus();
})();


/* WHOOP health integration — free secure Supabase connector, no Railway required. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const connect=$('whoopConnect');
  if(!connect)return;

  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop';
  const DEVICE_SESSION_KEY='dgos.deviceSession';
  const LEGACY_SESSION_KEY='dgos.whoopSession';
  const CLAIM_KEY='dgos.whoopClaimSecret';

  function session(){return localStorage.getItem(LEGACY_SESSION_KEY)||'';}
  function deviceSession(){return localStorage.getItem(DEVICE_SESSION_KEY)||'';}
  function headers(token=session(),json=false){
    const h=token?{Authorization:'Bearer '+token}:{};
    if(json)h['Content-Type']='application/json';
    return h;
  }
  function randomClaimSecret(){
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    let raw='';bytes.forEach(value=>raw+=String.fromCharCode(value));
    return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function post(action,body){
    const response=await fetch(EDGE+'/'+action,{
      method:'POST',
      cache:'no-store',
      headers:headers('',true),
      body:JSON.stringify(body||{})
    });
    let data={};try{data=await response.json();}catch(_){}
    return {response,data};
  }
  function fmtHours(value){
    const n=Number(value); if(!Number.isFinite(n))return'—';
    const total=Math.max(0,Math.round(n*60));
    return Math.floor(total/60)+'h '+String(total%60).padStart(2,'0')+'m';
  }
  function fmt(value,digits,suffix){
    const n=Number(value);return Number.isFinite(n)?n.toFixed(digits)+(suffix||''):'—';
  }
  function set(id,text){const el=$(id);if(el)el.textContent=text;}
  function showDisconnected(text){
    set('whoopStatus','WHOOP · nicht verbunden');
    set('whoopHealthMeta',text||'Verbinde WHOOP einmal sicher mit DG OS. Danach werden deine Werte automatisch geladen.');
    $('whoopDetails')?.classList.add('hidden');
  }

  function render(data){
    const recovery=data&&data.recovery, sleep=data&&data.sleep, cycle=data&&data.cycle;
    set('whoopStatus','WHOOP · verbunden');
    set('whoopSleep',sleep?fmtHours(sleep.durationHours):'—');
    set('whoopSleepPerformance',sleep&&Number.isFinite(Number(sleep.performance))?'Sleep Performance '+Math.round(Number(sleep.performance))+'%':'—');
    set('whoopRecovery',recovery&&Number.isFinite(Number(recovery.score))?Math.round(Number(recovery.score))+'%':'—');
    set('whoopHrv',recovery&&Number.isFinite(Number(recovery.hrvMs))?'HRV '+Math.round(Number(recovery.hrvMs))+' ms':'HRV —');
    set('whoopStrain',cycle&&Number.isFinite(Number(cycle.strain))?Number(cycle.strain).toFixed(1):'—');
    set('whoopCalories',cycle&&Number.isFinite(Number(cycle.calories))?Math.round(Number(cycle.calories))+' kcal':'—');
    set('whoopRhr',recovery&&Number.isFinite(Number(recovery.restingHeartRate))?Math.round(Number(recovery.restingHeartRate))+' bpm':'—');
    set('whoopSpo2',recovery?fmt(recovery.spo2,1,'%'):'—');
    set('whoopSkinTemp',recovery?fmt(recovery.skinTempC,1,' °C'):'—');
    set('whoopEfficiency',sleep?fmt(sleep.efficiency,0,'%'):'—');
    set('whoopConsistency',sleep?fmt(sleep.consistency,0,'%'):'—');
    set('whoopRespiratory',sleep?fmt(sleep.respiratoryRate,1,'/min'):'—');
    set('whoopRem',sleep?fmtHours(sleep.remHours):'—');
    set('whoopDeep',sleep?fmtHours(sleep.deepHours):'—');
    set('whoopLight',sleep?fmtHours(sleep.lightHours):'—');
    set('whoopNeeded',sleep?fmtHours(sleep.neededHours):'—');
    set('whoopCycles',sleep&&sleep.cycles!=null?String(sleep.cycles):'—');
    set('whoopDisturbances',sleep&&sleep.disturbances!=null?String(sleep.disturbances):'—');

    const updated=data&&data.updatedAt?new Date(data.updatedAt):null;
    set('whoopHealthMeta',updated&&Number.isFinite(updated.getTime())
      ?'WHOOP automatisch aktualisiert · '+new Intl.DateTimeFormat('de-CH',{hour:'2-digit',minute:'2-digit'}).format(updated)
      :'WHOOP-Daten geladen.');
    $('whoopDetails')?.classList.remove('hidden');
    connect.textContent='WHOOP verbunden';
    connect.disabled=true;

    const box=$('whoopWorkouts');
    if(box){
      box.replaceChildren();
      const items=Array.isArray(data&&data.workouts)?data.workouts:[];
      if(!items.length){
        const p=document.createElement('p');p.className='personal-empty';p.textContent='Keine aktuellen Workouts.';box.append(p);
      }else{
        items.forEach(w=>{
          const row=document.createElement('div');row.className='personal-whoop-workout';
          const info=document.createElement('div');
          const strong=document.createElement('strong');strong.textContent=w.name||'Workout';
          const small=document.createElement('small');
          const when=w.start?new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(w.start)):'';
          small.textContent=[when,Number.isFinite(Number(w.strain))?'Strain '+Number(w.strain).toFixed(1):'',Number.isFinite(Number(w.calories))?Math.round(Number(w.calories))+' kcal':''].filter(Boolean).join(' · ');
          info.append(strong,small);row.append(info);box.append(row);
        });
      }
    }
  }

  async function loadSummary(){
    const token=session();
    if(!token)return false;
    try{
      const response=await fetch(EDGE+'/summary',{cache:'no-store',headers:headers()});
      if(response.status===401){
        localStorage.removeItem(LEGACY_SESSION_KEY);
        return false;
      }
      if(!response.ok)throw new Error('summary_failed');
      render(await response.json());
      return true;
    }catch(_){
      set('whoopHealthMeta','WHOOP ist verbunden, aber die Daten konnten gerade nicht geladen werden.');
      return false;
    }
  }

  async function claimPendingAuthorization(){
    const claim=localStorage.getItem(CLAIM_KEY)||'';
    if(!claim)return false;
    try{
      const {response,data}=await post('device-auth-claim',{claimSecret:claim});
      if(response.status===409)return false;
      if(response.status===410||response.status===400){
        localStorage.removeItem(CLAIM_KEY);
        return false;
      }
      if(!response.ok||!data||typeof data.session!=='string'||!data.session)return false;
      localStorage.setItem(LEGACY_SESSION_KEY,data.session);
      localStorage.removeItem(CLAIM_KEY);
      window.dispatchEvent(new Event('dgos-whoop-session'));
      return true;
    }catch(_){
      return false;
    }
  }

  async function startPersistentAuthorization(){
    const claim=randomClaimSecret();
    localStorage.setItem(CLAIM_KEY,claim);
    set('whoopHealthMeta','WHOOP-Autorisierung wird sicher vorbereitet …');
    connect.textContent='WHOOP wird geöffnet …';
    connect.disabled=true;
    try{
      const {response,data}=await post('device-auth-start',{claimSecret:claim});
      if(!response.ok||!data||typeof data.authorizationUrl!=='string')throw new Error('auth_start_failed');
      location.href=data.authorizationUrl;
    }catch(_){
      localStorage.removeItem(CLAIM_KEY);
      connect.disabled=false;
      connect.textContent='Dieses Gerät autorisieren';
      set('whoopHealthMeta','WHOOP-Autorisierung konnte nicht gestartet werden. Bitte erneut versuchen.');
    }
  }

  async function restoreFromDeviceSession(){
    const token=deviceSession();
    if(!token)return false;
    try{
      const response=await fetch(EDGE+'/device-session',{
        method:'POST',
        cache:'no-store',
        headers:headers(token)
      });
      if(!response.ok)return false;
      const data=await response.json();
      if(!data||typeof data.session!=='string'||!data.session)return false;
      localStorage.setItem(LEGACY_SESSION_KEY,data.session);
      window.dispatchEvent(new Event('dgos-whoop-session'));
      return true;
    }catch(_){
      return false;
    }
  }

  async function check(){
    try{
      if(!session() && localStorage.getItem(CLAIM_KEY)){
        set('whoopHealthMeta','WHOOP-Autorisierung wird übernommen …');
        if(await claimPendingAuthorization()){
          if(await loadSummary())return;
        }
      }

      const response=await fetch(EDGE+'/status',{cache:'no-store',headers:headers()});
      if(!response.ok)throw new Error('status_failed');
      const status=await response.json();

      if(!status.configured){
        showDisconnected('WHOOP ist vorbereitet. Es fehlt nur noch das einmalige Client Secret in Supabase.');
        connect.textContent='WHOOP noch konfigurieren';connect.disabled=true;
        return;
      }

      if(status.authenticated&&session()){
        if(await loadSummary())return;
      }

      if(status.connected&&deviceSession()){
        set('whoopHealthMeta','WHOOP-Verbindung wird automatisch wiederhergestellt …');
        if(await restoreFromDeviceSession()){
          if(await loadSummary())return;
        }
      }

      const pending=Boolean(localStorage.getItem(CLAIM_KEY));
      showDisconnected(pending
        ?'WHOOP wurde bestätigt. Wechsle zurück zu DG OS – die Sitzung wird automatisch übernommen.'
        :status.connected
          ?'WHOOP ist serverseitig verbunden. Autorisiere dieses Gerät einmal; danach bleibt die Sitzung dauerhaft erhalten.'
          :'WHOOP ist bereit. Einmal verbinden, danach lädt Jarvis deine Werte automatisch.');
      connect.textContent=pending?'Autorisierung prüfen':status.connected?'Dieses Gerät einmal autorisieren':'WHOOP verbinden';
      connect.disabled=false;
    }catch(_){
      showDisconnected('Der kostenlose WHOOP-Connector ist gerade nicht erreichbar. Bitte später erneut versuchen.');
      connect.textContent='WHOOP verbinden';
      connect.disabled=false;
    }
  }

  connect.addEventListener('click',async()=>{
    if(connect.disabled)return;
    if(localStorage.getItem(CLAIM_KEY)){
      if(await claimPendingAuthorization()){
        await loadSummary();
        return;
      }
    }
    startPersistentAuthorization();
  });

  const params=new URLSearchParams(location.search);
  if(params.get('whoop')==='error'){
    set('whoopHealthMeta','WHOOP-Verbindung wurde nicht abgeschlossen. Du kannst es erneut versuchen.');
    history.replaceState(null,'',location.pathname+location.hash);
  }else if(params.get('whoop')==='connected'){
    history.replaceState(null,'',location.pathname+location.hash);
  }else if(params.get('whoop')==='handoff'){
    set('whoopHealthMeta','WHOOP wird dauerhaft mit dieser DG-OS-Installation verknüpft …');
    history.replaceState(null,'',location.pathname+location.hash);
  }

  check();
  window.addEventListener('dgos-device-session',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  setInterval(check,10*60*1000);
})();



/* Jarvis Attention Cockpit — prioritised day, daily briefing and weekly review. */
(() => {
  'use strict';

  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/tasks';
  const DEVICE_SESSION_KEY='dgos.deviceSession';
  const LEGACY_SESSION_KEY='dgos.whoopSession';
  const $=id=>document.getElementById(id);
  const root=$('personalAttention');
  if(!root)return;

  function session(){
    return localStorage.getItem(DEVICE_SESSION_KEY)||localStorage.getItem(LEGACY_SESSION_KEY)||'';
  }
  function todayZurich(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }
  function headers(){
    const token=session();
    return token?{Authorization:'Bearer '+token}:{};
  }
  async function api(action){
    const response=await fetch(EDGE+'/'+action,{headers:headers(),cache:'no-store'});
    let data={};try{data=await response.json();}catch(_){}
    if(!response.ok){
      const err=new Error(data.error||'cockpit_request_failed');
      err.status=response.status;throw err;
    }
    return data;
  }
  function set(id,value){const el=$(id);if(el)el.textContent=value;}
  function icon(kind){
    if(kind==='bill')return'💳';
    if(kind==='appointment')return'📅';
    if(kind==='inbox')return'📥';
    if(kind==='shopping')return'🛒';
    return'✅';
  }
  function dateText(date){
    if(!date)return'';
    const d=new Date(date+'T12:00:00');
    if(!Number.isFinite(d.getTime()))return date;
    return new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit'}).format(d);
  }
  function itemMeta(item){
    const bits=[];
    if(item.reason)bits.push(item.reason);
    if(item.dueDate)bits.push(dateText(item.dueDate));
    if(item.dueTime)bits.push(String(item.dueTime).slice(0,5));
    if(item.amount!=null)bits.push(String(Number(item.amount).toFixed(2)).replace('.00','')+' '+String(item.currency||''));
    return bits.join(' · ');
  }
  function makeAttentionRow(item){
    const row=document.createElement('div');
    row.className='personal-attention-row is-'+(item.severity||'normal');

    const visual=document.createElement('span');
    visual.className='personal-attention-icon';
    visual.textContent=icon(item.kind);

    const copy=document.createElement('div');
    copy.className='personal-attention-copy';
    const strong=document.createElement('strong');
    strong.textContent=item.title||'Eintrag';
    const small=document.createElement('small');
    small.textContent=itemMeta(item)||'Heute';
    copy.append(strong,small);

    const level=document.createElement('span');
    level.className='personal-attention-level';
    level.textContent=item.severity==='urgent'?'JETZT':item.severity==='high'?'WICHTIG':'HEUTE';

    row.append(visual,copy,level);
    return row;
  }
  function renderAttention(data){
    const items=Array.isArray(data.attention)?data.attention:[];
    const stats=data.stats||{};
    set('attentionCount',String(items.length));
    set('attentionTaskStat',String(Number(stats.todayTasks||0)+Number(stats.overdueTasks||0)));
    set('attentionBillStat',String(stats.dueBills||0));
    set('attentionAppointmentStat',String(stats.dueAppointments||0));
    set('attentionInboxStat',String(stats.inbox||0));

    const urgent=items.filter(x=>x.severity==='urgent').length;
    const high=items.filter(x=>x.severity==='high').length;
    set('attentionSubtitle',urgent
      ?urgent+' dringende '+(urgent===1?'Sache':'Sachen')+' zuerst.'
      :high
        ?high+' wichtige '+(high===1?'Sache':'Sachen')+' im Fokus.'
        :items.length?'Dein Tag ist sortiert.':'Aktuell braucht nichts deine sofortige Aufmerksamkeit.');

    const list=$('attentionList');
    if(!list)return;
    list.replaceChildren();
    if(!items.length){
      const p=document.createElement('p');
      p.className='personal-attention-clear';
      p.textContent='✓ Alles ruhig. Jarvis meldet sich, sobald etwas relevant wird.';
      list.append(p);
      return;
    }
    items.slice(0,7).forEach(item=>list.append(makeAttentionRow(item)));
    if(items.length>7){
      const more=document.createElement('small');
      more.className='personal-attention-more';
      more.textContent='+'+(items.length-7)+' weitere Einträge in deinen Bereichen';
      list.append(more);
    }
  }

  function section(title,items,formatter){
    const wrap=document.createElement('section');
    wrap.className='personal-summary-section';
    const h=document.createElement('h4');h.textContent=title;
    wrap.append(h);
    if(!items||!items.length){
      const p=document.createElement('p');p.className='personal-empty';p.textContent='Nichts offen.';wrap.append(p);
      return wrap;
    }
    const ul=document.createElement('div');ul.className='personal-summary-list';
    items.slice(0,8).forEach(item=>{
      const row=document.createElement('div');row.className='personal-summary-row';
      const strong=document.createElement('strong');strong.textContent=item.title||'Eintrag';
      const small=document.createElement('small');small.textContent=formatter?formatter(item):itemMeta(item);
      row.append(strong,small);ul.append(row);
    });
    wrap.append(ul);
    return wrap;
  }

  function openSummary(title,kicker){
    set('jarvisSummaryTitle',title);
    set('jarvisSummaryKicker',kicker);
    const panel=$('jarvisSummaryPanel');
    panel?.classList.remove('hidden');
    const content=$('jarvisSummaryContent');
    if(content){
      content.replaceChildren();
      const p=document.createElement('p');p.className='personal-empty';p.textContent='Jarvis erstellt die Übersicht …';content.append(p);
    }
    return content;
  }
  function liveContextBlock(){
    const values=[];
    const temp=$('weatherTemperature')?.textContent?.trim();
    const weather=$('weatherDescription')?.textContent?.trim();
    const sleep=$('whoopSleep')?.textContent?.trim();
    const recovery=$('whoopRecovery')?.textContent?.trim();
    const strain=$('whoopStrain')?.textContent?.trim();
    if(temp&&temp!=='— °C'&&temp!=='—')values.push('Wetter '+temp+(weather&&weather!=='Lädt …'?' · '+weather:''));
    if(sleep&&sleep!=='—')values.push('Schlaf '+sleep);
    if(recovery&&recovery!=='—')values.push('Recovery '+recovery);
    if(strain&&strain!=='—')values.push('Strain '+strain);
    if(!values.length)return null;
    const box=document.createElement('div');box.className='personal-summary-context';
    const strong=document.createElement('strong');strong.textContent='Dein Zustand heute';
    const p=document.createElement('p');p.textContent=values.join(' · ');
    box.append(strong,p);return box;
  }

  async function dailyBriefing(){
    const content=openSummary('Dein Tagesbriefing','HEUTE IM BLICK');
    try{
      const data=await api('briefing?date='+encodeURIComponent(todayZurich()));
      if(!content)return;
      content.replaceChildren();

      const context=liveContextBlock();
      if(context)content.append(context);

      const hero=document.createElement('div');hero.className='personal-summary-hero';
      const total=(data.overdue?.length||0)+(data.tasksToday?.length||0)+(data.appointments?.filter(x=>x.dueDate===data.date).length||0)+(data.bills?.filter(x=>x.dueDate&&x.dueDate<=data.date).length||0);
      const strong=document.createElement('strong');
      strong.textContent=total?total+' Punkte brauchen heute Aufmerksamkeit.':'Dein Tag ist aktuell ruhig.';
      const p=document.createElement('p');
      p.textContent=data.overdue?.length
        ?'Starte mit den überfälligen Punkten, danach kommt der Rest.'
        :'Jarvis hat Aufgaben, Termine und Rechnungen für dich sortiert.';
      hero.append(strong,p);content.append(hero);

      content.append(
        section('Überfällig',data.overdue,x=>[dateText(x.dueDate),x.priority==='high'?'Wichtig':''].filter(Boolean).join(' · ')),
        section('Aufgaben heute',data.tasksToday,x=>x.priority==='high'?'Wichtig':'Heute'),
        section('Kommende Termine',data.appointments,x=>[dateText(x.dueDate),x.dueTime?String(x.dueTime).slice(0,5):''].filter(Boolean).join(' · ')),
        section('Rechnungen',data.bills,x=>[dateText(x.dueDate),x.amount!=null?String(Number(x.amount).toFixed(2)).replace('.00','')+' '+String(x.currency||''):''].filter(Boolean).join(' · '))
      );

      if(data.shopping?.length){
        const shopping=document.createElement('div');shopping.className='personal-summary-context';
        const st=document.createElement('strong');st.textContent='🛒 Einkauf';
        const sp=document.createElement('p');sp.textContent=data.shopping.slice(0,6).map(x=>x.title).join(' · ');
        shopping.append(st,sp);content.append(shopping);
      }
      if(Number(data.pendingInbox||0)>0){
        const inbox=document.createElement('p');inbox.className='personal-summary-alert';
        inbox.textContent='📥 '+data.pendingInbox+' Inbox-'+(data.pendingInbox===1?'Eintrag wartet':'Einträge warten')+' auf Verarbeitung.';
        content.append(inbox);
      }
    }catch(_){
      if(content){content.replaceChildren();const p=document.createElement('p');p.className='personal-empty';p.textContent='Tagesbriefing konnte gerade nicht geladen werden.';content.append(p);}
    }
  }

  async function weeklyReview(){
    const content=openSummary('Dein Wochenreview','WOCHENÜBERBLICK');
    try{
      const data=await api('week?date='+encodeURIComponent(todayZurich()));
      if(!content)return;
      content.replaceChildren();

      const hero=document.createElement('div');hero.className='personal-summary-hero';
      const strong=document.createElement('strong');
      strong.textContent=String(data.completedTasks||0)+' Aufgaben + '+String(data.completedPrivate||0)+' private Punkte erledigt.';
      const p=document.createElement('p');
      p.textContent='Zeitraum '+dateText(data.period?.start)+' – '+dateText(data.period?.end)+'.';
      hero.append(strong,p);content.append(hero);

      content.append(
        section('Noch offen aus dieser Woche',data.openTasks,x=>[dateText(x.dueDate),x.priority==='high'?'Wichtig':''].filter(Boolean).join(' · ')),
        section('Termine nächste Woche',data.nextAppointments,x=>[dateText(x.dueDate),x.dueTime?String(x.dueTime).slice(0,5):''].filter(Boolean).join(' · ')),
        section('Rechnungen nächste Woche',data.nextBills,x=>[dateText(x.dueDate),x.amount!=null?String(Number(x.amount).toFixed(2)).replace('.00','')+' '+String(x.currency||''):''].filter(Boolean).join(' · '))
      );
    }catch(_){
      if(content){content.replaceChildren();const p=document.createElement('p');p.className='personal-empty';p.textContent='Wochenreview konnte gerade nicht geladen werden.';content.append(p);}
    }
  }

  async function load(){
    if(!session()){
      set('attentionSubtitle','Verbinde dein Gerät einmal über Telegram, damit Jarvis priorisieren kann.');
      return;
    }
    try{
      renderAttention(await api('attention?date='+encodeURIComponent(todayZurich())));
    }catch(_){
      set('attentionSubtitle','Jarvis konnte deinen Tag gerade nicht laden.');
    }
  }

  $('dailyBriefingButton')?.addEventListener('click',dailyBriefing);
  $('weeklyReviewButton')?.addEventListener('click',weeklyReview);
  $('jarvisSummaryClose')?.addEventListener('click',()=>$('jarvisSummaryPanel')?.classList.add('hidden'));

  load();
  window.addEventListener('focus',load);
  window.addEventListener('dgos-device-session',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();

/* Daily Tasks — Supabase-backed, secured by the active DG OS device session. */
(() => {
  'use strict';

  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/tasks';
  const DEVICE_SESSION_KEY='dgos.deviceSession';
  const LEGACY_SESSION_KEY='dgos.whoopSession';
  const $=id=>document.getElementById(id);
  const form=$('taskQuickForm');
  if(!form)return;

  function session(){ return localStorage.getItem(DEVICE_SESSION_KEY)||localStorage.getItem(LEGACY_SESSION_KEY)||''; }
  function headers(json=true){
    const h={};
    const token=session();
    if(token) h.Authorization='Bearer '+token;
    if(json) h['Content-Type']='application/json';
    return h;
  }
  function todayZurich(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(new Date());
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }
  function prettyDate(date){
    const d=new Date(date+'T12:00:00');
    return new Intl.DateTimeFormat('de-CH',{
      timeZone:'Europe/Zurich',weekday:'long',day:'2-digit',month:'long'
    }).format(d);
  }
  function set(id,value){const el=$(id);if(el)el.textContent=value;}
  function note(msg,kind=''){
    const el=$('taskNotice'); if(!el)return;
    el.textContent=msg||''; el.dataset.kind=kind;
  }
  async function api(action,options={}){
    const response=await fetch(EDGE+'/'+action,{
      method:options.method||'GET',
      headers:headers(options.body!==undefined),
      body:options.body!==undefined?JSON.stringify(options.body):undefined,
      cache:'no-store'
    });
    let data={};
    try{data=await response.json();}catch(_){}
    if(!response.ok){
      const err=new Error(data.error||'task_request_failed');
      err.status=response.status; throw err;
    }
    return data;
  }

  function priorityLabel(value){
    if(value==='high')return'Wichtig';
    if(value==='low')return'Später';
    return'Normal';
  }
  function sourceLabel(value){
    if(value==='telegram')return'Telegram';
    if(value==='voice')return'Voice';
    if(value==='image')return'Bild';
    return'Jarvis';
  }
  function dueMeta(task){
    const bits=[];
    if(task.due_time) bits.push(String(task.due_time).slice(0,5));
    bits.push(sourceLabel(task.source));
    return bits.join(' · ');
  }

  function makeTaskRow(task,opts={}){
    const overdue=Boolean(opts.overdue);
    const done=Boolean(opts.done);
    const row=document.createElement('div');
    row.className='personal-task-row'+(done?' is-done':'')+(overdue?' is-overdue':'');
    row.dataset.taskId=task.id;

    const check=document.createElement('button');
    check.type='button';
    check.className='personal-task-check';
    check.setAttribute('aria-label',done?'Aufgabe wieder öffnen':'Aufgabe erledigen');
    check.setAttribute('aria-pressed',done?'true':'false');
    check.textContent=done?'✓':'';

    const body=document.createElement('div');
    body.className='personal-task-copy';
    const title=document.createElement('strong');
    title.textContent=task.title;
    const meta=document.createElement('small');
    meta.textContent=(overdue?('Fällig '+prettyDate(task.due_date)+' · '):'')+dueMeta(task);
    body.append(title,meta);

    const side=document.createElement('div');
    side.className='personal-task-side';
    const badge=document.createElement('span');
    badge.className='personal-task-priority is-'+(task.priority||'normal');
    badge.textContent=priorityLabel(task.priority);
    side.append(badge);

    if(overdue && !done){
      const today=document.createElement('button');
      today.type='button'; today.className='personal-task-mini'; today.textContent='Heute';
      today.addEventListener('click',async()=>{
        today.disabled=true;
        try{await api('move',{method:'POST',body:{id:task.id,dueDate:todayZurich()}});await load();}
        catch(_){note('Aufgabe konnte nicht auf heute verschoben werden.','error');}
        finally{today.disabled=false;}
      });
      side.append(today);
    }

    const del=document.createElement('button');
    del.type='button';del.className='personal-task-delete';del.textContent='×';
    del.setAttribute('aria-label','Aufgabe löschen');
    del.addEventListener('click',async()=>{
      del.disabled=true;
      try{await api('delete',{method:'POST',body:{id:task.id}});await load();}
      catch(_){note('Aufgabe konnte nicht gelöscht werden.','error');}
    });
    side.append(del);

    check.addEventListener('click',async()=>{
      check.disabled=true;
      try{
        await api('toggle',{method:'POST',body:{id:task.id,done:!done}});
        await load();
      }catch(_){
        note('Aufgabe konnte nicht aktualisiert werden.','error');
        check.disabled=false;
      }
    });

    row.append(check,body,side);
    return row;
  }

  function render(data){
    const tasks=Array.isArray(data.tasks)?data.tasks:[];
    const open=tasks.filter(t=>t.status==='open');
    const done=tasks.filter(t=>t.status==='done');
    const overdue=Array.isArray(data.overdue)?data.overdue:[];

    set('taskProgress',done.length+'/'+tasks.length);
    set('taskOpenCount',open.length+' offen');
    set('taskDoneCount',String(done.length));
    set('taskOverdueCount',String(overdue.length));
    set('taskInboxBadge',String(Number(data.pendingInbox||0)));
    set('taskInboxStatus',Number(data.pendingInbox||0)>0
      ?String(data.pendingInbox)+' neue Eingänge warten auf Verarbeitung'
      :'Direkte Eingabe aktiv · Telegram folgt');

    const list=$('taskTodayList');
    if(list){
      list.replaceChildren();
      if(!open.length){
        const p=document.createElement('p');p.className='personal-empty';
        p.textContent=done.length?'Alles für heute erledigt.':'Noch keine Aufgaben für heute.';
        list.append(p);
      }else open.forEach(task=>list.append(makeTaskRow(task)));
    }

    const doneSection=$('taskDoneSection');
    const doneList=$('taskDoneList');
    if(doneSection&&doneList){
      doneSection.classList.toggle('hidden',!done.length);
      doneList.replaceChildren();
      done.forEach(task=>doneList.append(makeTaskRow(task,{done:true})));
    }

    const overdueWrap=$('taskOverdueWrap');
    const overdueList=$('taskOverdueList');
    if(overdueWrap&&overdueList){
      overdueWrap.classList.toggle('hidden',!overdue.length);
      overdueList.replaceChildren();
      overdue.forEach(task=>overdueList.append(makeTaskRow(task,{overdue:true})));
    }
  }


  function organizerMeta(item){
    const bits=[];
    if(item.due_date)bits.push(new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(item.due_date+'T12:00:00')));
    if(item.due_time)bits.push(String(item.due_time).slice(0,5));
    if(item.amount!=null)bits.push(String(Number(item.amount).toFixed(2)).replace('.00','')+' '+String(item.currency||''));
    return bits.join(' · ');
  }

  function organizerRow(item,kind){
    const row=document.createElement('div');
    row.className='personal-organizer-row';

    const check=document.createElement('button');
    check.type='button';
    check.className='personal-organizer-check';
    check.textContent='✓';
    check.setAttribute('aria-label',kind==='note'?'Notiz archivieren':'Als erledigt markieren');

    const copy=document.createElement('div');
    copy.className='personal-organizer-copy';
    const strong=document.createElement('strong');strong.textContent=item.title||'Eintrag';
    const small=document.createElement('small');small.textContent=organizerMeta(item)||'Telegram';
    copy.append(strong,small);

    const del=document.createElement('button');
    del.type='button';del.className='personal-organizer-delete';del.textContent='×';del.setAttribute('aria-label','Löschen');

    check.addEventListener('click',async()=>{
      check.disabled=true;
      try{await api('private-toggle',{method:'POST',body:{id:item.id,done:true}});await loadOrganizer();}
      catch(_){note('Eintrag konnte nicht aktualisiert werden.','error');}
    });
    del.addEventListener('click',async()=>{
      del.disabled=true;
      try{await api('private-delete',{method:'POST',body:{id:item.id}});await loadOrganizer();}
      catch(_){note('Eintrag konnte nicht gelöscht werden.','error');}
    });

    row.append(check,copy,del);
    return row;
  }

  function renderOrganizer(data){
    const map=[
      ['appointment','privateAppointmentList','privateAppointmentCount','Termine'],
      ['bill','privateBillList','privateBillCount','Rechnungen'],
      ['shopping','privateShoppingList','privateShoppingCount','Einträge'],
      ['note','privateNoteList','privateNoteCount','Notizen']
    ];
    let total=0;
    map.forEach(([kind,listId,countId,label])=>{
      const items=Array.isArray(data&&data[kind])?data[kind]:[];
      total+=items.length;
      set(countId,String(items.length));
      const list=$(listId);if(!list)return;
      list.replaceChildren();
      if(!items.length){
        const p=document.createElement('p');p.className='personal-empty';p.textContent='Keine '+label+'.';
        list.append(p);
      }else items.forEach(item=>list.append(organizerRow(item,kind)));
    });
    set('privateOrganizerStatus',total?total+' offene Einträge':'Alles sortiert');
  }

  async function loadOrganizer(){
    if(!session())return;
    try{
      const data=await api('organizer');
      renderOrganizer(data);
    }catch(_){
      set('privateOrganizerStatus','Gerade nicht verfügbar');
    }
  }

  async function load(){
    const token=session();
    if(!token){
      note('Verbinde Telegram einmal mit diesem Gerät. Danach funktioniert die Aufgabenliste unabhängig von WHOOP.','error');
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
      return;
    }

    try{
      set('taskDateLabel',prettyDate(todayZurich()));
      const data=await api('today?date='+encodeURIComponent(todayZurich()));
      render(data);
      await loadOrganizer();
      note('');
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);
    }catch(err){
      if(err.status===401){
        note('Deine DG-OS-Gerätesitzung ist abgelaufen. Verbinde Telegram auf diesem Gerät einmal neu.','error');
        form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
      }else{
        note('Aufgaben konnten gerade nicht geladen werden.','error');
      }
    }
  }

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const title=$('taskQuickTitle').value.trim();
    if(!title)return;
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true; note('Aufgabe wird gespeichert …');
    try{
      await api('create',{
        method:'POST',
        body:{
          title,
          dueDate:todayZurich(),
          priority:$('taskQuickPriority').value
        }
      });
      $('taskQuickTitle').value='';
      $('taskQuickPriority').value='normal';
      await load();
      $('taskQuickTitle').focus();
    }catch(err){
      note(err.status===401?'Gerätesitzung abgelaufen. Bitte Telegram einmal neu verbinden.':'Aufgabe konnte nicht gespeichert werden.','error');
    }finally{button.disabled=false;}
  });

  load();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  window.addEventListener('focus',load);
  window.addEventListener('dgos-device-session',load);
})();


/* Unified Telegram bridge — one bot, separate Jarvis/Trading modes. */
(() => {
  'use strict';

  const button=document.getElementById('taskTelegramSetup');
  const status=document.getElementById('taskInboxStatus');
  if(!button||!status)return;

  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/telegram-tasks';
  const DEVICE_SESSION_KEY='dgos.deviceSession';
  const LEGACY_SESSION_KEY='dgos.whoopSession';

  function session(){
    return localStorage.getItem(DEVICE_SESSION_KEY)||localStorage.getItem(LEGACY_SESSION_KEY)||'';
  }

  function headers(json=false){
    const h={};
    const token=session();
    if(token)h.Authorization='Bearer '+token;
    if(json)h['Content-Type']='application/json';
    return h;
  }

  async function request(action,method='GET',body){
    const r=await fetch(EDGE+'/'+action,{
      method,
      headers:headers(body!==undefined),
      body:body!==undefined?JSON.stringify(body):undefined,
      cache:'no-store'
    });
    let data={};try{data=await r.json();}catch(_){}
    if(!r.ok){
      const e=new Error(data.error||'telegram_error');
      e.status=r.status;
      throw e;
    }
    return data;
  }

  function setConnected(data){
    button.disabled=true;
    button.textContent='Telegram ✓';
    status.textContent='Privater Jarvis-Bot verbunden · Trading-Meldungen bleiben separat gekennzeichnet';
  }

  async function refresh(){
    try{
      const data=await request('status');

      if(!data.configured){
        button.disabled=true;
        button.textContent='Telegram';
        status.textContent='Bestehender Bot gefunden · Bot-Token fehlt noch in Supabase';
        return;
      }

      if(data.deviceAuthenticated){
        setConnected(data);
        return;
      }

      button.disabled=false;
      button.textContent='Telegram verbinden';
      status.textContent=(data.botUsername?'@'+data.botUsername+' · ':'')+'Dieses Gerät einmal über Telegram bestätigen';
    }catch(_){
      button.disabled=false;
      button.textContent='Telegram verbinden';
      status.textContent='Telegram-Status konnte gerade nicht geladen werden';
    }
  }

  button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;
    button.textContent='Öffne Telegram …';

    try{
      const data=await request('pair-start','POST');

      if(data.alreadyAuthenticated){
        setConnected(data);
        return;
      }

      const code=String(data.code||'');
      const claimSecret=String(data.claimSecret||'');
      const bot=data.botUsername?'@'+data.botUsername:'dein Bot';

      if(!code||!claimSecret||!data.deepLink)throw new Error('pairing_data_missing');

      status.textContent=bot+' · Code '+code+' · in Telegram auf Start drücken';

      const opened=window.open(data.deepLink,'_blank','noopener,noreferrer');
      if(!opened)window.location.href=data.deepLink;

      button.textContent='Warte auf Bestätigung …';

      let attempts=0;
      const timer=setInterval(async()=>{
        attempts+=1;
        try{
          const claim=await request('pair-claim','POST',{code,claimSecret});
          if(claim.approved&&claim.deviceToken){
            clearInterval(timer);
            localStorage.setItem(DEVICE_SESSION_KEY,claim.deviceToken);
            window.dispatchEvent(new Event('dgos-device-session'));
            setConnected(claim);
            return;
          }
        }catch(_){}

        if(attempts>=60){
          clearInterval(timer);
          button.disabled=false;
          button.textContent='Telegram verbinden';
          status.textContent='Pairing abgelaufen. Tippe erneut auf Telegram verbinden.';
        }
      },2000);
    }catch(err){
      button.disabled=err.status===503;
      button.textContent='Telegram verbinden';
      status.textContent=err.status===503
        ?'Bot-Token fehlt noch in Supabase'
        :'Telegram konnte nicht gekoppelt werden.';
    }
  });

  window.addEventListener('focus',()=>setTimeout(refresh,700));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refresh,700);});
  refresh();
})();


/* v0.56.0 — Home Jarvis Life OS + optional Obsidian bridge. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('personalJarvis');
  const orb = $('personalJarvisOrbBtn');
  if (!panel || !orb) return;

  const status = $('personalJarvisStatus');
  const reply = $('personalJarvisReply');
  const commandForm = $('jarvisLifeCommandForm');
  const commandInput = $('jarvisLifeCommandInput');
  const OBSIDIAN_VAULT_KEY = 'dgos.obsidianVault';

  function setStatus(text) {
    if (status) status.textContent = text || 'Bereit';
  }
  function setReply(text) {
    if (reply) reply.textContent = text || 'Sag mir, was du brauchst.';
  }
  function scrollToElement(el) {
    if (!el) return false;
    el.scrollIntoView({behavior:'smooth', block:'center'});
    return true;
  }
  function showReply(text) {
    panel.classList.add('is-speaking');
    setStatus('Erledigt');
    setReply(text);
    clearTimeout(panel._jarvisSpeakingTimer);
    panel._jarvisSpeakingTimer = setTimeout(() => {
      panel.classList.remove('is-speaking');
      setStatus('Bereit');
    }, 2200);
  }

  function navTo(target) {
    const button = document.querySelector('.bottom-nav button[data-target="' + target + '"]');
    if (button) {
      button.click();
      return true;
    }
    return scrollToElement($(target));
  }

  function openOrganizer(label) {
    const cards = Array.from(document.querySelectorAll('.personal-organizer-card'));
    const card = cards.find(item => {
      const summary = item.querySelector('summary');
      return summary && summary.textContent.toLowerCase().includes(label.toLowerCase());
    });
    if (!card) return false;
    card.open = true;
    scrollToElement(card);
    return true;
  }

  function focusTask(prefill = '') {
    const input = $('taskQuickTitle');
    const form = $('taskQuickForm');
    if (!input || !form) return false;
    scrollToElement($('personalTasks') || form);
    setTimeout(() => {
      if (prefill) input.value = prefill;
      input.focus();
      if (prefill && !input.disabled) form.requestSubmit();
    }, 280);
    return true;
  }

  function runLifeAction(action, payload = '') {
    switch (action) {
      case 'briefing':
        $('dailyBriefingButton')?.click();
        scrollToElement($('personalAttention'));
        showReply('Dein Tagesbriefing ist offen. Ich habe das Wichtige für heute nach Priorität sortiert.');
        return true;
      case 'task':
        if (focusTask(payload)) {
          showReply(payload ? 'Aufgabe wurde an deine Aufgabenliste übergeben.' : 'Aufgabenliste ist bereit. Was möchtest du erledigen?');
          return true;
        }
        break;
      case 'appointment':
        $('newLocalEvent')?.click();
        showReply('Termin-Erfassung ist geöffnet.');
        return true;
      case 'calendar':
        navTo('personalCalendar');
        showReply('Ich habe deinen Kalender geöffnet.');
        return true;
      case 'organize':
        if (scrollToElement(document.querySelector('.personal-organizer'))) {
          showReply('Hier ist deine persönliche Zentrale mit Terminen, Rechnungen, Einkauf und Notizen.');
          return true;
        }
        break;
      case 'bills':
        if (openOrganizer('Rechnungen')) {
          showReply('Ich habe deine offenen Rechnungen geöffnet.');
          return true;
        }
        break;
      case 'shopping':
        if (openOrganizer('Einkauf')) {
          showReply('Deine Einkaufsliste ist geöffnet.');
          return true;
        }
        break;
      case 'notes':
        if (openOrganizer('Notizen')) {
          showReply('Deine Notizen sind geöffnet.');
          return true;
        }
        break;
      case 'health':
        navTo('personalHealth');
        showReply('Gesundheit ist geöffnet.');
        return true;
      case 'social':
        navTo('personalSocial');
        showReply('Social Command Center ist geöffnet.');
        return true;
      case 'trading':
        navTo('tradingWorkspace');
        showReply('Trading ist separat geöffnet. Deine persönlichen Jarvis-Befehle bleiben davon getrennt.');
        return true;
    }
    setStatus('Bereit');
    setReply('Diesen Befehl kann ich noch nicht sicher ausführen.');
    return false;
  }

  function interpretCommand(raw) {
    const original = String(raw || '').trim();
    if (!original) return false;
    const q = original.toLowerCase().replace(/[?!.,;:]+/g,' ').replace(/\s+/g,' ').trim();

    if (/^(aufgabe|todo)\s+/.test(q)) {
      const task = original.replace(/^(aufgabe|todo)\s+/i,'').trim();
      return runLifeAction('task', task);
    }
    if (/was.*heute.*wichtig|tagesbriefing|briefing|mein tag|zeig.*tag|heute.*an/.test(q)) return runLifeAction('briefing');
    if (/aufgabe|todo|erledigen/.test(q)) return runLifeAction('task');
    if (/termin|appointment/.test(q)) return runLifeAction('appointment');
    if (/kalender/.test(q)) return runLifeAction('calendar');
    if (/rechnung|bezahlen|fällig/.test(q)) return runLifeAction('bills');
    if (/einkauf|einkaufen|shopping/.test(q)) return runLifeAction('shopping');
    if (/notiz|notizen|idee|gedanke/.test(q)) return runLifeAction('notes');
    if (/gesundheit|whoop|recovery|schlaf/.test(q)) return runLifeAction('health');
    if (/social|instagram|follower/.test(q)) return runLifeAction('social');
    if (/trading|gold|xau|markt/.test(q)) return runLifeAction('trading');
    if (/sortier|organisier|ordnung|zentrale|übersicht/.test(q)) return runLifeAction('organize');

    setStatus('Noch nicht gelernt');
    setReply('Versuch z. B. «Was ist heute wichtig?», «Aufgabe Steuerrechnung prüfen», «Kalender», «Rechnungen» oder «Social».');
    return false;
  }

  document.querySelectorAll('[data-jarvis-action]').forEach(button => {
    button.addEventListener('click', () => runLifeAction(button.dataset.jarvisAction || ''));
  });

  commandForm?.addEventListener('submit', event => {
    event.preventDefault();
    const value = commandInput ? commandInput.value.trim() : '';
    if (!value) {
      commandInput?.focus();
      return;
    }
    interpretCommand(value);
    if (commandInput) commandInput.value = '';
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'de-CH';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('start', () => {
      listening = true;
      panel.classList.add('is-listening');
      orb.setAttribute('aria-pressed','true');
      setStatus('Ich höre zu …');
      setReply('Sag einfach, was du brauchst.');
    });
    recognition.addEventListener('result', event => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setReply('«' + transcript + '»');
        setTimeout(() => interpretCommand(transcript), 180);
      }
    });
    recognition.addEventListener('end', () => {
      listening = false;
      panel.classList.remove('is-listening');
      orb.setAttribute('aria-pressed','false');
      if (status && status.textContent === 'Ich höre zu …') setStatus('Bereit');
    });
    recognition.addEventListener('error', event => {
      listening = false;
      panel.classList.remove('is-listening');
      orb.setAttribute('aria-pressed','false');
      if (event.error === 'not-allowed') {
        setStatus('Mikrofon nicht erlaubt');
        setReply('Du kannst Jarvis auch direkt unten eintippen.');
      } else {
        setStatus('Sprache gerade nicht verfügbar');
        setReply('Nutze kurz die Texteingabe.');
      }
    });
  }

  orb.addEventListener('click', () => {
    if (!recognition) {
      setStatus('Textmodus');
      setReply('Spracherkennung ist hier nicht verfügbar. Schreib mir deinen Befehl.');
      commandInput?.focus();
      return;
    }
    if (listening) {
      try { recognition.stop(); } catch (_) {}
      return;
    }
    try { recognition.start(); }
    catch (_) { commandInput?.focus(); }
  });

  const statMap = [
    ['attentionTaskStat','jarvisLifeTasks'],
    ['attentionAppointmentStat','jarvisLifeAppointments'],
    ['attentionBillStat','jarvisLifeBills'],
    ['attentionInboxStat','jarvisLifeInbox']
  ];
  function syncLifeStats() {
    statMap.forEach(([sourceId,targetId]) => {
      const source = $(sourceId);
      const target = $(targetId);
      if (source && target) target.textContent = source.textContent.trim() || '0';
    });
  }
  statMap.forEach(([sourceId]) => {
    const source = $(sourceId);
    if (source) new MutationObserver(syncLifeStats).observe(source,{childList:true,subtree:true,characterData:true});
  });
  syncLifeStats();

  const obsidianStatus = $('obsidianStatus');
  const vaultButton = $('obsidianVaultButton');
  const capture = $('obsidianCaptureForm');
  const captureInput = $('obsidianCaptureInput');

  function vaultName() {
    try { return (localStorage.getItem(OBSIDIAN_VAULT_KEY) || '').trim(); } catch (_) { return ''; }
  }
  function setObsidianStatus(text) {
    if (obsidianStatus) obsidianStatus.textContent = text;
  }
  function updateVaultButton() {
    const value = vaultName();
    if (vaultButton) vaultButton.textContent = value ? 'Verbunden · ' + value : 'Obsidian verbinden';
    setObsidianStatus(value ? 'Obsidian ist verbunden und bleibt als optionale Integration verfügbar.' : 'Obsidian ist optional und aktuell nicht verbunden.');
  }
  function requestVault() {
    const current = vaultName();
    const value = window.prompt('Wie heisst dein Obsidian Vault? Du kannst auch die Vault-ID einfügen.', current);
    if (value === null) return '';
    const clean = value.trim();
    if (!clean) {
      try { localStorage.removeItem(OBSIDIAN_VAULT_KEY); } catch (_) {}
      updateVaultButton();
      return '';
    }
    try { localStorage.setItem(OBSIDIAN_VAULT_KEY, clean); } catch (_) {}
    updateVaultButton();
    return clean;
  }
  function ensureVault() {
    return vaultName() || requestVault();
  }
  function enc(value) { return encodeURIComponent(String(value)); }
  function openObsidian(action, params, flags) {
    const vault = ensureVault();
    if (!vault) return false;
    const query = [['vault', vault]].concat(params || []).map(pair => enc(pair[0]) + '=' + enc(pair[1])).join('&');
    const suffix = (flags || []).map(flag => '&' + enc(flag)).join('');
    const uri = 'obsidian://' + action + '?' + query + suffix;
    setObsidianStatus('Obsidian wird geöffnet …');
    window.location.href = uri;
    return true;
  }

  if (vaultButton) vaultButton.addEventListener('click', requestVault);

  $('obsidianNoteButton')?.addEventListener('click', () => {
    if (!capture) return;
    capture.classList.toggle('hidden');
    if (!capture.classList.contains('hidden')) setTimeout(() => captureInput && captureInput.focus(), 50);
  });

  $('obsidianCaptureCancel')?.addEventListener('click', () => {
    if (capture) capture.classList.add('hidden');
  });

  capture?.addEventListener('submit', event => {
    event.preventDefault();
    const text = captureInput ? captureInput.value.trim() : '';
    if (!text) {
      setObsidianStatus('Schreib zuerst eine kurze Notiz.');
      if (captureInput) captureInput.focus();
      return;
    }
    const now = new Date();
    const stamp = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(now).replace(' ', ' ');
    const safeStamp = stamp.replace(':','-');
    const content = '# Jarvis Notiz\n\n' + text + '\n\n---\nErfasst mit DG OS · ' + stamp + ' · Europe/Zurich';
    if (openObsidian('new', [['file', '00 Inbox/' + safeStamp + ' Jarvis'], ['content', content]], [])) {
      if (captureInput) captureInput.value = '';
      capture.classList.add('hidden');
    }
  });

  $('obsidianInboxButton')?.addEventListener('click', () => {
    openObsidian('new', [['file','00 Inbox/Jarvis Inbox']], ['append']);
  });

  $('obsidianDailyButton')?.addEventListener('click', () => {
    openObsidian('daily', [], []);
  });

  updateVaultButton();
  setStatus('Bereit');
  setReply('Sag mir, was du brauchst.');
})();
