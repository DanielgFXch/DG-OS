'use strict';
/* Asia / London / New York UTC strategy window + actual overlap countdown.
   These are calendar facts only; market feed and trading decision data remain untouched. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const clock=require('../trading-session-clock.js');
const on=time=>clock.windowsAt(new Date(time));
const names=r=>r.active.map(x=>x.name).join('+');
let x=on('2026-10-20T00:01:00Z');
assert.equal(x.state,'active');assert.equal(names(x),'ASIA');
assert.equal(x.untilEnd,'07:59:00');
assert.equal(x.changeType,'SESSION_END');
x=on('2026-10-20T07:59:59Z');
assert.equal(names(x),'ASIA');assert.equal(x.untilEnd,'00:00:01');
x=on('2026-10-20T08:00:00Z');
assert.equal(names(x),'LONDON');
assert.equal(x.changeType,'OVERLAP_START','London should not be marked as ending at NY open');
assert.equal(x.changeInSeconds,5*3600);
x=on('2026-10-20T12:59:59Z');
assert.equal(names(x),'LONDON');assert.equal(x.changeInSeconds,1);
x=on('2026-10-20T13:00:00Z');
assert.equal(x.state,'overlap');assert.equal(names(x),'LONDON+NEW YORK');
assert.equal(x.changeType,'OVERLAP_END');
assert.equal(x.changeInSeconds,3*3600);
x=on('2026-10-20T15:59:59Z');
assert.equal(x.state,'overlap');assert.equal(x.changeInSeconds,1);
x=on('2026-10-20T16:00:00Z');
assert.equal(x.state,'active');assert.equal(names(x),'NEW YORK');
assert.equal(x.changeType,'SESSION_END');
assert.equal(x.untilEnd,'05:00:00');
x=on('2026-10-20T20:59:59Z');
assert.equal(x.state,'active');assert.equal(x.changeInSeconds,1);
x=on('2026-10-20T21:00:00Z');
assert.equal(x.state,'between');assert.equal(x.active.length,0);
assert.equal(x.next.name,'ASIA');assert.equal(x.untilNext,'03:00:00');
x=on('2026-10-23T21:00:00Z');
assert.equal(x.state,'between');assert.equal(x.next.startAt,'2026-10-26T00:00:00.000Z');
x=on('2026-10-24T13:30:00Z');
assert.equal(x.state,'weekend');assert.equal(x.active.length,0);
assert.equal(x.next.name,'ASIA');
x=on('2026-10-25T13:30:00Z');
assert.equal(x.state,'weekend');assert.equal(x.next.startAt,'2026-10-26T00:00:00.000Z');
assert.equal(clock.timeInZurich(new Date('2026-10-20T13:00:00Z')),'15:00','October is CEST');
assert.equal(clock.timeInZurich(new Date('2026-01-20T13:00:00Z')),'14:00','January is CET');
assert.equal(clock.clockString(0),'00:00:00');
assert.equal(clock.clockString(5412345),'01:30:13');
assert.equal(clock.windowsAt('garbage'),null);

// DOM contract; display must remain independent of trading brain/API:
const html=read('index.html'),css=read('trading-session-clock.css');
const js=read('trading-session-clock.js'),sw=read('sw.js');
assert.doesNotThrow(()=>new Function(js));
assert.ok(!js.includes('fetch(')&&!js.includes('BUY_READY')&&!js.includes('placeOrder('));
assert.ok(html.indexOf('id="dgTradingSessionClock"')<html.indexOf('id="dgLondonRadar"'));
for(const id of ['dgTradingSessionClock','dgTradingSessionState','dgTradingSessionName',
  'dgTradingSessionCountdown','dgTradingSessionCounterLabel','dgTradingSessionLocalTime',
  'dgTradingSessionPillasia','dgTradingSessionPilllondon','dgTradingSessionPillny',
  'dgTradingSessionSub']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Unique '+id);
}
for(const file of ['trading-session-clock.js?v=1','trading-session-clock.css?v=1']){
 assert.ok(html.includes(file),'index '+file);assert.ok(sw.includes(file),'offline '+file);
}
assert.ok(html.indexOf('dg-unified-premium.css?v=1')<
 html.indexOf('trading-session-clock.css?v=1'),'Session theme safely loads last');
assert.ok(css.includes('body[data-dgos-route="trading"]'),'Only trading route styled');
assert.ok(css.includes('@media(max-width:700px)'),'iPhone responsive');
assert.ok(css.includes('tabular-nums'),'Countdown does not jump horizontally');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
const c=clock.windowsAt(new Date('2026-10-20T13:55:00Z'));
let dom={};
for(const id of ['dgTradingSessionClock','dgTradingSessionName','dgTradingSessionState',
 'dgTradingSessionCountdown','dgTradingSessionCounterLabel','dgTradingSessionLocalTime',
 'dgTradingSessionSub','dgTradingSessionPillasia','dgTradingSessionPilllondon',
 'dgTradingSessionPillny']){
  dom[id]={dataset:{},textContent:'',setAttribute(k,v){this[k]=v},
    querySelector:()=>({textContent:''})};
}
const doc={getElementById:id=>dom[id]};
clock.paint(doc,new Date('2026-10-20T13:55:00Z'));
assert.equal(dom.dgTradingSessionName.textContent,'LONDON + NEW YORK');
assert.equal(dom.dgTradingSessionCountdown.textContent,'02:05:00');
assert.equal(dom.dgTradingSessionCounterLabel.textContent,'ÜBERLAPPUNG ENDET IN');
assert.equal(dom.dgTradingSessionPilllondon.dataset.active,'true');
assert.equal(dom.dgTradingSessionPillny.dataset.active,'true');
assert.equal(dom.dgTradingSessionPillasia.dataset.active,'false');
clock.paint(doc,new Date('2026-10-20T12:55:00Z'));
assert.equal(dom.dgTradingSessionName.textContent,'LONDON');
assert.equal(dom.dgTradingSessionCounterLabel.textContent,'OVERLAP IN');
assert.equal(dom.dgTradingSessionCountdown.textContent,'00:05:00');
console.log('PASS: UTC session clock, NY/London overlap, Zurich DST, weekends, responsive iPhone UI, and real countdown');
