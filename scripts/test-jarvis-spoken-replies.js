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

function setup(initial={}){
 const listeners=new Map(),storage=new Map(Object.entries(initial)),calls={play:[],stop:0},nodes={};
 class FakeNode{
   constructor(){this.value='';this.disabled=false;this.hidden=false;this.checked=false;this.textContent='';this.dataset={};this.attrs={};this.listeners={};this.options=[];}
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
   dispatchEvent(evt){for(const fn of this.listeners[evt.type]||[])fn(evt);return true;}
   setAttribute(k,v){this.attrs[k]=String(v);}
   replaceChildren(){this.options=[];}
   add(option){this.options.push(option);}
   insertAdjacentElement(){}
   querySelector(){return new FakeNode();}
 }
 for(const name of ['jvEngine','jvVoice','jvLang','jvEnabled','jvReload','jvPreview',
   'jvSoundCheck','jvRead','jvStop','jvNotice','jvVoiceBadge','jvAudioPlayer','jvQuickToggle'])
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
 vm.runInNewContext(source,{window,document,localStorage,Event,Option,fetch:async()=>{throw Error('Never call the TTS API without device pairing');},URL,AbortController,console},{filename:'jarvis-voice.js'});
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
 app.emit('dgos-jarvis-microphone-state',{state:'listening'});
 assert.equal(app.calls.play.length,0,'Never voice-record the listening message');
 app.emit('dgos-jarvis-microphone-state',{state:'processing'});
 assert.equal(app.calls.play.length,0,'Never read intermediate transcription');
 app.emit('dgos-jarvis-microphone-state',{state:'result'});
 app.emit('dgos-jarvis-final-response',{text:'Okay Gomes, Milch ist gespeichert.'});
 assert.deepEqual(app.calls.play,['Okay Gomes, Milch ist gespeichert.']);
 app.emit('dgos-jarvis-final-response',{text:'Ich habe deinen Kalender geöffnet.'});
 assert.equal(app.calls.play.length,2,'Two finished voice commands produce two replies');
 app.click('jvQuickToggle');
 assert.equal(app.nodes.jvEnabled.checked,false);
 assert.equal(app.storage.get('dgos.jarvis.speech.enabled'),'0');
 app.emit('dgos-jarvis-final-response',{text:'Ich bin jetzt stumm.'});
 assert.equal(app.calls.play.length,2,'Explicit mute must be respected');
 app.click('jvQuickToggle');
 assert.equal(app.nodes.jvEnabled.checked,true);
 assert.equal(app.calls.play.at(-1),'Ich bin jetzt stumm.','Re-enable plays last completed answer once');
 app.click('jvRead');
 assert.equal(app.calls.play.at(-1),'Ich bin jetzt stumm.','Manual repeat remains functional');
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
console.log('DG OS Jarvis spoken replies: microphone completion, auto-on, mute, replay and offline premium fallback OK');
