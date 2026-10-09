'use strict';
/* Optional browser-local voice output for the personal Jarvis panel. */
(() => {
  const panel=document.getElementById('personalJarvis');
  const reply=document.getElementById('personalJarvisReply');
  if(!panel||!reply)return;
  const synth=window.speechSynthesis;
  const controls=document.createElement('div');
  controls.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:15px 0;padding:12px;border:1px solid #345167;border-radius:12px';
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.id='jarvisSpeechEnabled';
  const label=document.createElement('label');label.htmlFor=enabled.id;label.textContent='Jarvis spricht';label.prepend(enabled);
  const voices=document.createElement('select');voices.setAttribute('aria-label','Stimme auswählen');
  const test=document.createElement('button');test.type='button';test.textContent='Stimme testen';
  const stop=document.createElement('button');stop.type='button';stop.textContent='Stopp';
  controls.append(label,voices,test,stop);
  reply.insertAdjacentElement('afterend',controls);
  const key='dgos.jarvis.speech.enabled',voiceKey='dgos.jarvis.speech.voice';
  function stopSpeech(){synth?.cancel();}
  function listVoices(){
    const saved=localStorage.getItem(voiceKey)||'';
    voices.replaceChildren(new Option('Systemstimme',''));
    const available=synth.getVoices().slice().sort((a,b)=>Number(b.lang.startsWith('de'))-Number(a.lang.startsWith('de')));
    available.forEach(v=>voices.add(new Option(v.name+' · '+v.lang,v.voiceURI)));
    voices.value=available.some(v=>v.voiceURI===saved)?saved:'';
  }
  function speak(text,preview=false){
    if(!synth||(!preview&&!enabled.checked)||!text)return;
    stopSpeech();
    const utterance=new SpeechSynthesisUtterance(String(text).slice(0,1200));
    utterance.lang='de-DE';utterance.rate=0.92;utterance.pitch=0.95;
    const voice=synth.getVoices().find(v=>v.voiceURI===voices.value);
    if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
    synth.speak(utterance);
  }
  if(!synth){enabled.disabled=voices.disabled=test.disabled=stop.disabled=true;label.append(' (nicht unterstützt)');return;}
  enabled.checked=localStorage.getItem(key)==='1';
  enabled.addEventListener('change',()=>{localStorage.setItem(key,enabled.checked?'1':'0');if(!enabled.checked)stopSpeech();});
  voices.addEventListener('change',()=>localStorage.setItem(voiceKey,voices.value));
  test.addEventListener('click',()=>speak('Guten Tag. Jarvis ist bereit.',true));
  stop.addEventListener('click',stopSpeech);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});
  listVoices();synth.addEventListener?.('voiceschanged',listVoices);
  let previous=reply.textContent;
  new MutationObserver(()=>{
    const current=reply.textContent;
    if(current!==previous){previous=current;speak(current);}
  }).observe(reply,{childList:true,characterData:true,subtree:true});
})();
