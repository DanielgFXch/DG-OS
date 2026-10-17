'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('./htfZoneBriefing.js');

test('London and New York slots use Europe/Zurich and deduplicate',()=>{
  const london=new Date('2026-10-16T06:51:00Z'); // 08:51 CEST
  const slot=Z.nextBriefing(london,[]);
  assert.equal(slot.id,'london');
  assert.equal(Z.nextBriefing(london,[slot.key]),null);
  assert.equal(Z.nextBriefing(new Date('2026-10-16T11:50:00Z'),[]).id,'new-york');
  assert.equal(Z.nextBriefing(new Date('2026-12-16T07:50:00Z'),[]).id,'london'); // 08:50 CET
  assert.equal(Z.nextBriefing(new Date('2026-10-17T06:50:00Z'),[]),null); // Saturday
});
test('No late catch-up, custom times are supported',()=>{
  assert.equal(Z.nextBriefing(new Date('2026-10-16T08:00:00Z'),[]),null); // 10:00 CEST
  assert.equal(Z.nextBriefing(new Date('2026-10-16T07:05:00Z'),[],{londonTime:'09:05'}).id,'london');
  assert.throws(()=>Z.nextBriefing(new Date('2026-10-16T06:51:00Z'),[],{londonTime:'25:70'}));
});
test('Only fresh valid, high/medium DG HTF FVG and OB ranges are used',()=>{
  const report={freshBullishPOIs:[
    {type:'fvg',timeframe:'H1',range:'4100.25–4110.75',status:'fresh',quality:'high',score:8,reasons:['✓ Frisch','✗ Keine Struktur']},
    {type:'orderBlock',timeframe:'4H',range:'4105.00–4118.00',status:'fresh',quality:'medium',score:6,reasons:[]},
    {type:'fvg',timeframe:'15M',range:'4050.00–4070.00',status:'fresh',quality:'high'},
    {type:'fvg',timeframe:'Daily',range:'4150.00–4140.00',status:'fresh',quality:'high'},
    {type:'fvg',timeframe:'Daily',range:'4120.00–4130.00',status:'mitigated',quality:'high'},
    {type:'fvg',timeframe:'Daily',range:'4050.00–4060.00',status:'fresh',quality:'low'}
  ],freshBearishPOIs:[]};
  const zones=Z.collectZones(report,'buy');
  assert.equal(zones.length,2);
  assert.equal(zones[0].rangeData.text,'4100.25 – 4110.75');
  assert.ok(zones[0].overlappingTFs.includes('4H'));
  const message=Z.buildHTFZoneBriefing({label:'LONDON'}, {report}, {now:new Date('2026-10-16T06:51:00Z'),price:4190.5});
  assert.match(message,/BUY ZONE: 4100.25 – 4110.75/);
  assert.match(message,/Kurs bei Analyse: 4190.50/);
  assert.match(message,/1H Bullish FVG/);
  assert.doesNotMatch(message,/15M/);
  assert.doesNotMatch(message,/4050.00/);
  assert.doesNotMatch(message,/Keine Struktur/);
});
test('Never synthesize zones or false prices',()=>{
  const msg=Z.buildHTFZoneBriefing({label:'NEW YORK'},
    {report:{freshBullishPOIs:[],freshBearishPOIs:[]}},
    {now:new Date('2026-10-16T11:50:00Z')});
  assert.match(msg,/Keine frischen HTF/);
  assert.match(msg,/nicht zuverlässig verfügbar/);
  assert.equal(Z.parseRange('—'),null);
  assert.equal(Z.parseRange('4200.10 – 4200.10'),null);
  assert.equal(Z.parseRange('4200.10 – NaN'),null);
});
test('Reject incomplete or stale HTF market data, do not require price for POIs',()=>{
  const now=new Date('2026-10-16T10:00:00Z');
  const m={quote:{price:4170.25},lastPriceUpdateAt:new Date('2026-10-16T09:59:00Z'),
    candlesByTimeframe:{},lastCandleUpdateAt:{},
    getHealth:()=>({htfReady:true})};
  for(const tf of ['weekly','daily','4h','1h']){
    m.candlesByTimeframe[tf]={series:[{}, {}, {}]};
    m.lastCandleUpdateAt[tf]=new Date('2026-10-16T09:00:00Z');
  }
  assert.equal(Z.isHTFDataReady(m,now),true);
  assert.equal(Z.freshPrice(m,now),4170.25);
  m.lastCandleUpdateAt['1h']=new Date('2026-10-16T05:00:00Z');
  assert.equal(Z.isHTFDataReady(m,now),false);
  m.lastCandleUpdateAt['1h']=new Date('2026-10-16T09:00:00Z');
  m.lastPriceUpdateAt=new Date('2026-10-16T09:00:00Z');
  assert.equal(Z.freshPrice(m,now),null);
});
