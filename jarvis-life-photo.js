/* Jarvis Photo-to-action drafts. Owner confirms EVERY item before a write.
   Photos remain ephemeral on the device / one protected AI request, not in DB.
   Never execute payments. No contact details, IBAN, or amount is retained. */
(() => {
  'use strict';
  const root=document.getElementById('jarvisPhotoPanel');
  const input=document.getElementById('jarvisPhotoInput');
  const photoButton=document.getElementById('jarvisPhotoPick');
  if(!root||!input||!photoButton)return;
  const $=id=>document.getElementById(id);
  const endpoint='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-private?action=analyze-photo';
  const taskApi='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/tasks/create';
  const groceryApi='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-private?action=add-shopping';
  const token=()=>{try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return'';}};
  let pending=null,photoUrl='',busy=false;
  function say(text,status='Foto prüfen'){
    const reply=$('personalJarvisReply'),state=$('personalJarvisStatus');
    if(reply)reply.textContent=text;
    if(state)state.textContent=status;
  }
  function caption(text,error=false){
    const node=$('jarvisPhotoNotice');
    node.textContent=text;node.dataset.error=String(error);
  }
  function setBusy(v){busy=v;$('jarvisPhotoSave').disabled=v;photoButton.disabled=v;}
  function showPanel(){root.hidden=false;root.scrollIntoView({behavior:'smooth',block:'nearest'});}
  function dayToday(){return window.DGOSLifeIntent?.todayZurich()||new Date().toISOString().slice(0,10);}
  function createChip(text,checked){
    const label=document.createElement('label');label.className='jarvis-photo-chip';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=text;checkbox.checked=checked;
    const name=document.createElement('span');name.textContent=text;label.append(checkbox,name);return label;
  }
  function drawSuggestions(items){
    const host=$('jarvisPhotoItems');host.replaceChildren();
    if(!items.length){host.textContent='Kein Produkt sicher erkannt. Du kannst unten selbst einen Artikel ergänzen.';return;}
    items.forEach(value=>host.append(createChip(value,true)));
  }
  function refreshMode(){
    const shopping=$('jarvisPhotoKind').value==='shopping';
    $('jarvisPhotoShoppingWrap').hidden=!shopping;
    $('jarvisPhotoTaskWrap').hidden=shopping;
    $('jarvisPhotoSave').textContent=shopping?'Ausgewählte Produkte speichern':'Aufgabe speichern';
    if(shopping)caption('Produkte sind Vorschläge, nicht zwingend fehlende Lebensmittel. Bitte prüfen und bestätigen.');
    else caption('Foto als Aufgabenentwurf. Bitte Titel und Datum kontrollieren. Es wird keine Zahlung ausgelöst.');
  }
  function showDraft(draft) {
    pending=draft;
    const kind=draft.kind==='shopping'?'shopping':'task';
    $('jarvisPhotoKind').value=kind;
    $('jarvisPhotoTitle').value=draft.title||'';
    $('jarvisPhotoDate').value=dayToday();
    $('jarvisPhotoDateLabel').textContent='Datum (von dir bestätigen)';
    $('jarvisPhotoSummary').textContent=draft.summary||'Bitte kontrolliere die erkannten Informationen.';
    drawSuggestions(Array.isArray(draft.items)?draft.items:[]);
    showPanel();refreshMode();say('Ich habe das Foto angeschaut. Prüfe den Entwurf und bestätige ihn unten.','Entwurf bereit');
  }
  function compress(file){
    return new Promise((resolve,reject)=>{
      if(!file||!file.type.startsWith('image/'))return reject(Error('Bitte ein Bild auswählen.'));
      if(file.size>18_000_000)return reject(Error('Das Bild ist zu gross. Bitte ein kleineres Foto auswählen.'));
      const object=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{
        try{
          const canvas=document.createElement('canvas');const scale=Math.min(1,1280/Math.max(image.width,image.height));
          canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
          const ctx=canvas.getContext('2d');if(!ctx)throw Error('Fotoformat wird nicht unterstützt.');
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          let data=canvas.toDataURL('image/jpeg',0.70);
          if(data.length>1_850_000){
            const ratio=Math.sqrt(1_250_000/data.length);
            const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*ratio));smaller.height=Math.max(1,Math.round(canvas.height*ratio));
            smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);
            data=smaller.toDataURL('image/jpeg',0.62);
          }
          if(data.length>1_850_000)throw Error('Das Foto muss kleiner sein.');
          resolve(data);
        }catch(e){reject(e);}
        finally{URL.revokeObjectURL(object);}
      };
      image.onerror=()=>{URL.revokeObjectURL(object);reject(Error('Foto konnte nicht geladen werden.'));};
      image.src=object;
    });
  }
  async function authorizedRequest(url,payload){
    const t=token();
    if(!t)throw Error('Bitte dieses Gerät zuerst mit Jarvis über Telegram verbinden.');
    const response=await fetch(url,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok){
      if(response.status===401)throw Error('Deine Gerätesitzung ist abgelaufen. Bitte erneut mit Telegram verbinden.');
      if(data.error==='ai_not_configured')throw Error('Die Foto-KI benötigt noch den OpenAI-Key im DG-OS-Server.');
      if(data.error==='vision_unavailable'||data.error==='vision_parse_failed')throw Error('Foto konnte nicht eindeutig ausgewertet werden. Bitte neu aufnehmen oder direkt eintippen.');
      throw Error('Server gerade nicht erreichbar. Es wurde nichts gespeichert.');
    }
    return data;
  }
  function clear(){
    pending=null;root.hidden=true;
    $('jarvisPhotoTitle').value='';$('jarvisPhotoMore').value='';$('jarvisPhotoItems').replaceChildren();
    $('jarvisPhotoPreview').removeAttribute('src');$('jarvisPhotoPreview').hidden=true;
    if(photoUrl)URL.revokeObjectURL(photoUrl);
    photoUrl='';input.value='';
    caption('');
  }
  photoButton.addEventListener('click',()=>input.click());
  $('jarvisPhotoCancel').addEventListener('click',()=>{clear();say('Fotoentwurf verworfen. Es wurde nichts gespeichert.','Bereit');});
  $('jarvisPhotoKind').addEventListener('change',refreshMode);
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file||busy)return;
    pending=null;
    showPanel();setBusy(true);
    caption('Foto wird lokal verkleinert und zur einmaligen KI-Auswertung gesendet …');
    try{
      const image=await compress(file);
      if(photoUrl)URL.revokeObjectURL(photoUrl);
      photoUrl=URL.createObjectURL(file);$('jarvisPhotoPreview').src=photoUrl;$('jarvisPhotoPreview').hidden=false;
      const result=await authorizedRequest(endpoint,{image});
      showDraft(result.draft||{kind:'unknown',title:'',summary:'',items:[]});
    }catch(e){caption(e?.message||'Foto konnte nicht gelesen werden.',true);say('Foto konnte nicht ausgewertet werden. Bitte Foto oder Eingabe erneut versuchen.','Fehler');}
    finally{setBusy(false);input.value='';}
  });
  $('jarvisPhotoSave').addEventListener('click',async()=>{
    if(busy||!pending)return;
    setBusy(true);
    try{
      if($('jarvisPhotoKind').value==='shopping'){
        const selected=[...$('jarvisPhotoItems').querySelectorAll('input:checked')].map(x=>x.value);
        const extra=$('jarvisPhotoMore').value.trim();
        if(extra) selected.push(...extra.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean));
        if(!selected.length)throw Error('Bitte wähle zuerst mindestens ein Produkt.');
        if(selected.length>12||selected.some(v=>v.length>65))throw Error('Maximal zwölf Produkte mit je 65 Zeichen.');
        const result=await authorizedRequest(groceryApi,{items:selected});
        const added=Array.isArray(result.added)?result.added:[];
        const skipped=Array.isArray(result.skipped)?result.skipped:[];
        if(added.length)window.dispatchEvent(new Event('dgos-private-updated'));
        say(added.length?'Gespeichert: '+added.join(', ')+'.'+(skipped.length?' Schon auf der Liste: '+skipped.join(', ')+'.':''):'Alle ausgewählten Produkte sind bereits auf deiner Einkaufsliste.','Erledigt');
      }else{
        const title=$('jarvisPhotoTitle').value.trim(),dueDate=$('jarvisPhotoDate').value;
        if(title.length<3||title.length>160)throw Error('Bitte einen klaren Aufgabentitel eingeben.');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Error('Bitte ein gültiges Datum wählen.');
        await authorizedRequest(taskApi,{title,dueDate,priority:'normal',notes:'Von Jarvis-Fotoentwurf manuell bestätigt. Keine Zahlung ausgeführt.'});
        window.dispatchEvent(new Event('dgos-jarvis-tasks-updated'));
        say('Aufgabe gespeichert: '+title+' am '+dueDate+'. Es wurde nichts bezahlt.','Erledigt');
      }
      clear();
    }catch(e){caption(e?.message||'Konnte nicht speichern.',true);say('Speichern fehlgeschlagen. Bitte kontrolliere deinen Entwurf.','Fehler');}
    finally{setBusy(false);}
  });
  function handleVoiceCommand(raw){
    if(!pending)return false;
    const interpreted=window.DGOSLifeIntent?.parsePhotoReference(raw);
    if(!interpreted)return false;
    $('jarvisPhotoKind').value='task';
    refreshMode();
    $('jarvisPhotoDate').value=interpreted.dueDate;
    $('jarvisPhotoDateLabel').textContent='Geplant: '+interpreted.dateLabel+' ('+interpreted.dueDate+')';
    let title=$('jarvisPhotoTitle').value.trim();
    if(!title||title.length<3)title=interpreted.kind==='payment_reminder'?'Rechnung prüfen und bezahlen':
      interpreted.kind==='purchase_reminder'?'Artikel kaufen':'Foto-Aufgabe erledigen';
    if(interpreted.kind==='payment_reminder'&&!/\b(?:bezahlen|zahlen|überweisen)\b/i.test(title))title+=' bezahlen';
    if(interpreted.kind==='purchase_reminder'&&!/\b(?:kaufen|besorgen)\b/i.test(title))title+=' kaufen';
    $('jarvisPhotoTitle').value=title.slice(0,160);
    showPanel();
    say('Für '+interpreted.dateLabel+' vorbereitet. Prüfe den Titel und tippe auf «Aufgabe speichern». Keine Zahlung wird ausgeführt.','Entwurf bereit');
    return true;
  }
  window.DGOSJarvisPhoto={open:()=>{showPanel();say('Tippe auf «Foto aufnehmen» und fotografiere einen Artikel oder eine Rechnung.','Foto bereit');},handleVoiceCommand};
  window.addEventListener('pagehide',()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);});
})();