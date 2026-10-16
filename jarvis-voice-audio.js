'use strict';
/* DG OS | iOS reply audio gate.
 * Calling unlockFromGesture on the actual Jarvis-orb tap keeps a Web Audio
 * context eligible to play a later, authenticated provider audio response.
 * Safari may suspend the context during microphone access; fail visibly and
 * leave the existing user-activated <audio controls> as an audible fallback.
 * Audio data and credentials are NEVER persisted. No extra API calls here.
 */
(function(root,factory){
  const player=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=player;
  else root.DGOSVoiceAudio=player;
})(typeof window!=='undefined'?window:globalThis,function(root){
  let context=null,source=null,sequence=0,lastFailure='';
  const Context=()=>root.AudioContext||root.webkitAudioContext||null;
  function clearSource(){
    if(!source)return;
    try{source.onended=null;source.stop();source.disconnect();}catch{}
    source=null;
  }
  function stopPlayback(){
    sequence++;
    clearSource();
  }
  function unlockFromGesture(){
    const Klass=Context();
    if(!Klass){lastFailure='web_audio_unavailable';return false;}
    try{
      if(!context||context.state==='closed')context=new Klass();
      const pending=context.state==='suspended'?context.resume():null;
      if(pending&&typeof pending.catch==='function')pending.catch(()=>{lastFailure='gesture_required'});
      // Starting an inaudible oscillator on the *user tap* primes iOS Web
      // Audio media playback without feeding sound back into the microphone.
      if(context.state!=='closed'){
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        gain.gain.value=0;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended=()=>{try{oscillator.disconnect();gain.disconnect();}catch{}};
        oscillator.start();
        oscillator.stop(context.currentTime+.012);
      }
      return true;
    }catch{
      lastFailure='gesture_required';
      return false;
    }
  }
  async function playBlob(blob,onEnded){
    if(!context || !blob || typeof blob.arrayBuffer!=='function'){
      lastFailure='not_unlocked';return false;
    }
    stopPlayback();
    const id=sequence;
    try{
      if(context.state!=='running'){
        // Never create a new context outside a gesture. An already-unlocked
        // context may resume; Safari can still reject without a fresh tap.
        await context.resume();
      }
      if(id!==sequence||context.state!=='running'){
        lastFailure='gesture_required';return false;
      }
      const buffer=await blob.arrayBuffer();
      if(id!==sequence)return false;
      const audio=await context.decodeAudioData(buffer.slice(0));
      if(id!==sequence)return false;
      const next=context.createBufferSource();
      next.buffer=audio;
      next.connect(context.destination);
      next.onended=()=>{
        if(id!==sequence||source!==next)return;
        source=null;
        try{next.disconnect();}catch{}
        onEnded?.();
      };
      source=next;
      next.start(0);
      lastFailure='';
      return true;
    }catch{
      if(id===sequence)clearSource();
      lastFailure='audio_decode_or_playback_failed';
      return false;
    }
  }
  function info(){return {ready:context?.state==='running',reason:lastFailure};}
  function destroy(){
    stopPlayback();
    if(context)try{const pending=context.close();pending?.catch?.(()=>{});}catch{}
    context=null;
  }
  return Object.freeze({unlockFromGesture,stopPlayback,playBlob,info,destroy});
});
