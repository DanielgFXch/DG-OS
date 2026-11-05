'use strict';
// Natural DG OS Jarvis conversation. No API calls, broker data, secrets or TTS credits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const chat=require('../jarvis-conversation.js');
const html=read('index.html'),sw=read('sw.js'),personal=read('personal.js'),
  brain=read('jarvis-brain.js'),voice=read('jarvis-voice.js'),native=read('jarvis-native-voice.js');
for(const name of ['jarvis-conversation.js','jarvis-brain.js','personal.js','jarvis-voice.js',
  'jarvis-native-voice.js']) assert.doesNotThrow(()=>new vm.Script(read(name)),name);
assert.equal(chat.isTradingQuestion('Hey Jarvis, analysier mal meine letzten zwei Trades'),true);
assert.equal(chat.asksForOwnTrades('Analysier meine letzten zwei Trades'),true);
assert.equal(chat.isTradingQuestion('Jarvis wie sieht Gold heute aus?'),true);
assert.equal(chat.isTradingQuestion('Kannst du den London Sweep prüfen?'),true);
assert.equal(chat.isTradingQuestion('Trading'),false,'Existing navigation must keep working');
assert.equal(chat.isTradingQuestion('Ich brauche Milch und Eier'),false);
const trade=chat.answerTrading('Hey Jarvis, analysier mal meine letzten zwei Trades');
assert.match(trade,/keine|nicht direkt/i);
assert.match(trade,/MT5/);
assert.doesNotMatch(trade,/\+5\.777|75\s*%|BUY_READY/);
const missing=chat.answerTrading('Wie sieht Gold aus?');
assert.match(missing,/keine gültigen Trading-Brain-Daten/);
assert.doesNotMatch(missing,/(?:Kaufen|Verkaufen) bei \d/);
const now=new Date('2026-11-05T12:00:00Z');
const snapshot={mode:'PERIODIC_READ_ONLY',symbol:'XAUUSD',updatedAt:'2026-11-05T11:00:00Z',
  brain:{decision:{status:'DATA_NOT_READY'},report:{summary:'Offene Liquidität aus echten H1-Daten'}}};
const historical=chat.answerTrading('Wie sieht der Markt aus?',{
 now,historicalSnapshot:snapshot,answerMarketQuestion:()=> 'STATUS BUY_READY: Preis 4000'
});
assert.match(historical,/Historische Marktaufnahme/);
assert.match(historical,/KEIN Live-Chart/);
assert.match(historical,/DATA_NOT_READY/);
assert.doesNotMatch(historical,/BUY_READY/);
const stale=chat.answerTrading('Wie sieht der Markt aus?',{
 now,historicalSnapshot:{...snapshot,updatedAt:'2026-10-01T00:00:00Z'},
 answerMarketQuestion:()=>{throw Error('Must not call strategy on stale data');}
});
assert.match(stale,/keine gültigen Trading-Brain-Daten/);
const fresh=chat.answerTrading('Wie sieht Gold aus?',{
 now,liveBrain:snapshot.brain,answerMarketQuestion:()=> 'Es sind keine bestätigten Einstiegsdaten vorhanden.'
});
assert.match(fresh,/verbundenen Market Server/);
assert.match(fresh,/keine bestätigten Einstiegsdaten/);

assert.ok(personal.includes('window.DGOSJarvisConversation?.isTradingQuestion(original)'));
assert.ok(personal.includes('DGOSJarvisTalk'));
assert.ok(personal.includes('showUserTurn(text)'));
assert.ok(personal.includes('showUserTurn(value)'));
assert.ok(personal.includes("window.dispatchEvent(new CustomEvent('dgos-jarvis-final-response'"));
assert.ok(brain.includes('window.DGOSJarvisTalk=Object.freeze({ask:askConversation,errorMessage})'));
assert.ok(brain.includes("Authorization:'Bearer '+token"));
assert.ok(voice.includes('lastAudioBlob=blob'));
assert.ok(voice.includes('DGOSVoiceAudio?.playBlob?.(lastAudioBlob,'));
assert.ok(voice.includes('dgos-jarvis-voice-state'));
assert.ok(native.includes('speechChunks(transcript)'));
assert.ok(html.indexOf('jarvis-conversation.js?v=1')<html.indexOf('personal.js?v='));
assert.ok(html.indexOf('jarvis-conversation.css?v=1')<html.indexOf('dg-unified-premium.css?v=1'));
for(const asset of ['jarvis-conversation.css?v=1','jarvis-conversation.js?v=1'])
  assert.ok(html.includes(asset)&&sw.includes(asset),'PWA cache includes '+asset);
for(const name of ['jarvisUserTurn','jarvisLastQuestion'])
  assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1);
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/);
assert.ok(!read('jarvis-conversation.js').includes('fetch('));
assert.ok(!read('jarvis-conversation.js').includes('placeOrder('));

// Long voice replies are all spoken in chunks, not cut off after 800 chars.
const spoken=[];
const synth={last:null,speaking:false,pending:false,paused:false,
 speak(u){spoken.push(u.text);this.last=u;this.speaking=true;u.onstart?.();},
 cancel(){this.speaking=false;this.pending=false;this.paused=false;}
};
class Utterance{constructor(text){this.text=text;}}
const root={speechSynthesis:synth,SpeechSynthesisUtterance:Utterance};
vm.runInNewContext(native,{window:root,setTimeout(){return 1;},clearTimeout(){}});
const sentence='Diese echten Daten müssen von Jarvis vollständig erklärt werden. ';
const input=sentence.repeat(26).trim();
let state='';
assert.equal(root.DGOSLocalVoice.play({text:input,onState:e=>{state=e.state;}}),true);
let guard=0;
while(guard++<100){
 const previous=synth.last;
 previous.onend?.();
 if(synth.last===previous)break;
}
assert.ok(spoken.length>=3,'Long answers must create multiple utterances');
assert.equal(spoken.join(' ').replace(/\s+/g,' ').trim(),input.replace(/\s+/g,' ').trim());
assert.equal(state,'ended');
// Stopping an ongoing reply cannot automatically start a delayed old segment.
spoken.length=0;
root.DGOSLocalVoice.play({text:input});
const previous=synth.last;
root.DGOSLocalVoice.stop();
previous.onend?.();
assert.equal(spoken.length,1);
console.log('Jarvis dialogue: natural typed/mic intent, private owner AI, trading evidence, iOS complete speech/replay, UI and PWA PASS');
