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

  function updateWorkspaceControls(){
    const account=currentAccount();
    $('emailWorkspaceTitle').textContent=account?account.label+' E-Mail':'Postfach';
    $('emailWorkspaceAddress').textContent=account?account.email:'';
    const connect=$('emailConnect'),compose=$('emailCompose');
    if(!account){connect.disabled=true;compose.disabled=true;return;}
    if(!state.apiAvailable){
      const remote=remoteServerBase();connect.hidden=false;connect.disabled=!remote;connect.textContent=remote?'Sichere Server-Version öffnen':'DG OS Server nicht verbunden';compose.disabled=true;
      setNotice(remote?'Für E-Mails innerhalb von DG OS öffne die sichere Server-Version. Auf GitHub Pages werden keine Mail-Tokens verarbeitet.':'Für die interne E-Mail-Zentrale muss zuerst der sichere DG OS Server verbunden werden.','warn');return;
    }
    if(!state.status||!state.status.configured){connect.hidden=false;connect.disabled=true;connect.textContent='Google OAuth nicht eingerichtet';compose.disabled=true;setNotice('Google Gmail OAuth ist auf dem Server noch nicht konfiguriert. Keine Maildaten werden abgerufen.','warn');return;}
    const item=statusAccount(state.account),connected=Boolean(state.status.authenticated&&item&&item.connected);
    connect.hidden=connected;connect.disabled=false;connect.textContent='Mit Google verbinden';compose.disabled=!connected;
    if(!connected)setNotice('Dieses Postfach ist noch nicht mit DG OS verbunden.','warn');
  }

  function showWorkspace(accountId){
    state.account=accountId;state.selected.clear();state.message=null;state.reply=null;workspace.classList.remove('hidden');updateWorkspaceControls();
    $('emailMessageDetail').innerHTML='<p class="personal-empty">Öffne eine E-Mail, um sie hier zu lesen.</p>';
    if(state.apiAvailable&&state.status&&state.status.authenticated){const item=statusAccount(accountId);if(item&&item.connected)loadMessages();}
    workspace.scrollIntoView({behavior:'smooth',block:'start'});
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
  $('emailConnect').addEventListener('click',()=>{if(!state.account)return;if(!state.apiAvailable){const remote=remoteServerBase();if(remote)window.location.href=remote+'/#personalEmail';return;}window.location.href='./api/gmail/oauth/start?account='+encodeURIComponent(state.account);});
  $('emailCompose').addEventListener('click',openCompose);$('emailCloseWorkspace').addEventListener('click',()=>workspace.classList.add('hidden'));$('emailTrashSelected').addEventListener('click',()=>trashMessages(Array.from(state.selected)));$('closeEmailCompose').addEventListener('click',()=>$('emailComposeDialog').close());
  $('emailSearchForm').addEventListener('submit',event=>{event.preventDefault();state.query=$('emailSearch').value.trim();loadMessages();});
  $('emailComposeForm').addEventListener('submit',async event=>{
    event.preventDefault();$('emailComposeError').textContent='';
    const payload={account:state.account,to:$('emailComposeTo').value.trim(),subject:$('emailComposeSubject').value.trim(),body:$('emailComposeBody').value};if(state.reply)Object.assign(payload,state.reply);
    try{await api('./api/gmail/send',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});$('emailComposeDialog').close();setNotice('E-Mail wurde über '+currentAccount().label+' gesendet.','ok');}
    catch(_){$('emailComposeError').textContent='E-Mail konnte nicht gesendet werden. Bitte Empfänger, Verbindung und Google-Anmeldung prüfen.';}
  });

  (async()=>{
    await probeStatus();const params=new URLSearchParams(window.location.search);const connectedAccount=params.get('gmail')==='connected'?params.get('account'):null;
    if(connectedAccount&&accounts[connectedAccount]){showWorkspace(connectedAccount);history.replaceState(null,'',window.location.pathname+window.location.hash);}
    else if(params.get('gmail')==='error'){$('emailHubStatus').textContent='Google-Verbindung wurde nicht abgeschlossen. Es wurden keine Maildaten gespeichert.';history.replaceState(null,'',window.location.pathname+window.location.hash);}
  })();
})();
