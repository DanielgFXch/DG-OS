/* DG OS Private Life Hub – accessible on every owner's Telegram-paired device. */
(() => {
  'use strict';
  const root = document.getElementById('personalPrivate');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const ENDPOINT = 'https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-private';
  const LABELS = {
    shopping: { heading: 'Was brauchst du?', list: 'Deine Einkaufsliste', title: 'Produkt', placeholder: 'z. B. Milch, Eier, Brot', hint: 'Sprich deine Einkaufsliste. Jarvis trägt den erkannten Text zuerst ins Feld ein.' },
    appointment: { heading: 'Termin eintragen', list: 'Deine privaten Termine', title: 'Termin', placeholder: 'z. B. Zahnarzt oder Familienessen', hint: 'Sprich den Termin. Prüfe danach Datum und Uhrzeit vor dem Speichern.' },
    idea: { heading: 'Idee festhalten', list: 'Was du machen möchtest', title: 'Vorhaben oder Idee', placeholder: 'z. B. Wochenendtrip nach Portugal', hint: 'Sprich deine Idee. Du kannst sie danach in Ruhe ergänzen.' },
    note: { heading: 'Notiz erstellen', list: 'Deine privaten Notizen', title: 'Notiz', placeholder: 'Was willst du dir merken?', hint: 'Sprich deine Notiz. Kontrolliere den Text vor dem Speichern.' }
  };
  let tab = 'shopping', items = [], waiting = false, speech = null, recorder = null, recordingStream = null, recordTimer = null, photoData = '', photoObjectURL = '';
  const tabButtons = [...root.querySelectorAll('[data-private-tab]')];
  const token = () => { try { return localStorage.getItem('dgos.deviceSession') || ''; } catch { return ''; } };
  const message = (value, isError=false) => { $('dgPrivStatus').textContent = value; $('dgPrivStatus').dataset.error = String(isError); };
  const ERRORS = {
    device_pairing_required: 'Bitte verbinde dieses Gerät im Jarvis-Bereich einmal mit Telegram.',
    ai_not_configured: 'Der KI-Schlüssel für Foto-/Spracherkennung fehlt im aktiven DG-OS-Server.',
    invalid_image: 'Bitte ein anderes Kühlschrankfoto auswählen.',
    vision_unavailable: 'Die Fotoerkennung ist derzeit nicht erreichbar.',
    vision_parse_failed: 'Jarvis konnte die Fotoauswertung nicht lesen. Bitte erneut versuchen.',
    invalid_audio: 'Die Sprachaufnahme konnte nicht verarbeitet werden.',
    transcription_unavailable: 'Die Spracherkennung ist gerade nicht verfügbar.',
    audio_too_large: 'Die Aufnahme ist zu gross. Bitte kürzer sprechen.',
    slow_down: 'Bitte kurz warten und erneut versuchen.',
    invalid_appointment: 'Bitte ein gültiges Termindatum und gegebenenfalls eine Uhrzeit eingeben.',
    invalid_item: 'Bitte zuerst einen Titel eingeben.',
    backend_unavailable: 'Der Privatserver ist momentan nicht erreichbar.'
  };
  function errText(e) { return ERRORS[e?.message] || e?.message || 'Verbindung fehlgeschlagen. Bitte erneut versuchen.'; }
  async function request(action, payload, isForm = false) {
    const secret = token();
    if (!secret) throw Error('device_pairing_required');
    const headers = { Authorization: 'Bearer ' + secret };
    if (payload && !isForm) headers['Content-Type'] = 'application/json';
    const response = await fetch(ENDPOINT + '?action=' + encodeURIComponent(action), {
      method: payload ? 'POST' : 'GET', headers, cache: 'no-store',
      ...(payload ? { body: isForm ? payload : JSON.stringify(payload) } : {})
    });
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw Error(result.error || 'server_error_' + response.status);
    return result;
  }
  const el = (tag, cssClass, text) => {
    const e = document.createElement(tag);
    if (cssClass) e.className = cssClass;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  const prettyDate = d => {
    const date = new Date(d + 'T12:00:00');
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : '';
  };
  function itemsBy(kind, done) {
    return items.filter(x => x.kind === kind && (x.status === 'done') === done)
      .sort((a,b) => kind === 'appointment' && !done
        ? String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31')) || String(a.time||'').localeCompare(String(b.time||''))
        : String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function count() {
    for (const kind of Object.keys(LABELS)) $('dgPrivCount' + kind[0].toUpperCase() + kind.slice(1)).textContent = String(itemsBy(kind,false).length);
  }
  function itemRow(x) {
    const row = el('div', 'dg-private-row' + (x.status==='done'?' is-done':''));
    const check = el('button', 'dg-private-check', x.status==='done' ? '↺' : '✓');
    check.type='button';check.setAttribute('aria-label',x.status==='done'?'Wieder öffnen':'Erledigt markieren');
    check.addEventListener('click',async()=>{
      if (waiting) return;
      try { check.disabled = true; const result = await request('toggle',{id:x.id,done:x.status!=='done'});
        items=items.map(y=>y.id===x.id?result.item:y); render(); notifyOtherViews();
      } catch(e) { message(errText(e),true); } finally { check.disabled=false; }
    });
    const copy = el('div','dg-private-row-body');
    copy.append(el('strong','dg-private-row-title',x.title));
    const meta = [x.date ? prettyDate(x.date) : '',x.time||'',x.details||''].filter(Boolean).join(' · ');
    if(meta) copy.append(el('small','dg-private-row-meta',meta));
    const del=el('button','dg-private-delete','×');
    del.type='button';del.setAttribute('aria-label','Eintrag löschen');
    del.addEventListener('click', async()=>{
      if (!window.confirm('«'+x.title+'» wirklich löschen?')) return;
      del.disabled=true;
      try { await request('delete',{id:x.id});items=items.filter(y=>y.id!==x.id);render();message('Eintrag gelöscht.');notifyOtherViews(); }
      catch(e){message(errText(e),true);}finally{del.disabled=false;}
    });
    row.append(check,copy,del);return row;
  }
  function render() {
    const open=itemsBy(tab,false),done=itemsBy(tab,true);
    const list=$('dgPrivList');list.replaceChildren();
    if(!open.length)list.append(el('p','dg-private-empty',
      tab==='shopping'?'Noch nichts auf der Einkaufsliste.':tab==='appointment'?'Keine privaten Termine eingetragen.':tab==='idea'?'Noch keine Vorhaben festgehalten.':'Noch keine Notizen.'));
    else open.forEach(x=>list.append(itemRow(x)));
    const complete=$('dgPrivCompleted');complete.replaceChildren();done.forEach(x=>complete.append(itemRow(x)));
    $('dgPrivCompletedWrap').hidden=done.length===0;
    $('dgPrivDoneCount').textContent=String(done.length);count();
  }
  function switchTab(kind) {
    if(!LABELS[kind])return;
    tab=kind;
    tabButtons.forEach(b=>{const active=b.dataset.privateTab===kind;b.classList.toggle('is-active',active);b.setAttribute('aria-selected',String(active));});
    $('dgPrivFormHeading').textContent=LABELS[kind].heading;
    $('dgPrivListHeading').textContent=LABELS[kind].list;
    $('dgPrivTitleLabel').textContent=LABELS[kind].title;
    $('dgPrivTitle').placeholder=LABELS[kind].placeholder;
    $('dgPrivVoiceHint').textContent=LABELS[kind].hint;
    $('dgPrivDetailsWrap').hidden=kind==='shopping';
    $('dgPrivDateWrap').hidden=kind!=='appointment';
    $('dgPrivDate').required=kind==='appointment';
    $('dgPrivFridgeCard').hidden=kind!=='shopping';
    $('dgPrivTitle').value='';$('dgPrivDetails').value='';
    render();
  }
  async function load() {
    if(!token()){message('Verbinde dieses Gerät einmal im Jarvis-Bereich über Telegram. Deine privaten Daten bleiben bis dahin geschützt.',true);return;}
    try {
      const result=await request('list');
      items=Array.isArray(result.items)?result.items:[];
      render();message('Privatbereich bereit · Daten synchronisiert.');
    } catch(e){message(errText(e),true);}
  }
  function notifyOtherViews(){window.dispatchEvent(new Event('dgos-private-updated'));}
  async function addOne(kind,title,extras={}) {
    const result=await request('add',{kind,title,...extras});
    items.unshift(result.item);return result.item;
  }
  function shoppingTitles(value) {
    return [...new Set(String(value).split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean))].slice(0,20);
  }
  $('dgPrivForm').addEventListener('submit',async event=>{
    event.preventDefault();if(waiting)return;
    const kind=tab, raw=$('dgPrivTitle').value.trim();
    const titles=kind==='shopping'?shoppingTitles(raw):[raw];
    if(!titles.length){message('Bitte zuerst etwas eingeben.',true);return;}
    if(kind==='appointment'&&!$('dgPrivDate').value){message('Bitte ein Datum für den Termin auswählen.',true);return;}
    waiting=true;$('dgPrivAdd').disabled=true;
    let completed=0;
    try {
      for(const title of titles){await addOne(kind,title,{
        details: $('dgPrivDetails').value.trim(),
        date:kind==='appointment'?$('dgPrivDate').value:undefined,
        time:kind==='appointment'?$('dgPrivTime').value:undefined,
        source:$('dgPrivTitle').dataset.speech==='true'?'voice':'ui'
      });completed++;}
      $('dgPrivTitle').value='';$('dgPrivTitle').dataset.speech='false';
      $('dgPrivDetails').value='';$('dgPrivTime').value='';
      render();message(completed===1?'Gespeichert.':completed+' Einträge gespeichert.');
      notifyOtherViews();
    } catch(e){render();message((completed?completed+' gespeichert. Rest fehlgeschlagen: ':'')+errText(e),true);}
    finally{waiting=false;$('dgPrivAdd').disabled=false;}
  });
  $('dgPrivReload').addEventListener('click',load);
  tabButtons.forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.privateTab)));
  function setRecognized(text) {
    let cleaned=String(text||'').trim();
    cleaned=cleaned.replace(/^(?:hey\s+)?jarvis[,\s]*/i,'')
      .replace(/^(?:bitte\s+)?(?:füge|füg|setze|setz|schreib|notiere|kaufe)\s+(?:mir\s+)?/i,'')
      .replace(/\s+(?:auf|zu|in)\s+(?:die|der|meine[rm]?)\s+einkaufsliste\.?$/i,'').trim();
    if(tab==='shopping') cleaned=cleaned.replace(/\s+und\s+/gi,', ');
    if (!cleaned)return message('Keine verständliche Sprache erkannt. Bitte erneut versuchen.',true);
    $('dgPrivTitle').value=cleaned.slice(0,240);
    $('dgPrivTitle').dataset.speech='true';
    $('dgPrivTitle').focus();
    message('Gesprochenen Text erkannt. Bitte prüfen und auf «Hinzufügen» drücken.');
  }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  function microphoneIdle(){ $('dgPrivMic').setAttribute('aria-pressed','false');$('dgPrivMic').textContent='🎙️ Sprechen'; }
  function stopRecording(){
    if(speech){try{speech.stop();}catch{}speech=null;}
    if(recorder&&recorder.state==='recording'){try{recorder.stop();}catch{}}
    if(recordTimer){clearTimeout(recordTimer);recordTimer=null;}
  }
  async function recordAudio() {
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder) throw Error('Dein Browser kann hier nicht aufnehmen. Bitte ein Gerät mit Mikrofon verwenden.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    recordingStream=stream;
    const types=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'];
    const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||'';
    if(!mime){stream.getTracks().forEach(t=>t.stop());recordingStream=null;throw Error('Das Audioformat dieses Browsers wird nicht unterstützt.');}
    const chunks=[];
    const active=new MediaRecorder(stream,{mimeType:mime});recorder=active;
    active.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    active.onstop=async()=>{
      microphoneIdle();recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;
      if(recordTimer){clearTimeout(recordTimer);recordTimer=null;}
      const blob=new Blob(chunks,{type:mime});
      if(blob.size<100)return message('Keine Aufnahme erkannt. Bitte erneut sprechen.',true);
      const data=new FormData();
      data.append('audio',blob,mime.includes('mp4')?'audio.m4a':mime.includes('ogg')?'audio.ogg':'audio.webm');
      message('Jarvis verarbeitet deine Sprachaufnahme …');
      try{const result=await request('transcribe',data,true);setRecognized(result.transcript);}
      catch(e){message(errText(e),true);}
      recorder=null;
    };
    active.start();
    $('dgPrivMic').setAttribute('aria-pressed','true');$('dgPrivMic').textContent='■ Aufnahme beenden';
    message('Sprich jetzt. Tippe nochmals zum Beenden (max. 15 Sekunden).');
    recordTimer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},15000);
  }
  $('dgPrivMic').addEventListener('click',async()=>{
    if(recorder?.state==='recording'){recorder.stop();return;}
    if(speech){stopRecording();microphoneIdle();return;}
    if(SR){
      const recognition=new SR();speech=recognition;
      recognition.lang='de-DE';recognition.interimResults=false;recognition.maxAlternatives=1;
      recognition.onresult=e=>setRecognized(e.results?.[0]?.[0]?.transcript||'');
      recognition.onerror=e=>{message(e.error==='not-allowed'?'Bitte dem Browser Zugriff auf dein Mikrofon erlauben.':'Spracherkennung fehlgeschlagen. Bitte erneut versuchen oder Text eingeben.',true);};
      recognition.onend=()=>{speech=null;microphoneIdle();};
      try{recognition.start();$('dgPrivMic').setAttribute('aria-pressed','true');$('dgPrivMic').textContent='■ Zuhören';message('Jarvis hört zu …');}
      catch(e){speech=null;microphoneIdle();message('Mikrofon konnte nicht gestartet werden.',true);}
      return;
    }
    try{await recordAudio();}
    catch(e){microphoneIdle();message(errText(e),true);}
  });
  // Camera/photo data is compressed locally and used only for one temporary analysis request.
  // Nothing is written to Supabase Storage or the private organizer unless owner explicitly confirms suggestions.
  function compressPhoto(file) {
    return new Promise((resolve,reject)=>{
      if(!file.type.startsWith('image/'))return reject(Error('Bitte ein Foto auswählen.'));
      if(file.size>18_000_000)return reject(Error('Das Foto ist zu gross. Bitte eine kleinere Aufnahme wählen.'));
      const image=new Image(), url=URL.createObjectURL(file);
      image.onload=()=>{
        try {
          const canvas=document.createElement('canvas');
          const scale=Math.min(1,1280/Math.max(image.width,image.height));
          canvas.width=Math.max(1,Math.round(image.width*scale));
          canvas.height=Math.max(1,Math.round(image.height*scale));
          const ctx=canvas.getContext('2d');if(!ctx)throw Error('Foto konnte nicht vorbereitet werden.');
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          let encoded=canvas.toDataURL('image/jpeg',0.72);
          if(encoded.length>1_800_000){const ratio=Math.sqrt(1_350_000/encoded.length);const out=document.createElement('canvas');out.width=Math.round(canvas.width*ratio);out.height=Math.round(canvas.height*ratio);out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);encoded=out.toDataURL('image/jpeg',0.62);}
          if(encoded.length>1_850_000)throw Error('Foto ist für die Auswertung noch zu gross.');
          resolve(encoded);
        }catch(e){reject(e);}
        finally{URL.revokeObjectURL(url);}
      };
      image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Bild konnte nicht geöffnet werden.'));};
      image.src=url;
    });
  }
  $('dgPrivPhotoButton').addEventListener('click',()=>$('dgPrivPhoto').click());
  $('dgPrivPhoto').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    $('dgPrivSuggestions').hidden=true;photoData='';
    const button=$('dgPrivPhotoButton');button.disabled=true;
    message('Kühlschrankfoto wird vorbereitet …');
    try {
      photoData=await compressPhoto(file);
      if(photoObjectURL) URL.revokeObjectURL(photoObjectURL);
      photoObjectURL=URL.createObjectURL(file);
      $('dgPrivPhotoPreview').src=photoObjectURL;$('dgPrivPhotoPreview').hidden=false;
      message('Jarvis prüft dein Kühlschrankfoto. Einen Moment …');
      const result=await request('fridge',{image:photoData});
      const visible=$('dgPrivVisible');visible.replaceChildren();
      const seen=Array.isArray(result.visible)?result.visible:[];
      if(!seen.length)visible.append(el('span','dg-private-chip','Nichts eindeutig erkannt'));
      else seen.forEach(v=>visible.append(el('span','dg-private-chip',v)));
      const checkList=$('dgPrivCheckList');checkList.replaceChildren();
      const suggestions=Array.isArray(result.check)?result.check:[];
      if(!suggestions.length)checkList.append(el('p','dg-private-photo-note','Keine zuverlässigen Einkaufsvorschläge. Du kannst Produkte selbst eintragen.'));
      suggestions.forEach(name=>{
        const label=el('label');const input=document.createElement('input');
        input.type='checkbox';input.value=name;
        label.append(input,el('span','',name));checkList.append(label);
      });
      $('dgPrivAddSuggestions').hidden=!suggestions.length;
      $('dgPrivSuggestions').hidden=false;
      message('Foto ausgewertet. Bitte prüfe die Vorschläge und wähle selbst aus, was du kaufen willst.');
    }catch(e){message(errText(e),true);}
    finally{photoData='';e.target.value='';button.disabled=false;}
  });
  $('dgPrivAddSuggestions').addEventListener('click',async()=>{
    const suggestions=[...$('dgPrivCheckList').querySelectorAll('input:checked')].map(x=>x.value);
    if(!suggestions.length){message('Bitte zuerst die gewünschten Produkte auswählen.',true);return;}
    const button=$('dgPrivAddSuggestions');button.disabled=true;
    let added=0;
    try{
      const existing=new Set(items.filter(x=>x.kind==='shopping'&&x.status==='open').map(x=>x.title.toLocaleLowerCase('de')));
      for(const title of suggestions){
        if(existing.has(title.toLocaleLowerCase('de')))continue;
        await addOne('shopping',title,{source:'image'});added++;existing.add(title.toLocaleLowerCase('de'));
      }
      render();notifyOtherViews();message(added?added+' bestätigte Produkte hinzugefügt.':'Diese Produkte stehen bereits auf der Einkaufsliste.');
      $('dgPrivSuggestions').hidden=true;
    }catch(e){render();message((added?added+' hinzugefügt. ':'')+errText(e),true);}
    finally{button.disabled=false;}
  });
  window.addEventListener('dgos-device-session',load);
  window.addEventListener('focus',()=>{if(document.body.dataset.dgosRoute==='private')load();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.dataset.dgosRoute==='private')load();});
  window.addEventListener('pagehide',()=>{stopRecording();if(photoObjectURL)URL.revokeObjectURL(photoObjectURL);});
  switchTab('shopping');load();
})();
