'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const audioSrc=read('jarvis-voice-audio.js');
const voice=read('jarvis-voice.js'),native=read('jarvis-native-voice.js');
const personal=read('personal.js'),html=read('index.html'),sw=read('sw.js');
const css=read('jarvis-voice-audibility.css');
for(const s of [audioSrc,voice,native,personal])assert.doesNotThrow(()=>new Function(s));
for(const name of ['jarvis-voice-audio.js?v=1','jarvis-voice-audibility.css?v=1']){
 assert.ok(html.includes(name)&&sw.includes(name));
}
assert.ok(html.indexOf('jarvis-voice-audio.js?v=1')<html.indexOf('jarvis-native-voice.js?v=3'));
assert.ok(personal.includes('DGOSVoiceAudio?.unlockFromGesture?.()'));
assert.ok(personal.includes('DGOSLocalVoice?.unlockFromGesture?.()'));
assert.ok(voice.includes('DGOSVoiceAudio?.playBlob?.(blob,'));
assert.ok(voice.includes("dgos-jarvis-final-response"));
assert.ok(voice.includes('currentAudio.hidden=false'));
assert.ok(native.includes('Re-prime on EACH real orb tap'));
assert.ok(css.includes('jvHeroRead')&&css.includes('[data-state="STARTEN"]'));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
assert.ok(!audioSrc.includes('fetch(')&&!audioSrc.includes('localStorage'));
let started=0,primed=0,stopped=0,decoded=0,resumed=0,closed=0,lastSource=null;
class FakeContext{
 constructor(){this.state='suspended';this.currentTime=10;this.destination={};}
 resume(){this.state='running';resumed++;return Promise.resolve()}
 createOscillator(){return {connect(){},disconnect(){},start(){primed++},stop(){}}}
 createGain(){return {gain:{value:1},connect(){},disconnect(){}}}
 createBufferSource(){
  const b={buffer:null,onended:null,connect(){},disconnect(){},
    start(){lastSource=b;started++},stop(){stopped++}};
  return b;
 }
 decodeAudioData(a){assert.ok(a.byteLength>0);decoded++;return Promise.resolve({duration:1})}
 close(){closed++;this.state='closed';return Promise.resolve()}
}
const w={AudioContext:FakeContext},m={exports:{}};
vm.runInNewContext(audioSrc,{window:w,module:m,globalThis:w,console},{timeout:1000});
const engine=m.exports,blob={arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
(async()=>{
 assert.equal(await engine.playBlob(blob),false,'Audio cannot autoplay without tap');
 assert.equal(engine.unlockFromGesture(),true);
 assert.equal(primed,1,'Real tap primes inaudible oscillator');
 assert.equal(resumed,1);
 let ended=0;
 assert.equal(await engine.playBlob(blob,()=>ended++),true,'Delayed MP3 playback works on unlocked context');
 assert.equal(started,1);assert.equal(decoded,1);
 lastSource.onended();assert.equal(ended,1);
 assert.equal(await engine.playBlob(blob),true);
 engine.stopPlayback();assert.equal(stopped,1);
 engine.destroy();assert.equal(closed,1);
 const n={exports:{}};
 vm.runInNewContext(audioSrc,{window:{},module:n,globalThis:{}},{timeout:1000});
 assert.equal(n.exports.unlockFromGesture(),false);
 assert.equal(await n.exports.playBlob(blob),false);
 console.log('DG OS Jarvis iPhone TTS: tapped unlock, delayed premium response, stop and fallback PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
