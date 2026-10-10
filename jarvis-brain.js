/* DG OS Jarvis Brain & Daily Planner. Owner-paired, no automatic writes. */
(() => {
  'use strict';
  const root=document.getElementById('jarvisIntelligence');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const API='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-brain';
  const LABELS={profile:'Über mich',preference:'Vorliebe',goal:'Ziel',project:'Projekt',routine:'Gewohnheit',note:'Wissenswert'};
  const ERRORS={
    device_pairing_required:'Bitte verbinde dieses Gerät zuerst im Jarvis-Bereich mit Telegram.',
    invalid_memory:'Bitte Kategorie, Titel und Erinnerung prüfen.',
    memory_limit_reached:'Du hast 250 Erinnerungen erreicht. Lösche zuerst nicht mehr benötigte Einträge.',
    invalid_date:'Ungültiges Datum.',
    ai_not_configured:'Für das persönliche Gespräch fehlt der OpenAI API-Key im bestehenden DG-OS-Server. Deine Erinnerungen und dein Tagesplan funktionieren weiter.',
    ai_unavailable:'Die KI ist gerade nicht erreichbar. Deine Erinnerungen bleiben gespeichert.',
    slow_down:'Bitte einen Moment warten und erneut fragen.',
    question_required:'Bitte eine Frage eingeben.',
    temporary_failure:'Der Server ist gerade nicht erreichbar. Bitte erneut versuchen.'
  };
  let memories=[],loaded=false,loading=false,editingId='',selectedTab='plan',dayOffset=0;
  const readToken=()=>{try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return '';}};
  const errorMessage=e=>ERRORS[e?.message]||'Anfrage fehlgeschlagen. Bitte erneut versuchen.';
  const status=(txt,error=false)=>{ $('jbStatus').textContent=txt;$('jbStatus').dataset.error=String(error); };
  const el=(tag,cls,text)=>{
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=String(text);
    return element;
  };
  function formatDate(date,options={}) {
    return new Intl.DateTimeFormat('de-CH',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',...options}).format(new Date(date+'T12:00:00Z'));
  }
  function todayZurich(){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return v.year+'-'+v.month+'-'+v.day;
  }
  function dayValue(){
    const d=new Date(todayZurich()+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+dayOffset);
    return d.toISOString().slice(0,10);
  }
  async function api(action,payload,params={}){
    const token=readToken();
    if(!token)throw Error('device_pairing_required');
    const p=new URLSearchParams({action,...params});
    const response=await fetch(API+'?'+p,{method:payload?'POST':'GET',cache:'no-store',
      headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok)throw Error(result.error||'request_failed');
    return result;
  }
  function switchTab(tab){
    if(!['brain','plan'].includes(tab))return;
    selectedTab=tab;
    root.querySelectorAll('button[data-jb-tab]').forEach(btn=>{
      const active=btn.dataset.jbTab===tab;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-selected',String(active));
    });
    $('jbPlanPanel').hidden=tab!=='plan';
    $('jbBrainPanel').hidden=tab!=='brain';
    if(tab==='brain'&&!loaded)loadMemories();
    if(tab==='plan')loadPlan();
  }
  function drawMemories(){
    const list=$('jbMemoryList'),needle=$('jbMemorySearch').value.trim().toLocaleLowerCase('de');
    const selected=memories.filter(item=>!needle||(item.title+' '+item.content+' '+(LABELS[item.category]||'')).toLocaleLowerCase('de').includes(needle));
    $('jbMemoryCount').textContent=String(memories.length);
    list.replaceChildren();
    if(!selected.length){
      list.append(el('p','jb-empty',needle?'Keine passende Erinnerung gefunden.':'Jarvis hat noch keine bestätigten Erinnerungen. Du kannst oben die erste hinzufügen.'));
      return;
    }
    const fragment=document.createDocumentFragment();
    for(const item of selected){
      const row=el('div','jb-memory-row');
      const copy=el('div','jb-memory-copy');
      copy.append(el('span','',LABELS[item.category]||'Wissenswert'),el('strong','',item.title),el('p','',item.content));
      const actions=el('div','jb-memory-actions');
      const edit=el('button','','Bearbeiten'),del=el('button','','Löschen');
      edit.type=del.type='button';
      edit.setAttribute('aria-label','Erinnerung '+item.title+' bearbeiten');
      del.setAttribute('aria-label','Erinnerung '+item.title+' löschen');
      edit.addEventListener('click',()=>{
        editingId=item.id;
        $('jbMemoryCategory').value=item.category;
        $('jbMemoryTitle').value=item.title;
        $('jbMemoryContent').value=item.content;
        $('jbMemorySubmit').textContent='Änderungen speichern';
        $('jbMemoryCancel').hidden=false;
        $('jbMemoryForm').scrollIntoView({behavior:'smooth',block:'center'});
        $('jbMemoryTitle').focus();
        status('Bearbeite die Erinnerung und speichere deine Änderungen.');
      });
      del.addEventListener('click',async()=>{
        if(!window.confirm('Erinnerung «'+item.title+'» dauerhaft löschen?'))return;
        del.disabled=true;
        try{
          await api('delete',{id:item.id});
          memories=memories.filter(x=>x.id!==item.id);
          if(editingId===item.id)resetEdit();
          drawMemories();status('Erinnerung dauerhaft gelöscht.');
        }catch(e){status(errorMessage(e),true);}finally{del.disabled=false;}
      });
      actions.append(edit,del);row.append(copy,actions);fragment.append(row);
    }
    list.append(fragment);
  }
  function resetEdit(){
    editingId='';
    $('jbMemoryForm').reset();
    $('jbMemorySubmit').textContent='Erinnerung speichern';
    $('jbMemoryCancel').hidden=true;
  }
  async function loadMemories(){
    if(loading)return;
    loading=true;
    if(!readToken()){status('Bitte dein Gerät einmal über Telegram mit Jarvis koppeln.',true);loading=false;return;}
    status('Jarvis lädt dein Gedächtnis …');
    try{
      const result=await api('list');
      memories=Array.isArray(result.items)?result.items:[];
      loaded=true;drawMemories();status('Gedächtnis bereit · '+memories.length+' bestätigte Erinnerungen.');
    }catch(e){status(errorMessage(e),true);}
    finally{loading=false;}
  }
  $('jbMemoryForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const category=$('jbMemoryCategory').value,title=$('jbMemoryTitle').value.trim(),content=$('jbMemoryContent').value.trim();
    if(!title||!content)return;
    const button=$('jbMemorySubmit');button.disabled=true;
    try{
      const result=await api(editingId?'update':'remember',{...(editingId?{id:editingId}:{}),category,title,content});
      if(editingId)memories=memories.map(x=>x.id===editingId?result.item:x);
      else memories.unshift(result.item);
      resetEdit();loaded=true;drawMemories();status('Erinnerung sicher in DG OS gespeichert.');
    }catch(e){status(errorMessage(e),true);}
    finally{button.disabled=false;}
  });
  $('jbMemoryCancel').addEventListener('click',resetEdit);
  $('jbMemorySearch').addEventListener('input',drawMemories);
  $('jbMemoryReload').addEventListener('click',loadMemories);
  root.querySelectorAll('button[data-jb-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.jbTab)));
  const shortTime=v=>typeof v==='string'?v.slice(0,5):'';
  function localEvents(date){
    // Personal Calendar already stores local events under this key. Do not
    // upload or silently synchronize them; label them as device-only.
    try{
      const items=JSON.parse(localStorage.getItem('dgos.personal.events.v1')||'[]');
      return Array.isArray(items)?items.filter(v=>v&&v.date===date&&typeof v.title==='string'&&v.title.trim())
        .slice(0,25).map(v=>({id:'local:'+v.id,title:v.title,kind:'appointment',date,time:shortTime(v.start),details:'Nur auf diesem Gerät',local:true})):[];
    }catch{return [];}
  }
  function planRow(item,selectedDate){
    const row=el('div','jb-plan-row'+(item.overdue?' is-overdue':''));
    const copy=el('div');
    copy.append(el('strong','',item.title||'Ohne Titel'));
    const meta=[item.overdue?'Überfällig seit '+item.date:'',
      item.local?'Lokaler Kalender':'',item.priority==='high'?'Wichtig':'',item.details||''].filter(Boolean).join(' · ');
    if(meta)copy.append(el('small','',meta.slice(0,175)));
    const right=el('span','jb-plan-time',item.time?shortTime(item.time):item.date===selectedDate?'Heute':'Offen');
    row.append(copy,right);
    return row;
  }
  function sortedFixed(items){
    return items.sort((a,b)=>{
      const date=String(a.date||'').localeCompare(String(b.date||''));
      return date||String(a.time||'99:99').localeCompare(String(b.time||'99:99'));
    });
  }
  function fillPanel(id,items,date,emptyText){
    const host=$(id);host.replaceChildren();
    if(!items.length){host.append(el('p','jb-empty',emptyText));return;}
    const fragment=document.createDocumentFragment();
    items.slice(0,35).forEach(x=>fragment.append(planRow(x,date)));
    host.append(fragment);
    if(items.length>35)host.append(el('p','jb-empty','+'+(items.length-35)+' weitere Einträge im Kalender / Privatbereich.'));
  }
  function showHighlights(appointments,tasks,bills){
    const data=[['Termine',appointments.filter(x=>!x.overdue).length],['Aufgaben',tasks.filter(x=>!x.overdue).length],['Offene Rechnungen',bills.length]];
    const host=$('jbPlanHighlights');host.replaceChildren();
    data.forEach(([label,value])=>{
      const tile=el('div','jb-highlight');
      tile.append(el('span','',label),el('strong','',String(value)));host.append(tile);
    });
  }
  async function loadPlan(){
    const date=dayValue(), title=dayOffset===0?'Heute im Blick':dayOffset===1?'Dein morgiger Tag':'Tagesübersicht';
    $('jbPlanTitle').textContent=title;
    $('jbPlanDate').textContent=formatDate(date)+' · Europe/Zurich';
    [['jbPlanToday',dayOffset===0],['jbPlanTomorrow',dayOffset===1]].forEach(([id,v])=>$(id).setAttribute('aria-pressed',String(v)));
    if(!readToken()){status('Bitte dieses Gerät zuerst im Jarvis-Bereich mit Telegram koppeln.',true);return;}
    $('jbPlanFixed').replaceChildren(el('p','jb-empty','Termine werden geladen …'));
    $('jbPlanTasks').replaceChildren(el('p','jb-empty','Aufgaben werden geladen …'));
    try{
      const response=await api('plan',undefined,{date});
      if(dayValue()!==date)return;
      const plan=response.plan||{};
      const fixed=sortedFixed([...(plan.appointments||[]),...(plan.bills||[]),...localEvents(date)]);
      const tasks=(plan.tasks||[]).sort((a,b)=>Number(Boolean(b.overdue))-Number(Boolean(a.overdue))
        ||Number(b.priority==='high')-Number(a.priority==='high')||String(a.time||'99:99').localeCompare(String(b.time||'99:99')));
      fillPanel('jbPlanFixed',fixed,date,'Keine gespeicherten Termine oder Rechnungen für diesen Tag.');
      fillPanel('jbPlanTasks',tasks,date,'Keine offenen Aufgaben für diesen Tag.');
      showHighlights(fixed,tasks,plan.bills||[]);
      const shopping=Array.isArray(plan.shopping)?plan.shopping:[];
      $('jbPlanShopping').textContent=shopping.length
        ? shopping.slice(0,7).map(x=>x.title).join(' · ')+(shopping.length>7?' · +'+(shopping.length-7)+' mehr':'')
        : 'Keine offenen Einkäufe.';
      const late=tasks.filter(x=>x.overdue).length+fixed.filter(x=>x.overdue).length;
      status(late?late+' ältere offene Einträge im Plan · bitte prüfen.':'Dein Tagesplan ist aktuell. Nichts wurde automatisch verändert.');
    }catch(e){
      $('jbPlanFixed').replaceChildren(el('p','jb-empty','Tagesplan nicht verfügbar.'));
      $('jbPlanTasks').replaceChildren(el('p','jb-empty','Daten konnten nicht geladen werden.'));
      status(errorMessage(e),true);
    }
  }
  $('jbPlanToday').addEventListener('click',()=>{dayOffset=0;loadPlan();});
  $('jbPlanTomorrow').addEventListener('click',()=>{dayOffset=1;loadPlan();});
  $('jbPlanReload').addEventListener('click',loadPlan);
  $('jbPlanOpenPrivate').addEventListener('click',()=>{
    document.querySelector('.bottom-nav button[data-target="personalPrivate"]')?.click();
  });
  $('jbAskForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const question=$('jbAskInput').value.trim();
    if(!question)return;
    const btn=$('jbAskSubmit');btn.disabled=true;
    $('jbAskAnswer').textContent='Jarvis denkt nach und prüft deine bestätigten Erinnerungen …';
    try{
      const result=await api('ask',{question,date:todayZurich()});
      const answer=result.answer||'Ich habe dazu noch keine bestätigten Informationen.';
      $('jbAskAnswer').textContent=answer;
      // Existing voice engine observes this text and may speak if the owner
      // switched "Antworten vorlesen" on. No provider key reaches the browser.
      const reply=$('personalJarvisReply');if(reply)reply.textContent=answer;
      window.dispatchEvent(new CustomEvent('dgos-jarvis-final-response',{detail:{text:answer}}));
      status('Jarvis hat aus deinem bestätigten Gedächtnis und deinen DG-OS-Daten geantwortet.');
    }catch(e){$('jbAskAnswer').textContent=errorMessage(e);status(errorMessage(e),true);}
    finally{btn.disabled=false;}
  });
  window.addEventListener('dgos-device-session',()=>{loadMemories();loadPlan();});
  window.addEventListener('dgos-private-updated',()=>{if(selectedTab==='plan')loadPlan();});
  window.addEventListener('dgos-jarvis-tasks-updated',()=>{if(selectedTab==='plan')loadPlan();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.dataset.dgosRoute==='jarvis')loadPlan();});
  // Do not load personal content until a paired session exists.
  if(readToken()){loadMemories();loadPlan();}
  else status('Dein persönlicher Bereich wartet auf die einmalige Telegram-Geräteverbindung.',true);
})();
