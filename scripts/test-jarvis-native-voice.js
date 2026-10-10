#!/usr/bin/env node
'use strict';
/* Simulated Web Speech checks: validate the iOS cancel-then-speak regression
   without microphone access, external TTS, or a real user's device. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','jarvis-native-voice.js'),'utf8');
function setup(){
  const calls={cancel:0,speak:0};
  const synth={
    speaking:false,pending:false,paused:false,last:null,
    cancel(){
      calls.cancel++;
      this.speaking=false;this.pending=false;this.paused=false;
    },
    speak(u){
      calls.speak++;this.last=u;
      this.speaking=true;
      u.onstart?.();
    }
  };
  class Utterance{
    constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;}
  }
  const root={speechSynthesis:synth,SpeechSynthesisUtterance:Utterance};
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout});
  return {player:root.DGOSLocalVoice,synth,calls};
}
{
  const {player,synth,calls}=setup();
  const events=[];
  assert.equal(player.isSupported(),true);
  assert.equal(player.play({text:'Hallo',lang:'de-DE',onState:x=>events.push(x)}),true);
  assert.equal(calls.cancel,0,'first gesture must NEVER cancel an idle engine');
  assert.equal(calls.speak,1);
  assert.equal(synth.last.text,'Hallo');
  assert.ok(events.some(x=>x.state==='speaking'));
  assert.ok(!events.some(x=>x.state==='error'));
  assert.ok(!events.some(x=>x.state==='starting'),'synchronous onstart must not be overwritten');
  player.stop();
  assert.equal(calls.cancel,1,'active utterance should be cancellable');
  const stale=synth.last;
  stale.onerror({error:'canceled'});
  assert.ok(!events.some(x=>x.state==='error'),'ignore stale onerror after manual stop');
  assert.equal(player.play({text:'Zweiter Versuch'}),true);
  assert.equal(calls.cancel,1,'fresh attempt after stop does not idle-cancel');
}
{
  const {player,synth,calls}=setup();
  const updates=[];
  player.play({text:'Test',onState:x=>updates.push(x)});
  assert.equal(player.play({text:'Nochmal',onState:x=>updates.push(x)}),false);
  assert.equal(calls.cancel,1);
  assert.equal(calls.speak,1,'second tap must stop, not cancel-then-speak');
  assert.ok(updates.some(x=>x.state==='stopped'));
  assert.equal(player.play({text:'Neue Wiedergabe'}),true);
  assert.equal(calls.speak,2);
  const err=[];
  synth.last.onerror({error:'voice-unavailable'});
  // A separate attempt checks diagnostic propagation.
  player.stop();
  player.play({text:'Stimme prüfen',onState:x=>err.push(x)});
  synth.last.onerror({error:'voice-unavailable'});
  assert.ok(err.some(x=>x.state==='error'&&x.error==='voice-unavailable'&&x.message.includes('Systemstimme')));
}
{
  const root={speechSynthesis:null,SpeechSynthesisUtterance:null};
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout});
  const status=[];
  assert.equal(root.DGOSLocalVoice.isSupported(),false);
  assert.equal(root.DGOSLocalVoice.play({text:'test',onState:x=>status.push(x)}),false);
  assert.equal(status[0].error,'unsupported');
}
console.log('Jarvis native iOS voice mocked regression checks passed.');
