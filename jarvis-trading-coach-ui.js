/* DG OS · Jarvis personal Setup Coach.
 * Purely owner-entered setup preferences, transparently computed feedback.
 * No browser secret, no fake wins, no implicit strategy/risk edits.
 */
(()=>{
  'use strict';
  const root=document.getElementById('jtcCoach');
  const engine=window.DGOSTradingCoachEngine;
  if(!root||!engine)return;
  const $=name=>document.getElementById(name);
  const endpoint='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-trading-coach';
  let items=[],loaded=false,busy=false;
  const localToken=()=>{try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return '';}};
  const fields=['label','side','session','timeframe','liquidity','zone','confirmation'];
  const form=$('jtcForm');
  function status(message,error=false){const el=$('jtcStatus');el.textContent=message;el.dataset.error=String(error);}
  function text(id,value){const target=$(id);if(target)target.textContent=String(value||'');}
  function element(tag,className,content){
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(content!==undefined)e.textContent=content;
    return e;
  }
  function capture(){
    return Object.fromEntries(fields.map(k=>[k,$('jtc'+k[0].toUpperCase()+k.slice(1)).value]).concat([
      ['note',$('jtcNote').value.trim()],
      ['resultR',$('jtcResultR').value.trim()]
    ]));
  }
  function shortDate(value){
    const d=new Date(value);
    return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('de-CH',{
      timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
    }).format(d)+' CH':'Ohne Datum';
  }
  function summary(){
    if(!localToken())return 'Das Trading-Playbook ist privat. Bitte kopple zuerst dein Gerät im Jarvis-Bereich mit Telegram.';
    if(!loaded)return 'Dein privates Trading-Playbook wird noch geladen. Öffne den Setup Coach und prüfe deine Verbindung.';
    return engine.coachThoughts(items);
  }
  function drawList(){
    const host=$('jtcExamples');
    host.replaceChildren();
    const report=engine.reviewAnalysis(items);
    text('jtcCount',report.total+' Setups');
    text('jtcGoodCount',report.labels.good);
    text('jtcAvoidCount',report.labels.avoid);
    text('jtcMissedCount',report.labels.missed);
    text('jtcThoughts',engine.coachThoughts(items));
    if(!items.length){
      host.append(element('p','jtc-empty','Noch keine Setups bewertet. Deine Bewertungen bleiben privat und werden erst nach «Als Beispiel speichern» gesichert.'));
      return;
    }
    for(const item of items.slice(0,30)){
      const row=element('article','jtc-example');
      row.dataset.label=item.label;
      const header=element('div','jtc-example-head');
      const title=element('strong','',engine.name(item.label)+' · '+engine.name(item.side));
      const when=element('small','',shortDate(item.createdAt));
      header.append(title,when);
      const meta=element('p','jtc-example-meta',
        [item.session,item.timeframe,item.liquidity,item.zone,item.confirmation].map(engine.name).join(' · '));
      row.append(header,meta);
      if(item.note)row.append(element('p','jtc-example-note',item.note));
      if(item.resultR!=null)row.append(element('small','jtc-result-r',
        'Selbst eingetragen: '+Number(item.resultR).toFixed(2)+' R · nicht brokerverifiziert'));
      const del=element('button','jtc-delete','Löschen');
      del.type='button';del.setAttribute('aria-label','Dieses Setup löschen');del.dataset.exampleId=item.id;
      del.addEventListener('click',()=>void remove(item.id));
      row.append(del);host.append(row);
    }
  }
  function drawAdvice(assessment){
    const host=$('jtcAssessment');
    host.replaceChildren();
    host.dataset.state=assessment.status;
    host.append(element('strong','',assessment.headline));
    host.append(element('p','jtc-evidence',assessment.evidence||''));
    for(const reason of assessment.reasons||[])host.append(element('p','jtc-reason','• '+reason));
    host.append(element('small','jtc-assessment-note',assessment.basis||
      'Coach-Hypothese aus deinen Bewertungen. Kein Live-Entry oder Gewinnversprechen.'));
  }
  function evaluate(){
    const candidate=capture();
    const result=engine.evaluate(candidate,items);
    drawAdvice(result);
    return result;
  }
  async function api(action,body){
    const token=localToken();
    if(!token)throw Error('device_pairing_required');
    const response=await fetch(endpoint+'?action='+encodeURIComponent(action),{
      method:body?'POST':'GET',cache:'no-store',
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    let payload={};try{payload=await response.json();}catch{}
    if(!response.ok)throw Error(payload.error||'temporary_failure');
    return payload;
  }
  function describeError(error){
    const msg=error?.message||'';
    if(msg==='device_pairing_required')return 'Dein Gerät ist nicht gekoppelt. Verbinde es erneut mit Jarvis über Telegram.';
    if(msg==='invalid_example')return 'Bitte prüfe die Setup-Felder und dein R-Ergebnis.';
    if(msg==='example_limit_reached')return 'Maximal 250 Beispiele. Lösche alte Bewertungen, bevor du neue hinzufügst.';
    if(msg==='slow_down')return 'Bitte warte kurz und versuche es nochmals.';
    return 'Private Setups momentan nicht erreichbar. Keine Daten lokal gespeichert.';
  }
  async function refresh(){
    if(busy)return;
    if(!localToken()){
      loaded=false;items=[];drawList();
      status('Kopple Jarvis zuerst mit Telegram, um deine privaten Setups zu laden.',true);
      return;
    }
    busy=true;status('Deine privaten Setups werden geladen …');
    try{
      const response=await api('list');
      if(!Array.isArray(response.items)||response.source!=='owner_manual')throw Error('invalid_result');
      items=response.items.map(engine.normalize).filter(Boolean);
      loaded=true;drawList();evaluate();
      status('Privat geladen · '+items.length+' gespeicherte Bewertungen');
    }catch(error){
      loaded=false;items=[];drawList();
      status(describeError(error),true);
    }finally{busy=false;}
  }
  async function remove(id){
    if(busy)return;
    if(!window.confirm('Dieses Beispiel dauerhaft aus deinem persönlichen Playbook löschen?'))return;
    busy=true;
    try{
      const response=await api('delete',{id});
      if(!response.deleted)throw Error('temporary_failure');
      items=items.filter(x=>x.id!==id);
      drawList();evaluate();status('Deine Bewertung wurde gelöscht.');
    }catch(e){status(describeError(e),true);}
    finally{busy=false;}
  }
  async function save(event){
    event.preventDefault();
    if(busy)return;
    if(!localToken()){status(describeError(Error('device_pairing_required')),true);return;}
    const input=capture(),normalized=engine.normalize(input);
    if(!normalized){status('Wähle alle Felder und ein gültiges R-Ergebnis.',true);return;}
    if(input.note.length<8){status('Schreib bitte mindestens acht Zeichen: Warum war dieses Setup für dich gut, schlecht oder verpasst?',true);return;}
    busy=true;$('jtcSave').disabled=true;
    try{
      const response=await api('create',input);
      const row=engine.normalize(response.item);
      if(!row||!response.stored)throw Error('invalid_response');
      items.unshift(row);loaded=true;
      drawList();evaluate();
      $('jtcNote').value='';$('jtcResultR').value='';
      status('Gespeichert: Jarvis hat deine BEWERTUNG als Beispiel aufgenommen – noch keine allgemeingültige Trading-Regel.');
    }catch(e){status(describeError(e),true);}
    finally{busy=false;$('jtcSave').disabled=false;}
  }
  function open(){
    root.hidden=false;
    root.scrollIntoView?.({behavior:'smooth',block:'start'});
    $('jtcLabel')?.focus();
    if(!loaded)void refresh();
  }
  // No mutation of a user's strategy, no live trade broadcasts.
  window.DGOSTradingCoach=Object.freeze({open,summary,refresh});
  form.addEventListener('submit',save);
  $('jtcEvaluate').addEventListener('click',()=>{
    evaluate();
    $('jtcAssessment').scrollIntoView?.({behavior:'smooth',block:'nearest'});
  });
  $('jtcReload').addEventListener('click',()=>void refresh());
  for(const id of fields){
    $('jtc'+id[0].toUpperCase()+id.slice(1))?.addEventListener('change',evaluate);
  }
  window.addEventListener('dgos-device-session',()=>void refresh());
  window.addEventListener('dgos-device-session-invalid',()=>{
    items=[];loaded=false;drawList();status('Gerät erneut koppeln.',true);
  });
  window.addEventListener('dgos-trading-coach-open',open);
  drawList();
  if(localToken())void refresh();
  else status('Verbinde dein Gerät mit Telegram, um Setups sicher zu speichern.',true);
})();
