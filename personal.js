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
  let selected = today(), view = 'day', events = [], cloudEvents = [], storageReadable = true;
  let hubState = null, cloudRangeKey = '', cloudRequestId = 0, suppressCloudRefresh = false;

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
    return [...events.map(e=>Object.assign({source:'local'},e)), ...cloudEvents];
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
      const source=e.source==='google'?(googleAccountLabel(e.account)+(e.calendarName?' · '+e.calendarName:'')):'Auf diesem Gerät';
      const when=e.allDay?'Ganztägig':e.start+'–'+e.end;
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
  setInterval(greet,60000);
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
  const SESSION_KEY='dgos.whoopSession';

  function session(){return localStorage.getItem(SESSION_KEY)||'';}
  function headers(){
    const token=session();
    return token?{Authorization:'Bearer '+token}:{};
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
        localStorage.removeItem(SESSION_KEY);
        showDisconnected('Deine WHOOP-Sitzung ist abgelaufen. Verbinde WHOOP bitte einmal neu.');
        connect.textContent='WHOOP neu verbinden';connect.disabled=false;
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

  async function check(){
    try{
      const response=await fetch(EDGE+'/status',{cache:'no-store',headers:headers()});
      if(!response.ok)throw new Error('status_failed');
      const status=await response.json();

      if(!status.configured){
        showDisconnected('WHOOP ist vorbereitet. Es fehlt nur noch das einmalige Client Secret in Supabase.');
        connect.textContent='WHOOP noch konfigurieren';connect.disabled=true;
        return;
      }

      if(status.authenticated&&session()){
        await loadSummary();
        return;
      }

      showDisconnected(status.connected
        ?'WHOOP ist eingerichtet. Verbinde dein Konto einmal neu mit diesem Gerät.'
        :'WHOOP ist bereit. Einmal verbinden, danach lädt Jarvis deine Werte automatisch.');
      connect.textContent=status.connected?'WHOOP neu verbinden':'WHOOP verbinden';
      connect.disabled=false;
    }catch(_){
      showDisconnected('Der kostenlose WHOOP-Connector ist gerade nicht erreichbar. Bitte später erneut versuchen.');
      connect.textContent='WHOOP verbinden';
      connect.disabled=false;
    }
  }

  connect.addEventListener('click',()=>{
    if(connect.disabled)return;
    location.href=EDGE+'/start';
  });

  const params=new URLSearchParams(location.search);
  if(params.get('whoop')==='error'){
    set('whoopHealthMeta','WHOOP-Verbindung wurde nicht abgeschlossen. Du kannst es erneut versuchen.');
    history.replaceState(null,'',location.pathname+location.hash);
  }else if(params.get('whoop')==='connected'){
    history.replaceState(null,'',location.pathname+location.hash);
  }

  check();
  setInterval(()=>{if(session())loadSummary();},10*60*1000);
})();


/* Daily Tasks — Supabase-backed, secured by the active DG OS device session. */
(() => {
  'use strict';

  const EDGE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/tasks';
  const SESSION_KEY='dgos.whoopSession';
  const $=id=>document.getElementById(id);
  const form=$('taskQuickForm');
  if(!form)return;

  function session(){ return localStorage.getItem(SESSION_KEY)||''; }
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

  async function load(){
    const token=session();
    if(!token){
      note('Für die synchronisierte Aufgabenliste fehlt auf diesem Gerät noch die DG-OS-Sitzung. Öffne einmal Gesundheit/WHOOP auf diesem Gerät.','error');
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
      return;
    }

    try{
      set('taskDateLabel',prettyDate(todayZurich()));
      const data=await api('today?date='+encodeURIComponent(todayZurich()));
      render(data);
      note('');
      form.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);
    }catch(err){
      if(err.status===401){
        note('Deine DG-OS-Gerätesitzung ist abgelaufen. Verbinde WHOOP auf diesem Gerät einmal neu.','error');
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
      note(err.status===401?'Gerätesitzung abgelaufen. Bitte WHOOP einmal neu verbinden.':'Aufgabe konnte nicht gespeichert werden.','error');
    }finally{button.disabled=false;}
  });

  load();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  window.addEventListener('focus',load);
})();
