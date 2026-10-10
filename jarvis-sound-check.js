'use strict';
/* Diagnostic audio tone, never auto-plays. It checks device sound output separately
   from iOS speechSynthesis. No API, microphone, downloads or user data. */
(function(root){
  async function playTestTone(){
    const AudioContextClass=root.AudioContext||root.webkitAudioContext;
    if(!AudioContextClass)return {ok:false,reason:'Web Audio ist in diesem Browser nicht verfügbar.'};
    let ctx=null;
    try{
      ctx=new AudioContextClass();
      if(ctx.state==='suspended')await ctx.resume();
      if(ctx.state!=='running')throw Error('audio_context_not_running');
      const oscillator=ctx.createOscillator();
      const gain=ctx.createGain();
      oscillator.type='sine';
      oscillator.frequency.setValueAtTime(620,ctx.currentTime);
      gain.gain.setValueAtTime(0.0001,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.11,ctx.currentTime+0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.4);
      oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime+0.42);
      await new Promise(resolve=>{
        oscillator.onended=resolve;
        setTimeout(resolve,900);
      });
      return {ok:true,reason:'Testton abgespielt. Hast du ihn gehört? Wenn ja, aber keine Stimme, liegt es wahrscheinlich an der iPhone-Sprachsynthese.'};
    }catch(error){
      return {ok:false,reason:'Audiotest konnte nicht gestartet werden. Bitte in Safari und mit höherer Medienlautstärke versuchen.'};
    }finally{try{await ctx?.close();}catch{}}
  }
  root.DGOSSoundCheck=Object.freeze({playTestTone});
})(window);
