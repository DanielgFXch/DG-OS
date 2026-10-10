#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const mic=require('../jarvis-microphone.js');
assert.equal(mic.isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)','iPhone',0),true);
assert.equal(mic.isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)','MacIntel',5),true);
assert.equal(mic.isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)','MacIntel',0),false);
assert.equal(mic.chooseMime(x=>x==='audio/mp4'),'audio/mp4');
assert.equal(mic.chooseMime(x=>x==='audio/webm'),'audio/webm');
assert.equal(mic.chooseMime(()=>false),'');
const html=read('index.html'),personal=read('personal.js'),voice=read('jarvis-voice.js');
assert.match(html,/jarvis-microphone\.js\?v=2/);
assert.match(html,/personal\.js\?v=0\.59\.5/);
assert.match(html,/jarvis-voice\.js\?v=9/);
assert.match(html,/jarvis-brain\.js\?v=3/);
assert.ok(html.indexOf('jarvis-microphone.js?v=2')<html.indexOf('personal.js?v=0.59.5'));
assert.ok(personal.includes('window.DGOSJarvisMicrophone?.create('));
assert.ok(personal.includes('dgos-jarvis-final-response'));
assert.ok(personal.includes('dgos-jarvis-microphone-state'));
assert.ok(personal.includes("setOrbState('thinking')"));
assert.ok(voice.includes("window.addEventListener('dgos-jarvis-final-response'"));
assert.ok(voice.includes("window.addEventListener('dgos-jarvis-microphone-state'"));
assert.ok(!voice.includes('new MutationObserver(()=>{\n    const text=reply.textContent'), 'Never read mic messages while listening');
assert.ok(read('jarvis-brain.js').includes("new CustomEvent('dgos-jarvis-final-response'"));
assert.doesNotThrow(()=>new Function(read('jarvis-microphone.js')));
assert.doesNotThrow(()=>new Function(personal));
assert.doesNotThrow(()=>new Function(voice));
assert.ok(!read('jarvis-microphone.js').includes('OPENAI_API_KEY'));
assert.ok(!read('jarvis-microphone.js').includes('SUPABASE_SERVICE_ROLE_KEY'));
const backend=read('supabase/functions/jarvis-private/index.ts');
for(const word of ['action === "transcribe"','gpt-4o-mini-transcribe','dgos_device_sessions','device_pairing_required','audio/mp4','await authorized(req)']){
  assert.ok(backend.includes(word),'Missing auth/format feature: '+word);
}
const later=()=>new Promise(resolve=>setImmediate(resolve));
class FakeRecorder {
  static isTypeSupported(type){return type==='audio/mp4';}
  constructor(stream,opts){this.stream=stream;this.mimeType=opts.mimeType;this.state='inactive';this.events={};}
  addEventListener(name,fn){this.events[name]=fn;}
  start(){this.state='recording';}
  stop(){
    this.state='inactive';
    this.events.dataavailable?.({data:new Blob([new Uint8Array(500)],{type:this.mimeType})});
    this.events.stop?.();
  }
}
async function run(){
  let stopped=0, uploads=0, got='', statuses=[];
  const env={
    navigator:{userAgent:'iPhone OS 18',platform:'iPhone',maxTouchPoints:5,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})}},
    MediaRecorder:FakeRecorder,Blob,FormData,AbortController,
    setTimeout,clearTimeout,localStorage:{getItem:()=> 'fake_authenticated_token_test'},
    fetch:async(url,options)=>{
      uploads++;
      assert.ok(url.includes('jarvis-private?action=transcribe'),'Use existing private server');
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Authorization,'Bearer fake_authenticated_token_test');
      assert.ok(options.body instanceof FormData,'Native mobile audio upload, never a base64 public URL');
      const sound=options.body.get('audio');
      assert.equal(sound.type,'audio/mp4');
      assert.ok(sound.size>=100);
      return {ok:true,json:async()=>({transcript:'Hey Jarvis, ich brauche Toast, Milch und Käse'})};
    }
  };
  const cap=mic.create({env,onState:(s)=>statuses.push(s),onTranscript:(s)=>{got=s;},onError:e=>{throw Error(e);}});
  assert.equal(cap.preferRecorder,true);
  cap.start();
  await later();await later();
  assert.equal(cap.getMode(),'listening','Tap orb must start recorder after permission');
  assert.ok(statuses.includes('starting'));
  assert.ok(statuses.includes('listening'));
  cap.stop();
  await later();await later();
  assert.equal(uploads,1);
  assert.equal(got,'Hey Jarvis, ich brauche Toast, Milch und Käse');
  assert.ok(statuses.includes('processing'),'Must show server-transcription progress');
  assert.equal(stopped,1,'Microphone audio track stopped after upload');
  cap.destroy();
  // User denied permission: visible error, never silent.
  let error='';
  const denied=mic.create({env:{...env,navigator:{...env.navigator,mediaDevices:{getUserMedia:async()=>{const e=Error('denied');e.name='NotAllowedError';throw e;}}}},onError:e=>{error=e;}});
  denied.start();await later();await later();
  assert.ok(error.includes('Mikrofonzugriff verweigert'));
  // Missing paired token: audio is never sent anonymously.
  let noTokenError='', deniedUploads=0;
  const noToken=mic.create({env:{...env,localStorage:{getItem:()=>''},fetch:async()=>{deniedUploads++;}},onError:e=>{noTokenError=e;}});
  noToken.start();await later();noToken.stop();await later();await later();
  assert.equal(deniedUploads,0);assert.ok(noTokenError.includes('Telegram'));
  console.log('iPhone Jarvis microphone: recording, transcribe, error, pairing, voice and UI integration tests passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
