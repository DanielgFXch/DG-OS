#!/usr/bin/env node
'use strict';
/* Simulated Web Speech/iOS error regressions. This is not real device audio testing. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','jarvis-native-voice.js'),'utf8');

function setup({emitStart=true}={}){
  const calls={cancel:0,speak:0};
  let next=0,now=0;
  const timers=new Map();
  function schedule(cb,delay){const id=++next;timers.set(id,{at:now+Number(delay),cb});return id;}
  function clear(id){timers.delete(id);}
  function advance(delta){
    const until=now+delta;
    while(true){
      const entries=[...timers.entries()].filter(([,x])=>x.at<=until)
        .sort((a,b)=>a[1].at-b[1].at);
      if(!entries.length)break;
      const [id,task]=entries[0];
      now=task.at;timers.delete(id);task.cb();
    }
    now=until;
  }
  const synth={
    speaking:false,pending:false,paused:false,last:null,
    cancel(){
      calls.cancel++;
      this.speaking=false;this.pending=false;this.paused=false;
    },
    speak(u){
      calls.speak++;this.last=u;this.speaking=true;
      if(emitStart)u.onstart?.();
    }
  };
  class Utterance{
    constructor(text){this.text=text;this.lang='';this.rate=1;this.pitch=1;this.volume=1;}
  }
  const root={speechSynthesis:synth,SpeechSynthesisUtterance:Utterance};
  vm.runInNewContext(source,{window:root,setTimeout:schedule,clearTimeout:clear});
  return {player:root.DGOSLocalVoice,synth,calls,advance,timers};
}

{
  const {player,synth,calls}=setup();
  const events=[];
  assert.equal(player.play({text:'Hallo',onState:e=>events.push(e)}),true);
  assert.equal(calls.cancel,0,'idle speechSynthesis must not be canceled');
  assert.equal(calls.speak,1);
  assert.equal(synth.last.text,'Hallo');
  assert.ok(events.some(e=>e.state==='speaking'));
  assert.ok(!events.some(e=>e.state==='restarting'));
  player.stop();
  assert.equal(calls.cancel,1);
  const old=synth.last;
  old.onerror?.({error:'canceled'});
  assert.ok(!events.some(e=>e.state==='error'),'manual stop must ignore stale cancellation callbacks');
  assert.equal(player.play({text:'Neu'}),true);
  assert.equal(calls.speak,2);
  assert.equal(calls.cancel,1);
}

{
  // Safari can omit onend. If the synthesis engine already reports idle,
  // another tap must speak immediately even if our JS reference is stale.
  const {player,synth,calls}=setup();
  const events=[];
  player.play({text:'Erster Satz',onState:e=>events.push(e)});
  synth.speaking=false;
  assert.equal(player.play({text:'Zweiter Satz',onState:e=>events.push(e)}),true);
  assert.equal(calls.speak,2,'stale active reference must not eat second tap');
  assert.equal(calls.cancel,0,'do not cancel an already-idle engine');
  assert.ok(!events.some(e=>e.state==='stopped'));
}

{
  // Safari can keep speaking=true after audio has stopped.
  // One more tap must automatically cancel + restart in one interaction.
  const {player,synth,calls,advance}=setup();
  const events=[];
  player.play({text:'Alter Satz'});
  const first=synth.last;
  assert.equal(player.play({text:'Neuer Satz',onState:e=>events.push(e)}),true);
  assert.equal(calls.cancel,1);
  assert.equal(calls.speak,1,'restart is slightly deferred to let cancellation settle');
  assert.ok(events.some(e=>e.state==='restarting'));
  first.onerror?.({error:'canceled'});
  advance(130);
  assert.equal(calls.speak,2,'second tap should restart without third tap');
  assert.equal(synth.last.text,'Neuer Satz');
  assert.ok(events.some(e=>e.state==='speaking'));
}

{
  // If onstart never happens, the old request must not block future taps.
  const {player,calls,advance}=setup({emitStart:false});
  const events=[];
  player.play({text:'Stuck',onState:e=>events.push(e)});
  assert.equal(calls.speak,1);
  advance(5000);
  assert.ok(events.some(e=>e.state==='timeout'),'surface a timeout after no start');
  assert.equal(calls.cancel,1,'clear pending synthesizer on timeout');
  player.play({text:'Nochmal',onState:e=>events.push(e)});
  assert.equal(calls.speak,2,'next tap should immediately retry after timeout');
  assert.ok(!events.some(e=>e.state==='stopped'));
}

{
  const {player,synth}=setup();
  const events=[];
  player.play({text:'Unbekannte Stimme',onState:e=>events.push(e)});
  synth.last.onerror({error:'voice-unavailable'});
  assert.ok(events.some(e=>e.state==='error'&&e.error==='voice-unavailable'&&e.message.includes('Systemstimme')));
}

{
  const root={speechSynthesis:null,SpeechSynthesisUtterance:null};
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout});
  const events=[];
  assert.equal(root.DGOSLocalVoice.isSupported(),false);
  assert.equal(root.DGOSLocalVoice.play({text:'test',onState:e=>events.push(e)}),false);
  assert.equal(events[0].error,'unsupported');
}
console.log('Jarvis native voice iOS mocked regression checks passed.');
