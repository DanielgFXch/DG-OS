/* DG OS – premium Jarvis micro-interactions.
 * Visual enhancement only. The original speech, microphone, calendar and
 * shopping handlers remain the sole source of truth for actual actions.
 */
(() => {
  'use strict';
  const panel=document.getElementById('personalJarvis');
  const hero=panel?.querySelector('.jarvis-cinematic-hero');
  const badge=hero?.querySelector('.jarvis-system-badge');
  const replyTime=document.getElementById('jarvisReplyTime');
  const waveform=hero?.querySelector('.jpr-waveform');
  if(!hero||!badge||!replyTime||!waveform)return;
  let resetTimer;
  const timeNow=()=>new Intl.DateTimeFormat('de-CH',{
    timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).format(new Date());
  badge.addEventListener('click',()=>{
    // Tapping the actual pairing state opens the existing, initialized
    // device/voice settings; no simulated "connected" state is created.
    const details=document.getElementById('jarvisDashAdvanced');
    if(!details)return;
    details.open=true;
    details.scrollIntoView({behavior:'smooth',block:'start'});
    details.querySelector('summary')?.focus({preventScroll:true});
  });
  window.addEventListener('dgos-jarvis-final-response',event=>{
    if(!String(event.detail?.text||'').trim())return;
    replyTime.textContent=timeNow();
    waveform.classList.add('is-responding');
    clearTimeout(resetTimer);
    resetTimer=setTimeout(()=>waveform.classList.remove('is-responding'),1800);
  });
  // Do not claim audio playback merely because the words were recognised.
  window.addEventListener('dgos-jarvis-microphone-state',event=>{
    const state=event.detail?.state;
    if(state==='starting'||state==='listening'||state==='processing'){
      waveform.classList.remove('is-responding');
      clearTimeout(resetTimer);
    }
  });
})();
