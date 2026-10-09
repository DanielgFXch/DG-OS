'use strict';
// DG-OS Cartesia: authenticated preview. The Cartesia API key NEVER enters browser code.
(() => {
  const studio = document.querySelector('#voiceSelect');
  if (!studio) return;
  const projectUrl = 'https://jzvnmhfhyvmmbontsoej.supabase.co';
  // Supabase publishable keys are public identifiers. Never put Cartesia keys here.
  const publishableKey = 'sb_publishable_vGHoMKyp3uNRoF6fsG0a8w_pgzVxefh';
  const endpoint = projectUrl + '/functions/v1/jarvis-cartesia';
  let accessToken = '';
  let objectUrl = '';
  let audio = null;
  const ui = document.createElement('section');
  ui.className='card';
  ui.style.marginTop='18px';
  ui.innerHTML = `<h2>Cartesia · Sicher verbinden</h2>
    <p>Premium-Audio benötigt eine bestätigte DG-OS-Supabase-Anmeldung. Die Zugangsdaten werden nicht gespeichert.</p>
    <div id="cartesiaConnectInputs">
      <label for="cartesiaLoginEmail">DG-OS E-Mail</label>
      <input id="cartesiaLoginEmail" type="email" autocomplete="username" placeholder="Dein DG-OS Supabase Auth Benutzer" style="width:100%;padding:12px;background:#081622;color:inherit;border:1px solid #345064;border-radius:10px">
      <label for="cartesiaLoginPassword">Passwort</label>
      <input id="cartesiaLoginPassword" type="password" autocomplete="current-password" style="width:100%;padding:12px;background:#081622;color:inherit;border:1px solid #345064;border-radius:10px">
      <button id="cartesiaSignIn" class="action" type="button" style="margin-top:12px">Mit DG-OS anmelden</button>
    </div>
    <div id="cartesiaAuthenticated" hidden>
      <p id="cartesiaAccount"></p>
      <label for="cartesiaVoiceId">Cartesia Voice-ID</label>
      <input id="cartesiaVoiceId" type="text" placeholder="UUID deiner Stimme aus Cartesia" spellcheck="false" autocomplete="off" maxlength="36" style="width:100%;padding:12px;background:#081622;color:inherit;border:1px solid #345064;border-radius:10px">
      <p class="caption">Die ID findest du in Cartesia bei der jeweiligen Stimme. Speichere nur die ID, niemals den API-Key.</p>
      <div class="buttons">
        <button id="cartesiaPreview" class="action primary" type="button">▶ Cartesia testen</button>
        <button id="cartesiaLogout" class="action" type="button">Abmelden</button>
      </div>
    </div>
    <p id="cartesiaConnectionStatus" class="caption" role="status" aria-live="polite">Nicht angemeldet.</p>`;
  studio.closest('.card')?.insertAdjacentElement('afterend',ui);
  const $ = id => document.getElementById(id);
  function status(text){$('cartesiaConnectionStatus').textContent=text;}
  function clearAudio(){
    if(audio){audio.pause();audio.src='';audio=null;}
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
  }
  function signedOut(){
    accessToken='';clearAudio();
    $('cartesiaAuthenticated').hidden=true;$('cartesiaConnectInputs').hidden=false;
    $('cartesiaLoginPassword').value='';
    status('Abgemeldet.');
  }
  $('cartesiaSignIn').addEventListener('click',async()=>{
    const email=$('cartesiaLoginEmail').value.trim(),password=$('cartesiaLoginPassword').value;
    if(!email||!password)return status('E-Mail und Passwort eingeben.');
    $('cartesiaSignIn').disabled=true;status('Anmeldung wird geprüft ...');
    try {
      const result=await fetch(projectUrl+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},
        body:JSON.stringify({email,password}),cache:'no-store'
      });
      const data=await result.json();
      if(!result.ok||!data.access_token||!data.user?.email_confirmed_at)throw Error('Login fehlgeschlagen oder E-Mail nicht bestätigt.');
      accessToken=data.access_token;
      $('cartesiaAccount').textContent='Angemeldet: '+data.user.email;
      $('cartesiaLoginPassword').value='';
      $('cartesiaConnectInputs').hidden=true;$('cartesiaAuthenticated').hidden=false;
      status('Bereit für einen geschützten Audiotest.');
    }catch(err){status(err.message);}
    finally{$('cartesiaSignIn').disabled=false;}
  });
  $('cartesiaPreview').addEventListener('click',async()=>{
    const voice=$('cartesiaVoiceId').value.trim();
    const text=$('sample').value.trim();
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(voice))return status('Bitte eine gültige Voice-ID aus Cartesia einfügen.');
    if(!text||text.length>300)return status('Für den Test maximal 300 Zeichen verwenden.');
    if(!accessToken)return status('Zuerst anmelden.');
    $('cartesiaPreview').disabled=true;clearAudio();status('Cartesia erstellt die Sprachausgabe ...');
    try {
      const response=await fetch(endpoint,{
        method:'POST',headers:{Authorization:'Bearer '+accessToken,apikey:publishableKey,'Content-Type':'application/json'},
        body:JSON.stringify({text,voice_id:voice,language:($('language').value||'en').slice(0,2)}),cache:'no-store'
      });
      if(!response.ok){
        const data=await response.json().catch(()=>({}));
        if(response.status===401||response.status===403)signedOut();
        throw Error(data.error||('Cartesia HTTP '+response.status));
      }
      const blob=await response.blob();
      if(!blob.type.includes('audio'))throw Error('Ungültige Audioantwort.');
      objectUrl=URL.createObjectURL(blob);audio=new Audio(objectUrl);
      audio.addEventListener('ended',clearAudio,{once:true});
      await audio.play();status('Cartesia Premium-Stimme wird abgespielt.');
    }catch(err){status('Audiotest nicht möglich: '+err.message);}
    finally{$('cartesiaPreview').disabled=false;}
  });
  $('cartesiaLogout').addEventListener('click',signedOut);
  $('stop').addEventListener('click',clearAudio);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearAudio();});
})();
