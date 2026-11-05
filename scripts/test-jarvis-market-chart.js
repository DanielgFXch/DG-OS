'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const chart=require('../jarvis-market-chart.js');
const html=read('index.html'),sw=read('sw.js'),personal=read('personal.js'),
  source=read('jarvis-market-chart.js'),style=read('jarvis-market-chart.css');
assert.doesNotThrow(()=>new vm.Script(source));
assert.equal(chart.shouldOpen('Hey Jarvis, öffne den Gold-Chart'),true);
assert.equal(chart.shouldOpen('Öffne den Chart'),true);
assert.equal(chart.shouldOpen('Jarvis, zeig mir den XAUUSD Chart'),true);
assert.equal(chart.shouldOpen('Analysiere Gold auf dem 5-Minuten-Chart'),true);
assert.equal(chart.shouldOpen('Kannst du den London Sweep prüfen?'),true);
assert.equal(chart.shouldOpen('Wie sieht der Gold Markt aus?'),true);
assert.equal(chart.shouldOpen('Trading'),false,'Normal Trading navigation stays');
assert.equal(chart.shouldOpen('Kannst du meine letzten 2 MT5 Trades analysieren?'),false,
  'No fake MT5 chart or personal trades');
assert.equal(chart.shouldOpen('Ich brauche Milch und Eier'),false);
assert.equal(chart.parseTime('2026-11-05 01:28:49'),Date.parse('2026-11-05T01:28:49Z'));
assert.equal(chart.parseTime('2026-11-05'),Date.parse('2026-11-05T00:00:00Z'));
assert.ok(Number.isNaN(chart.parseTime('this morning')));
const sample={
 symbol:'XAU/USD',candlesByTimeframe:{
  '1h':{series:[
   {datetime:'2026-11-05 11:00:00',open:4000,high:4008,low:3994,close:4002},
   {datetime:'2026-11-05 10:00:00',open:4006,high:4010,low:3998,close:4000},
   {datetime:'2026-11-05 11:00:00',open:4000,high:4008,low:3994,close:4002},
   {datetime:'2026-11-05 12:00:00',open:4002,high:3999,low:3990,close:4005},
   {datetime:'not-a-date',open:1,high:2,low:.5,close:1.5},
   {datetime:'2026-11-05 13:00:00',open:4002,high:4002,low:4002,close:4002},
   {datetime:'2026-11-05 14:00:00',open:null,high:4002,low:3995,close:4000}
  ]}
 }
};
const bars=chart.normalizeCandles(sample,'1h');
assert.equal(bars.length,2);
assert.equal(bars[0].time,Date.parse('2026-11-05T10:00:00Z'));
assert.equal(bars[1].close,4002);
assert.equal(chart.normalizeCandles({...sample,symbol:'BTCUSD'},'1h').length,0);
assert.equal(chart.normalizeCandles(sample,'1min').length,0,'unsupported 1M never invented');
assert.equal(chart.normalizeCandles({symbol:'XAUUSD',candlesByTimeframe:{'1h':{series:[]}}},'1h').length,0);
const actual=JSON.parse(read('data/market.json'));
assert.ok(['XAUUSD','XAU/USD'].includes(actual.symbol));
for(const tf of ['5min','15min','1h','4h','daily']){
 const series=chart.normalizeCandles(actual,tf);
 assert.ok(series.length>0,tf+' must be real provider OHLC in checked-in snapshot');
 assert.ok(series.every(x=>Number.isFinite(x.open)&&Number.isFinite(x.time)));
}
for(const id of ['jarvisMarketDialog','jmcTitle','jmcClose','jmcCanvas',
  'jmcChartViewport','jmcFeedStatus','jmcOhlc','jmcQuestion',
  'jmcJarvisAnswer','jmcOpenButton','jmcBackToTrading',
  'jmcZoomIn','jmcZoomOut','jmcFit','jmcReload','jmcAskAgain','jmcReplay','jmcVoiceStatus',
  'jmcLastPrice','jmcLastPriceLabel','jmcDataTime','jmcCandleCount']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
}
for(const file of ['jarvis-market-chart.js?v=3','jarvis-market-chart.css?v=2']){
 assert.ok(html.includes(file),'HTML missing '+file);
 assert.ok(sw.includes("'./"+file+"'"),'PWA cache missing '+file);
}
assert.ok(html.indexOf('jarvis-market-chart.js?v=3')<html.indexOf('personal.js?v=0.59.12.3'));
assert.ok(html.indexOf('jarvis-market-chart.css?v=2')<html.indexOf('dg-unified-premium.css?v=1'));
assert.ok(personal.includes('DGOSJarvisMarketChart?.shouldOpen(original)'));
assert.ok(personal.includes('window.DGOSJarvisMarketChart.open({query:original,answer})'));
assert.ok(personal.includes('showReply(answer)'),'Keep existing finalized text/speech event');
assert.ok(source.includes("dgos-jarvis-final-response"),'Chart mirrors actual Jarvis response');
assert.ok(source.includes('data/market.json'),'No invented chart source');
assert.ok(source.includes("cache:'no-store'"));
assert.ok(source.includes("getContext('2d')"));
assert.ok(source.includes('devicePixelRatio'),'HiDPI displays');
assert.ok(source.includes('setPointerCapture'),'Touch drag support');
assert.ok(source.includes("aria-pressed"),'Selected timeframe accessibility');
assert.ok(source.includes('jmcBackToTrading'),'Back button must be operational');
assert.ok(source.includes("$('jvHeroRead')||$('jvRead')"),'Replay must reuse Jarvis iPhone audio path');
assert.ok(source.includes('dgos-jarvis-voice-state'),'Surface true audio state');
assert.ok(style.includes('prefers-reduced-motion')&&style.includes('@media(max-width:820px)'));
assert.ok(!source.includes('Math.random(')&&!source.includes('innerHTML')&&!source.includes('placeOrder('));
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/);
console.log('Jarvis Chart Studio: genuine XAUUSD candles, 5 timeframe parsing, command intent, responsive PWA & non-fake analysis PASS');
