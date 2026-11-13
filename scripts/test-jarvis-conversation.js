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
const fresh=chat.answerTrading('Kannst du den London Sweep prüfen?',{
 now,liveBrain:{...snapshot.brain,symbol:'XAUUSD'},liveVerified:true,
 liveQuote:{price:3899.82,at:'2026-11-05T11:59:56Z'},
 answerMarketQuestion:()=> 'Es sind keine bestätigten Einstiegsdaten vorhanden.'
});
assert.match(fresh,/bestätigter Market Server/);
assert.match(fresh,/keine bestätigten Einstiegsdaten/);

const completeBrain={
 symbol:'XAUUSD',status:'WAIT',
 report:{status:'WAIT',freshBullishPOIs:[{range:'3880–3890'}]},
 htfContext:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}},
 decision:{status:'WAIT',direction:null,tradingBias:'BEARISH',macroBias:'BULLISH',
   reasons:['15M Confirmation fehlt'],missingRequirements:['15M Confirmation fehlt']}
};
const verifiedQuote={price:3900.22,at:'2026-11-05T11:59:55Z'};
const spoken=chat.answerTrading('Hey Jarvis, wo steht Gold gerade, und was sollte man mit Gold nun machen?',{
 now,liveBrain:completeBrain,liveVerified:true,liveQuote:verifiedQuote,
 trendContext:{read:()=>({
   available:true,tradingBias:'BEARISH',macroBias:'BULLISH',
   downTargets:[{price:3870,reason:'Daily Low'}],upTargets:[{price:3925,reason:'4H OB'}],
   sweptLows:[{label:'Asia Low',price:3880,reactionConfirmed:true}],
   countertrend:{isCountertrendContext:true}
 })},
 setupClarity:{read:()=>({
   entryStatus:'WAIT',reason:'Kein bestätigter Entry.',
   missing:['15M Confirmation fehlt'],risks:['Gegen den bearishen Trading Bias.'],
   antiFomo:'Nicht chasen. Kein FOMO.'
 })}
});
assert.equal(chat.isTradingQuestion('Hey Jarvis wo steht Gold gerade und was sollte man nun machen?'),true);
assert.equal(chat.isGoldStatusQuestion('Wo steht XAUUSD gerade?'),true);
assert.match(spoken,/3\.900,22/);
assert.match(spoken,/US-Dollar je Feinunze/);
assert.match(spoken,/5 Sekunden/);
assert.match(spoken,/Daily und 4 Stunden: BEARISH/);
assert.match(spoken,/3\.870,00/);
assert.match(spoken,/3\.925,00/);
assert.match(spoken,/Asia Low/);
assert.match(spoken,/Long.*gegen den bearishen Trading Trend/);
assert.match(spoken,/DG-Setup-Status: WAIT/);
assert.match(spoken,/Kein FOMO/);
assert.doesNotMatch(spoken,/BUY_READY|SELL_READY/);

// Browser-only TwelveData WebSocket is a genuine real-time PRICE source but
// intentionally cannot turn an old candle snapshot into a current DG entry.
const directQuote={
 price:3900.22,at:'2026-11-05T11:59:55Z',
 symbol:'XAUUSD',source:'TWELVEDATA_BROWSER_WEBSOCKET'
};
const pastBrain={...snapshot,brain:{...snapshot.brain,
 decision:{status:'DATA_NOT_READY',macroBias:'BEARISH',tradingBias:'NEUTRAL_MIXED'},
 targets:[{direction:'down',price:3870,reason:'Daily Low'},{direction:'up',price:3940,reason:'H1 FVG'}]}};
const browserSpoken=chat.answerTrading('Hey Jarvis wo steht Gold gerade und soll ich kaufen?',{
 now,browserQuote:directQuote,historicalSnapshot:pastBrain
});
assert.match(browserSpoken,/direktem TwelveData-WebSocket/);
assert.match(browserSpoken,/3\.900,22/);
assert.match(browserSpoken,/5 Sekunden/);
assert.match(browserSpoken,/Macro-Bias BEARISH/);
assert.match(browserSpoken,/Trading-Bias NEUTRAL_MIXED/);
assert.match(browserSpoken,/historische Orientierung/);
assert.match(browserSpoken,/3\.870,00/);
assert.match(browserSpoken,/3\.940,00/);
assert.match(browserSpoken,/nicht aktuell bestätigt/);
assert.match(browserSpoken,/WAIT/);
assert.match(browserSpoken,/NICHT bestätigt/);
assert.doesNotMatch(browserSpoken,/BUY_READY|SELL_READY|Kauf empfohlen/);
const browserOnly=chat.answerTrading('Was ist der Goldpreis jetzt?',{
 now,browserQuote:directQuote
});
assert.match(browserOnly,/3\.900,22/);
assert.match(browserOnly,/keine ausreichend aktuellen Kerzen/);
assert.doesNotMatch(browserOnly,/BUY_READY|SELL_READY/);
for(const bad of [
 {...directQuote,at:'2026-11-05T11:59:20Z'},
 {...directQuote,price:NaN},
 {...directQuote,price:-1},
 {...directQuote,symbol:'EURUSD'},
 {...directQuote,source:'FAKE'},
 {...directQuote,at:'2026-11-05T12:01:00Z'}
]){
 const unsafe=chat.answerTrading('Wo steht Gold gerade?',{
   now,browserQuote:bad,historicalSnapshot:pastBrain
 });
 assert.doesNotMatch(unsafe,/3\.900,22/,'No false live quote');
 assert.match(unsafe,/Historische Marktaufnahme/);
}
const staleQuote=chat.answerTrading('Wo steht Gold gerade?',{
 now,liveBrain:completeBrain,liveVerified:true,
 liveQuote:{price:3900.22,at:'2026-11-05T11:59:20Z'},
 trendContext:{read:()=>({available:false})}
});
assert.match(staleQuote,/kein ausreichend frischer Livepreis/i);
assert.doesNotMatch(staleQuote,/3\.900,22/);
const unreachable=chat.answerTrading('Wo steht Gold gerade?',{
 now,liveBrain:completeBrain,liveVerified:false,
 liveQuote:verifiedQuote, historicalSnapshot:snapshot
});
assert.match(unreachable,/Historische Marktaufnahme/);
assert.doesNotMatch(unreachable,/3\.900,22/);
const missingQuote=chat.answerTrading('Wo steht Gold gerade?',{
 now,liveBrain:completeBrain,liveVerified:true,
 liveQuote:null
});
assert.match(missingQuote,/kein ausreichend frischer Livepreis/i);
assert.doesNotMatch(missingQuote,/3\.900,22/);
const historicClose=chat.answerTrading('Wo steht Gold gerade?',{
 now,historicalSnapshot:{
   ...snapshot,
   brain:{...snapshot.brain,
     htfContext:{h1:{lastCandle:{close:3880.44}}}}
 },
 answerMarketQuestion:()=> 'DATA_NOT_READY'
});
assert.match(historicClose,/Letzter dokumentierter H1-Schlusskurs: 3\.880,44/);
assert.match(historicClose,/nicht der aktuelle Livepreis/);
assert.match(historicClose,/Kein FOMO/);
const clientApp=read('app.js');
assert.ok(clientApp.includes('window.DGOSBrowserGoldFeed=Object.freeze'));
assert.ok(clientApp.includes('tdLastGoldPriceTick={price:msg.price'));
assert.ok(clientApp.includes('readyState!==WebSocket.OPEN'));
assert.ok(clientApp.includes('age>20000'));
assert.ok(clientApp.includes("msg.symbol==='XAU/USD'"));
assert.ok(personal.includes('DGOSBrowserGoldFeed?.getQuote?.()'));
assert.ok(personal.includes('liveQuote,browserQuote'));
assert.ok(personal.includes('DGTradingEvidenceGate.assess('));
assert.ok(personal.includes('liveQuote:marketServerState.quote')||
   personal.includes('price:marketServerState.quote?.price'));
assert.ok(personal.includes('liveVerified:verified'));
assert.ok(personal.includes('trendContext:window.DGTrendContext'));
assert.ok(personal.includes('setupClarity:window.DGSetupClarity'));

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
assert.ok(html.indexOf('jarvis-conversation.js?v=3')<html.indexOf('personal.js?v='));
assert.ok(html.indexOf('jarvis-conversation.css?v=1')<html.indexOf('dg-unified-premium.css?v=1'));
for(const asset of ['jarvis-conversation.css?v=1','jarvis-conversation.js?v=3'])
  assert.ok(html.includes(asset)&&sw.includes(asset),'PWA cache includes '+asset);
for(const name of ['jarvisUserTurn','jarvisLastQuestion'])
  assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1);
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/);
assert.ok(!read('jarvis-conversation.js').includes('fetch('));
assert.ok(!read('jarvis-conversation.js').includes('placeOrder('));

// Long voice replies are all spoken in chunks, not cut off after 800 chars.
const spokenChunks=[];
const synth={last:null,speaking:false,pending:false,paused:false,
 speak(u){spokenChunks.push(u.text);this.last=u;this.speaking=true;u.onstart?.();},
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
assert.ok(spokenChunks.length>=3,'Long answers must create multiple utterances');
assert.equal(spokenChunks.join(' ').replace(/\s+/g,' ').trim(),input.replace(/\s+/g,' ').trim());
assert.equal(state,'ended');
// Stopping an ongoing reply cannot automatically start a delayed old segment.
spokenChunks.length=0;
root.DGOSLocalVoice.play({text:input});
const previous=synth.last;
root.DGOSLocalVoice.stop();
previous.onend?.();
assert.equal(spokenChunks.length,1);
console.log('Jarvis dialogue: natural typed/mic intent, private owner AI, trading evidence, iOS complete speech/replay, UI and PWA PASS');
