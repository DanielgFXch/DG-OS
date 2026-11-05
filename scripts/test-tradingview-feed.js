'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const client = read('tradingview-feed.js');
const edge = read('supabase/functions/dgos-tradingview-feed/index.ts');
const html = read('index.html');
const sw = read('sw.js');
const command = read('trading-command.js');

// Static security and non-trading assertions.
new vm.Script(client, { filename: 'tradingview-feed.js' });
assert.ok(edge.includes('dgos_device_sessions') && edge.includes('dgos_telegram_config'));
assert.ok(edge.includes('.eq("token_hash", hash)') && edge.includes('.gt("expires_at"'));
assert.ok(edge.includes('authorizedOwner(req)') && edge.includes('device_pairing_required'));
assert.ok(edge.includes('"cache-control": "no-store"'));
assert.ok(edge.includes('"access-control-allow-origin": ORIGIN'));
assert.ok(edge.includes('.eq("origin", "tradingview")'));
assert.ok(edge.includes('.eq("symbol", "XAUUSD")'));
assert.ok(edge.includes('"INDICATOR_REPORTED"'));
assert.ok(!edge.includes('insert(') && !edge.includes('placeOrder'));
assert.ok(!client.includes('innerHTML') && !client.includes('insertAdjacentHTML'));
assert.ok(!client.includes('BUY_READY') && !client.includes('SELL_READY'));
assert.ok(command.includes("ZEITVERZÖGERT") && command.includes("HISTORISCH"));
assert.ok(command.includes("periodicBrainSnapshot"));
for (const id of ['dgTradingViewFeed','dgTradingViewFeedStatus','dgTradingViewFeedTitle',
 'dgTradingViewFeedList','dgTradingViewFeedRefresh']) {
 assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
}
for (const asset of ['tradingview-feed.css?v=1','tradingview-feed.js?v=1']) {
 assert.ok(html.includes(asset) && sw.includes('./' + asset));
}
assert.ok(html.indexOf('id="dgTradingViewFeed"') < html.indexOf('id="dgLondonRadar"'));
assert.ok(html.indexOf('src="./app.js') < html.indexOf('src="./trading-command.js'));
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/);

function fakeElement() {
 return {
   dataset: {}, children: [], textContent: '', className: '',
   replaceChildren() { this.children = []; },
   append(...nodes) { this.children.push(...nodes); },
   addEventListener() {}
 };
}
async function testBrowser(token, payload) {
 const nodes = new Map();
 for (const id of ['dgTradingViewFeed','dgTradingViewFeedList','dgTradingViewFeedStatus',
                     'dgTradingViewFeedRefresh']) nodes.set(id, fakeElement());
 let calls=0;
 const document = {
   hidden: false, body: { dataset: { dgosRoute: 'trading' } },
   getElementById(id) { return nodes.get(id) || null; },
   createElement() { return fakeElement(); },
   addEventListener() {}
 };
 const context = {
   document, window: { addEventListener() {}, dispatchEvent() {} },
   localStorage: { getItem() { return token; } },
   fetch: async () => {
     calls++;
     return { ok: true, status: 200, json: async () => payload };
   },
   AbortSignal: { timeout() { return {}; } },
   setInterval() {},
   Intl, Number, Date, Array, Object, String, Event: class {}
 };
 vm.createContext(context);
 new vm.Script(client).runInContext(context);
 await new Promise(resolve => setImmediate(resolve));
 await new Promise(resolve => setImmediate(resolve));
 return {nodes, calls};
}
(async () => {
 const payload = {
   source:'TradingView Webhook', evidenceStatus:'INDICATOR_REPORTED',
   events: [
     {symbol:'XAUUSD',eventType:'LONDON_LOW_SWEPT',price:4070.25,level:4072,
      timeframe:'5',eventAt:'2026-11-04T12:30:00Z',receivedAt:'2026-11-04T12:30:03Z',
      evidenceStatus:'INDICATOR_REPORTED'},
     {symbol:'XAUUSD',eventType:'BUY_READY',price:5000,timeframe:'1',
      eventAt:'2026-11-04T12:30:00Z',receivedAt:'2026-11-04T12:30:03Z',
      evidenceStatus:'INDICATOR_REPORTED'},
     {symbol:'XAUUSD',eventType:'NY_HIGH_TOUCHED',price:5000,timeframe:'1',
      eventAt:'2026-11-04T12:30:00Z',receivedAt:'2026-11-04T12:30:03Z',
      evidenceStatus:'UNVERIFIED'}
   ]
 };
 const a = await testBrowser('a'.repeat(48),payload);
 assert.equal(a.calls,1);
 assert.equal(a.nodes.get('dgTradingViewFeedList').children.length,1);
 const first = a.nodes.get('dgTradingViewFeedList').children[0];
 assert.equal(first.children[0].children[0].textContent,'London Low gemeldet: Sweep');
 assert.equal(first.children[0].children[1].textContent,'VON TRADINGVIEW GEMELDET');
 assert.equal(a.nodes.get('dgTradingViewFeedStatus').textContent,'1 GEMELDET');
 const b = await testBrowser('',payload);
 assert.equal(b.calls,0,'unpaired device must not fetch private data');
 assert.equal(b.nodes.get('dgTradingViewFeedStatus').textContent,'GERÄT NICHT GEKOPPELT');
 console.log('TradingView private feed: browser smoke, auth gates, no-signal guards PASS');
})().catch(err => { console.error(err); process.exitCode = 1; });
