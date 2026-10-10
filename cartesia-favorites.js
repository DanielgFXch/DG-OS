'use strict';
// Cartesia voice catalogue and secure test. Uses existing DG OS Telegram-paired device session.
(() => {
  const mount=document.querySelector('#voiceSelect')?.closest('.card');
  if(!mount)return;
  const edge='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-cartesia';
  const voiceKey='dgos.cartesia.voiceId', prefsKey='dgos.voiceStudio.preferences.v1';
  const session=()=>{try{return localStorage.getItem('dgos.deviceSession')||localStorage.getItem('dgos.whoopSession')||'';}catch{return '';}};
  const card=document.createElement('section');
  card.className='card';card.style.marginTop='18px';
  card.innerHTML=`
    <div class="row"><h2>Meine Cartesia-Stimmen</h2><span class="status" id="cartesiaStatus">NICHT VERBUNDEN</span></div>
    <p>Clive, Archie, Skylar und Lindiwe. Einmal in DG OS mit Telegram koppeln, danach Stimmen testen und auswählen. Kein zweites Konto nötig.</p>
    <div class="buttons"><button id="cartesiaLoad" type="button" class="action primary">Stimmen laden</button></div>
    <div id="cartesiaReady" hidden>
      <div id="cartesiaChoices" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0"></div>
      <div class="buttons"><button type="button" id="cartesiaPlay" class="action primary">▶ Stimme testen</button><button type="button" id="cartesiaStop" class="action">■ Stopp</button></div>
    </div>
    <p id="cartesiaNotice" class="caption" role="status" aria-live="polite"></p>
  `;
  mount.insertAdjacentElement('afterend',card);
  const $=id=>document.getElementById(id);
  const notify=(msg,status)=>{$('cartesiaNotice').textContent=msg;if(status)$('cartesiaStatus').textContent=status;};
  let voices=[],activeId='',audio=null,objectUrl='',prepared='',abort=null;
  try{activeId=localStorage.getItem(voiceKey)||'';}catch{}
  function clear(){
    if(abort){abort.abort();abort=null;}
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
    prepared='';
  }
  async function api(method,body,signal){
    const token=session();
    if(!token)throw Error('Bitte in DG OS → Aufgaben zuerst Telegram verbinden.');
    const response=await fetch(edge,{
      method,signal,cache:'no-store',
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok){
      const result=await response.json().catch(()=>({}));
      if(response.status===401)throw Error('Gerätesitzung nicht verbunden oder abgelaufen. Bitte Telegram in DG OS erneut koppeln.');
      if(result.error==='voice_not_configured')throw Error('Cartesia API-Key fehlt auf dem Supabase-Server.');
      if(result.error==='slow_down')throw Error('Bitte kurz warten und erneut versuchen.');
      throw Error('Cartesia antwortet mit Fehler '+(result.upstream_status||response.status)+'.');
    }
    return response;
  }
  function draw(){
    $('cartesiaChoices').replaceChildren();
    voices.forEach(v=>{
      const button=document.createElement('button');
      button.type='button';button.className='action';
      button.style.cssText='padding:15px;text-align:left;min-height:68px;border-color:'+(activeId===v.id?'#55ded8':'#416d7a');
      button.textContent=(activeId===v.id?'✓ ':'')+v.name;
      button.setAttribute('aria-pressed',String(activeId===v.id));
      button.addEventListener('click',()=>{
        clear();activeId=v.id;
        localStorage.setItem(voiceKey,v.id);
        try{
          const p=JSON.parse(localStorage.getItem(prefsKey)||'{}')||{};
          p.provider='cartesia';localStorage.setItem(prefsKey,JSON.stringify(p));
        }catch{}
        document.querySelector('[data-provider="cartesia"]')?.click();
        draw();notify(v.name+' ausgewählt. Diese Stimme wird auch in Jarvis verwendet.','BEREIT');
      });
      $('cartesiaChoices').append(button);
    });
  }
  async function load(){
    if(!session())return notify('Noch kein DG-OS-Gerät verbunden. Öffne DG OS → Aufgaben → Telegram verbinden und kehre anschliessend zurück.','KOPPLUNG');
    $('cartesiaLoad').disabled=true;
    notify('Premium-Stimmen werden sicher geladen …','LÄDT');
    try{
      const res=await api('GET'),data=await res.json();
      voices=Array.isArray(data.voices)?data.voices.filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string'):[];
      if(!voices.length)throw Error('Keine Stimmen gefunden. Bitte die Cartesia-Verbindung prüfen.');
      const names=['Clive','Archie','Skylar','Lindiwe'];
      voices.sort((a,b)=>names.findIndex(n=>a.name.startsWith(n))-names.findIndex(n=>b.name.startsWith(n)));
      if(!voices.some(v=>v.id===activeId))activeId=voices[0].id;
      localStorage.setItem(voiceKey,activeId);
      $('cartesiaReady').hidden=false;draw();
      notify('Verbunden. Stimme auswählen und ausprobieren.','CARTESIA ONLINE');
    }catch(e){notify(e.message||'Premium-Stimmen konnten nicht geladen werden.','FEHLER');}
    finally{$('cartesiaLoad').disabled=false;}
  }
  $('cartesiaLoad').addEventListener('click',load);
  $('cartesiaPlay').addEventListener('click',async()=>{
    const text=$('sample').value.trim();
    if(!text||text.length>300)return notify('Bitte einen Testtext mit 1 bis 300 Zeichen wählen.');
    if(!activeId)return notify('Bitte zuerst eine Stimme auswählen.');
    const key=activeId+'|'+$('language').value+'|'+$('pace').value+'|'+text;
    if(audio&&prepared===key){
      try{audio.currentTime=0;await audio.play();notify('Jarvis spricht.','SPRICHT');}
      catch{notify('Audio ist bereit. Tippe nochmals auf «Stimme testen».','STARTEN');}
      return;
    }
    clear();
    $('cartesiaPlay').disabled=true;
    notify('Premium-Audio wird erzeugt …','GENERIEREN');
    abort=new AbortController();
    try{
      const res=await api('POST',{voice_id:activeId,text,language:$('language').value.slice(0,2),pace:Number($('pace').value)},abort.signal);
      const blob=await res.blob();
      if(!blob.type.includes('audio')||!blob.size)throw Error('Keine gültigen Audiodaten empfangen.');
      objectUrl=URL.createObjectURL(blob);audio=new Audio(objectUrl);prepared=key;
      try{await audio.play();notify('Jarvis spricht.','SPRICHT');}
      catch{notify('Audio ist bereit. Tippe nochmals auf «Stimme testen» für die iPhone-Audiofreigabe.','STARTEN');}
    }catch(e){
      if(e.name!=='AbortError')notify('Test fehlgeschlagen: '+(e.message||'Unbekannter Fehler'),'FEHLER');
    }finally{abort=null;$('cartesiaPlay').disabled=false;}
  });
  $('cartesiaStop').addEventListener('click',()=>{clear();notify('Wiedergabe gestoppt.','BEREIT');});
  $('stop')?.addEventListener('click',clear);
  window.addEventListener('dgos-device-session',load);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  notify(session()?'Telegram-Gerät erkannt. Tippe auf «Stimmen laden».':'Erst DG OS → Aufgaben → Telegram verbinden, dann Stimmen laden.',session()?'BEREIT':'KOPPLUNG');
  if(session())load();
})();
