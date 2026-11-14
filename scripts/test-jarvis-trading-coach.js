#!/usr/bin/env node
'use strict';
// Non-persistent contract tests: no credentials, API calls, trade execution, or costs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const coach=require('../jarvis-trading-coach-engine.js');
for(const p of ['jarvis-trading-coach-engine.js','jarvis-trading-coach-ui.js',
    'jarvis-market-chart.js','personal.js'])
  assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}));
const sample=(label='good',extra={})=>({
  label,side:'buy',session:'london',timeframe:'m5',
  liquidity:'sweep',zone:'fvg',confirmation:'m5_engulfing',
  note:'Confirmed Asia sweep and M5 reaction',
  resultR:null,...extra
});
assert.equal(coach.normalize(sample()).label,'good');
assert.equal(coach.normalize(sample('fake')),null);
assert.equal(coach.normalize(sample('good',{zone:'fake'})),null);
assert.equal(coach.normalize(sample('good',{resultR:101})),null);
assert.equal(coach.normalize(sample('good',{resultR:-21})),null);
assert.equal(coach.normalize(sample('good',{resultR:1.1})).resultR,1.1);
assert.equal(coach.normalize(sample('missed',{resultR:2.5})),null,'Missed setup cannot have realised R');
assert.equal(coach.normalize(sample('good',{note:'<img onerror=alert(1)>'})).note,'<img onerror=alert(1)>');
let result=coach.evaluate(sample(),[]);
assert.equal(result.status,'learning','No personal examples never generate a READY signal');
assert.match(result.headline,/nicht genügend/i);
result=coach.evaluate(sample(),[sample(),sample(),sample()]);
assert.equal(result.status,'aligned');
assert.match(result.evidence,/3 ähnliche/);
assert.match(result.reasons.join(' '),/keine Live-Handelsempfehlung/);
result=coach.evaluate(sample(),[sample('avoid'),sample('avoid'),sample('good')]);
assert.equal(result.status,'caution');
result=coach.evaluate(sample(),[sample(),sample('avoid'),sample()]);
assert.equal(result.status,'mixed');
result=coach.evaluate(sample('good',{zone:'unknown',confirmation:'none'}),[sample(),sample(),sample()]);
assert.equal(result.status,'wait','Never overrule missing confirmation because of prior likes');
result=coach.evaluate(sample(),[sample('missed'),sample('missed'),sample('missed')]);
assert.equal(result.status,'learning','Missed trades are not proof of wins');
const summary=coach.reviewAnalysis([sample(),sample('avoid'),sample('missed')]);
assert.deepEqual(summary.labels,{good:1,avoid:1,missed:1});
assert.equal(summary.outcomeNote,'');
assert.match(coach.coachThoughts([]),/noch nicht/);
assert.match(coach.coachThoughts([sample(),sample('avoid')]),/Gegenprobe|vergleichbare/);
const outcome=coach.reviewAnalysis([
  sample('good',{resultR:1.1}),sample('good',{resultR:-1}),
  sample('avoid',{resultR:0}),sample('good',{resultR:2}),
  sample('good',{resultR:.3})
]);
assert.match(outcome.outcomeNote,/selbst eingetragenen R-Ergebnissen/);
assert.match(outcome.outcomeNote,/keine verifizierte Broker-Statistik/);
for(const utterance of [
  'Jarvis, was soll ich beim Trading verbessern?',
  'Wie kann ich besser traden?',
  'Analysiere mein Trading',
  'Welche Setups passen zu meinem Stil?'
])assert.equal(coach.isCoachingQuestion(utterance),true,utterance);
for(const utterance of ['Hey Jarvis, merke dir dieses Setup','Setup bewerten','Mein Setup-Journal'])
  assert.equal(coach.isLearningCommand(utterance),true,utterance);

const html=read('index.html'),sw=read('sw.js'),personal=read('personal.js');
for(const key of ['jtcCoach','jtcExpand','jtcTitle','jtcForm','jtcLabel','jtcSide',
  'jtcSession','jtcTimeframe','jtcLiquidity','jtcZone','jtcConfirmation',
  'jtcNote','jtcResultR','jtcEvaluate','jtcSave','jtcAssessment','jtcThoughts',
  'jtcExamples','jtcReload','jtcStatus','jtcCount','jtcGoodCount','jtcAvoidCount',
  'jtcMissedCount','jmcCoach']) {
  assert.equal((html.match(new RegExp('id="'+key+'"','g'))||[]).length,1,'missing/duplicate '+key);
}
for(const asset of ['jarvis-trading-coach-engine.js?v=1',
  'jarvis-trading-coach-ui.js?v=1','jarvis-trading-coach.css?v=1']){
  assert.ok(html.includes(asset)&&sw.includes(asset),'missing PWA asset '+asset);
}
assert.ok(html.indexOf('jarvis-trading-coach-engine.js?v=1')<
  html.indexOf('personal.js?v=0.59.12.8'),'Voice intent engine before personal route');
assert.ok(html.indexOf('jarvis-trading-coach-ui.js?v=1')>
  html.indexOf('personal.js?v=0.59.12.8'),'Private journal initializes after Jarvis');
assert.ok(personal.indexOf('DGOSTradingCoachEngine?.isCoachingQuestion(original)')<
  personal.indexOf('DGOSJarvisMarketChart?.shouldOpen(original)'),'Coach intent must win over chart intent');
assert.ok(personal.includes('showReply(window.DGOSTradingCoach?.summary()'));
assert.ok(read('jarvis-market-chart.js').includes('DGOSTradingCoach?.open({timeframe:tf})'));
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/);
const ui=read('jarvis-trading-coach-ui.js');
assert.ok(ui.includes("localStorage.getItem('dgos.deviceSession')"));
assert.ok(ui.includes('Authorization:')||ui.includes('Bearer '));
assert.ok(!ui.includes('innerHTML')&&!ui.includes('insertAdjacentHTML')&&!ui.includes('localStorage.setItem'));
assert.ok(ui.includes("engine.coachThoughts(items)"));
assert.ok(ui.includes("action=delete")===false,'Use query param encoding not unvalidated API string');
assert.ok(!ui.includes('Math.random('));
const edge=read('supabase/functions/jarvis-trading-coach/index.ts');
const migration=read('supabase/migrations/20261106010000_dgos_trading_coach_examples.sql');
for(const part of [
  'dgos_device_sessions','dgos_telegram_config','SHA-256','expires_at',
  'owner_chat_id','device_pairing_required','Bearer','origin_not_allowed',
  'payload_too_large','invalid_example','example_limit_reached',
  'source:"owner_manual"',".eq(\"owner_chat_id\",owner)"
])assert.ok(edge.includes(part),'Edge security field: '+part);
assert.ok(edge.includes('"cache-control":"no-store"'));
assert.ok(!edge.includes('OPENAI_API_KEY')&&!edge.includes('placeOrder('));
assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
assert.ok(migration.includes('REVOKE ALL ON public.dgos_trading_coach_examples FROM PUBLIC, anon, authenticated'));
assert.ok(migration.includes('TO service_role'));
assert.ok(migration.includes('result_r numeric') && migration.includes('source ='));
assert.ok(migration.includes("label <> 'missed' OR result_r IS NULL"));
assert.ok(ui.includes("$('jtcResultR').disabled=missed"));
assert.ok(read('supabase/config.toml').includes('[functions.jarvis-trading-coach]'));
console.log('Jarvis Trading Coach: private setup journal, natural voice intent, cautious evidence, security & UI PASS');
