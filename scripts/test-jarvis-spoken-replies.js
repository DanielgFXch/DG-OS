#!/usr/bin/env node
'use strict';
// Simulated actual client event flow: iPhone microphone → final response → speech.
// No browser credentials, OpenAI calls, microphone data, voice credits or packages.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('jarvis-voice.js'),client=read('personal.js');
assert.doesNotThrow(()=>new Function(source));
assert.ok(client.includes("window.dispatchEvent(new CustomEvent('dgos-jarvis-final-response'"),'Finished answers must dispatch their speech event');
assert.ok(client.includes("showReply('Welche Produkte soll ich hinzufügen?"),'Clarification is spoken, not a silent status');
assert.ok(client.includes("showReply('Das kann ich noch nicht ausführen."),'Unknown commands return audible feedback');
assert.ok(source.includes("read(enabledKey)!=='0'"),'Speech defaults on unless the owner explicitly muted it');
assert.ok(source.includes("if(!voiceId){speakLocal(text,true);return;}"),'Missing premium provider falls back to local speech');
assert.ok(!source.includes('OPENAI_API_KEY'),'Provider keys are never exposed in the browser');

function setup(initial={},remote=async()=>{throw Error('Unexpected provider request')}){
 const listeners=new Map(),storage=new Map(Object.entries(initial)),calls={play:[],stop:0,network:[]},nodes={};
 class FakeNode{
   constructor(){this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.textContent='';this.dataset={};this.attrs={};this.listeners={};this.options=[];this.classList={add(){},remove(){}};}
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
   dispatchEvent(evt){for(const fn of this.listeners[evt.type]||[])fn(evt);return true;}
   setAttribute(k,v){this.attrs[k]=String(v);}
   replaceChildren(){this.options=[];}
   add(option){this.options.push(option);}
   insertAdjacentElement(){}
   append(child){this.children??=[];this.children.push(child);}
   pause(){this.paused=true;}
   play(){this.played=true;return Promise.resolve();}
   load(){}
   removeAttribute(k){delete this.attrs[k];}
   querySelector(){return new FakeNode();}
 }
 for(const name of ['jvEngine','jvVoice','jvLang','jvEnabled','jvReload','jvPreview',
   'jvSoundCheck','jvRead','jvStop','jvNotice','jvVoiceBadge','jvAudioPlayer','jvQuickToggle','jvHeroToggle','jvHeroRead','jvHeroNotice','jvHeroTone','jvHeroFile','jvUseServerVoice'])
   nodes[name]=new FakeNode();
 const panel=new FakeNode(),reply=new FakeNode();
 reply.textContent='Sag mir, was du brauchst.';
 const document={
   createElement:()=>new FakeNode(),
   getElementById:id=>id==='personalJarvis'?panel:id==='personalJarvisReply'?reply:nodes[id]||null,
   addEventListener(type,fn){(listeners.get('document:'+type)??(listeners.set('document:'+type,[]),listeners.get('document:'+type))).push(fn);}
 };
 const window={
   speechSynthesis:{getVoices:()=>[],addEventListener(){}},
   DGOSSoundCheck:{async playTestTone(){return {ok:true,reason:'Testton gestartet'};}},
   DGOSLocalVoice:{
     isSupported:()=>true,stop(){calls.stop++;},
     play({text,onState}){calls.play.push(text);onState({state:'speaking',message:'Jarvis spricht.'});return true;}
   },
   addEventListener(type,fn){(listeners.get(type)??(listeners.set(type,[]),listeners.get(type))).push(fn);},
   dispatchEvent(evt){for(const fn of listeners.get(evt.type)||[])fn(evt);}
 };
 const localStorage={
   getItem:k=>storage.get(k)||null,
   setItem(k,v){storage.set(k,String(v));}
 };
 class Event{constructor(type){this.type=type;}}
 class Option{constructor(text,value){this.name=text;this.text=text;this.id=value;this.value=value;}}
 vm.runInNewContext(source,{window,document,localStorage,Event,Option,fetch:(url,options)=>{
    calls.network.push({url,method:options.method,authorized:/^Bearer /i.test(options.headers?.Authorization||'')});
    return remote(url,options);
   },
   URL:{createObjectURL(){return 'blob:simulated-audio';},revokeObjectURL(){}},
   AbortController,console},{filename:'jarvis-voice.js'});
 return {
   nodes,window,calls,storage,
   emit(type,detail){window.dispatchEvent({type,detail});},
   click(name){nodes[name].dispatchEvent({type:'click'});}
 };
}
{
 const app=setup();
 assert.equal(app.nodes.jvEnabled.checked,true,'New Jarvis installation automatically speaks back');
 assert.equal(app.nodes.jvQuickToggle.textContent,'🔊 Stimme an');
 assert.equal(app.nodes.jvHeroToggle.textContent,'🔊 Stimme an','Visible hero toggle is synced');
 app.emit('dgos-jarvis-microphone-state',{state:'listening'});
 assert.equal(app.calls.play.length,0,'Never voice-record the listening message');
 app.emit('dgos-jarvis-microphone-state',{state:'processing'});
 assert.equal(app.calls.play.length,0,'Never read intermediate transcription');
 app.emit('dgos-jarvis-microphone-state',{state:'result'});
 app.emit('dgos-jarvis-final-response',{text:'Okay Gomes, Milch ist gespeichert.'});
 assert.deepEqual(app.calls.play,['Okay Gomes, Milch ist gespeichert.']);
 app.emit('dgos-jarvis-final-response',{text:'Ich habe deinen Kalender geöffnet.'});
 assert.equal(app.calls.play.length,2,'Two finished voice commands produce two replies');
 app.click('jvHeroToggle');
 assert.equal(app.nodes.jvEnabled.checked,false);
 assert.equal(app.nodes.jvHeroToggle.textContent,'🔇 Stimme aus');
 assert.equal(app.storage.get('dgos.jarvis.speech.enabled'),'0');
 app.emit('dgos-jarvis-final-response',{text:'Ich bin jetzt stumm.'});
 assert.equal(app.calls.play.length,2,'Explicit mute must be respected');
 app.click('jvQuickToggle');
 assert.equal(app.nodes.jvEnabled.checked,true);
 assert.equal(app.calls.play.at(-1),'Ich bin jetzt stumm.','Re-enable plays last completed answer once');
 app.click('jvHeroRead');
 assert.equal(app.calls.play.at(-1),'Ich bin jetzt stumm.','Visible hero replay runs in a user click');
 assert.match(app.nodes.jvHeroNotice.textContent,/iPhone meldet Sprachstart/,'iOS onstart is not proof of audible sound');
}
{
 const app=setup({'dgos.jarvis.speech.enabled':'0'});
 assert.equal(app.nodes.jvEnabled.checked,false,'Explicit opt-out survives reload');
 app.emit('dgos-jarvis-final-response',{text:'Text statt Audio'});
 assert.equal(app.calls.play.length,0);
}
{
 const app=setup({'dgos.voiceStudio.preferences.v1':JSON.stringify({provider:'openai-tts'})});
 assert.equal(app.nodes.jvEngine.value,'openai-tts');
 assert.equal(app.nodes.jvEnabled.checked,true);
 app.emit('dgos-jarvis-final-response',{text:'Hallo vom iPhone.'});
 assert.deepEqual(app.calls.play,['Hallo vom iPhone.'],'Unpaired premium provider cannot silence a local answer');
 assert.match(app.nodes.jvNotice.textContent,/iPhone-Stimme/);
}
{
 const app=setup();
 app.click('jvHeroTone');
 assert.match(app.nodes.jvHeroNotice.textContent,/Testton wird abgespielt/);
 app.click('jvHeroFile');
 assert.match(app.nodes.jvHeroNotice.textContent,/iPhone mit DG OS gekoppelt/,'No paid audio generated when device is unpaired');
}
(async()=>{
  const app=setup({'dgos.deviceSession':'S'.repeat(48)},async(url,options)=>{
    if(options.method==='GET')return {ok:true,status:200,json:async()=>({voices:[{id:'onyx',name:'Onyx'}]})};
    if(options.method==='POST')return {ok:true,status:200,blob:async()=>({size:1500,type:'audio/mpeg'})};
    throw Error('Unexpected HTTP method');
  });
  assert.equal(app.calls.network.length,0,'No paid TTS provider call on loading the Jarvis screen');
  app.click('jvHeroFile');
  await new Promise(setImmediate);
  assert.equal(app.calls.network.filter(x=>x.method==='POST').length,1,'Only the explicit tap requests a short paid sample');
  assert.ok(app.calls.network.every(x=>x.authorized),'All provider requests require the paired device token');
  assert.match(app.calls.network[0].url,/jarvis-openai-voice$/,'Audio sample uses an existing protected TTS endpoint');
  assert.equal(app.nodes.jvAudioPlayer.hidden,false,'Native iPhone audio player is visible');
  assert.equal(app.nodes.jvAudioPlayer.src,'blob:simulated-audio','The audio blob is attached to the media player');
  assert.equal(app.nodes.jvAudioPlayer.played,true,'Audio starts if Safari permits it');
  assert.equal(app.nodes.jvUseServerVoice.hidden,false,'Opt-in only offered after test generation succeeds');
  assert.equal(app.storage.get('dgos.voiceStudio.preferences.v1'),undefined,'Sample does not silently opt into paid automatic speech');
  app.click('jvUseServerVoice');
  assert.equal(JSON.parse(app.storage.get('dgos.voiceStudio.preferences.v1')).provider,'openai-tts','Only explicit opt-in enables server speech for new replies');
  assert.equal(app.storage.get('dgos.openai.voiceId'),'onyx');
  console.log('DG OS Jarvis spoken replies: finished turns, mute, tone test, user-triggered MP3 and explicit opt-in OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
