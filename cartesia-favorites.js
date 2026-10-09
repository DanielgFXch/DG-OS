'use strict';
// Jarvis Cartesia favourites. Key remains in Supabase; only Supabase Auth token in memory.
(() => {
 const mount=document.querySelector('#voiceSelect')?.closest('.card');
 if(!mount)return;
 const base='https://jzvnmhfhyvmmbontsoej.supabase.co';
 const anon='sb_publishable_vGHoMKyp3uNRoF6fsG0a8w_pgzVxefh';
 const edge=base+'/functions/v1/jarvis-cartesia';
 let token='',activeVoice='',voices=[],audio=null,audioUrl='';
 const card=document.createElement('section');card.className='card';card.style.marginTop='18px';
 card.innerHTML='<h2>Meine Jarvis-Stimmen</h2><p>Wähle Clive, Archie, Skylar oder Lindiwe und teste die Stimme direkt.</p>'+
 '<div id="voiceSignIn"><label for="voiceEmail">DG-OS E-Mail</label><input id="voiceEmail" type="email" autocomplete="username" style="width:100%;padding:12px;border-radius:10px;background:#081622;color:inherit;border:1px solid #345064">'+
 '<label for="voicePassword">Passwort</label><input id="voicePassword" type="password" autocomplete="current-password" style="width:100%;padding:12px;border-radius:10px;background:#081622;color:inherit;border:1px solid #345064">'+
 '<div class="buttons"><button type="button" class="action primary" id="voiceLogin">Verbinden</button></div></div>'+
 '<div id="voiceReady" hidden><div id="voiceChoices" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0"></div>'+
 '<div class="buttons"><button type="button" id="voicePlay" class="action primary">▶ Stimme testen</button><button type="button" id="voiceStop" class="action">■ Stopp</button><button type="button" id="voiceLogout" class="action">Abmelden</button></div></div>'+
 '<p id="voiceMessage" class="caption" aria-live="polite">Bitte einmalig anmelden. Der Zugang wird nicht gespeichert.</p>';
 mount.insertAdjacentElement('afterend',card);
 const $=x=>document.getElementById(x);
 const note=s=>$('voiceMessage').textContent=s;
 const clear=()=>{if(audio){audio.pause();audio.src='';audio=null;}if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl='';}};
 const logout=()=>{token='';voices=[];activeVoice='';clear();$('voiceReady').hidden=true;$('voiceSignIn').hidden=false;$('voicePassword').value='';note('Abgemeldet.');};
 async function request(method,body){
   const r=await fetch(edge,{method,headers:{authorization:'Bearer '+token,apikey:anon,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
   if(!r.ok){const result=await r.json().catch(()=>({}));if(r.status===401||r.status===403)logout();throw Error(result.error||('Server antwortet '+r.status));}
   return r;
 }
 function draw(){
  const root=$('voiceChoices');root.replaceChildren();
  for(const voice of voices){
   const button=document.createElement('button');button.type='button';button.className='action';button.style.cssText='padding:15px;text-align:left;min-height:70px';
   button.textContent=(activeVoice===voice.id?'✓ ':'')+voice.name;
   button.setAttribute('aria-pressed',String(activeVoice===voice.id));
   button.style.borderColor=activeVoice===voice.id?'#55ded8':'#416d7a';
   button.addEventListener('click',()=>{activeVoice=voice.id;localStorage.setItem('dgos.cartesia.voiceId',voice.id);draw();note(voice.name+' ausgewählt.');});
   root.append(button);
  }
 }
 $('voiceLogin').addEventListener('click',async()=>{
  const email=$('voiceEmail').value.trim(),password=$('voicePassword').value;
  if(!email||!password)return note('E-Mail und Passwort eingeben.');
  const button=$('voiceLogin');button.disabled=true;note('Anmeldung wird geprüft ...');
  try{
   const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'content-type':'application/json'},body:JSON.stringify({email,password}),cache:'no-store'});
   const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(data.error_description||data.msg||data.error||'Login fehlgeschlagen.');
   if(!data.access_token)throw Error('Kein Auth-Token empfangen.');
   if(!data.user?.email_confirmed_at)throw Error('Bitte deine E-Mail in Supabase Auth bestätigen.');
   token=data.access_token;$('voicePassword').value='';
   const vr=await request('GET');const result=await vr.json();
   voices=Array.isArray(result.voices)?result.voices:[];
   const favourites=['Clive','Archie','Skylar','Lindiwe'];
   voices.sort((a,b)=>favourites.findIndex(n=>a.name.startsWith(n))-favourites.findIndex(n=>b.name.startsWith(n)));
   if(!voices.length)throw Error('Keine der vier Stimmen über Cartesia gefunden. Bitte API-Key oder Voice-Liste prüfen.');
   const saved=localStorage.getItem('dgos.cartesia.voiceId');
   activeVoice=voices.find(v=>v.id===saved)?.id||voices.find(v=>v.name.startsWith('Clive'))?.id||voices[0].id;
   draw();$('voiceSignIn').hidden=true;$('voiceReady').hidden=false;note('Verbunden! Stimme auswählen und testen.');
  }catch(e){token='';note(e.message||'Verbindung fehlgeschlagen.');}
  finally{button.disabled=false;}
 });
 $('voicePlay').addEventListener('click',async()=>{
  const text=$('sample').value.trim();if(!activeVoice)return note('Bitte zuerst eine Stimme wählen.');
  if(!text||text.length>300)return note('Bitte einen Testtext mit maximal 300 Zeichen verwenden.');
  const button=$('voicePlay');button.disabled=true;clear();note('Premium-Stimme wird erstellt ...');
  try{const response=await request('POST',{text,voice_id:activeVoice,language:$('language').value.slice(0,2)});
   const blob=await response.blob();if(!blob.type.includes('audio'))throw Error('Keine Audiodaten erhalten.');
   audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);audio.addEventListener('ended',clear,{once:true});
   await audio.play();note('Jarvis spricht.');
  }catch(e){note('Test nicht möglich: '+e.message);}finally{button.disabled=false;}
 });
 $('voiceStop').addEventListener('click',clear);
 $('stop').addEventListener('click',clear);
 $('voiceLogout').addEventListener('click',logout);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
})();
