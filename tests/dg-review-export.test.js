'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const review=require('../scripts/exportDgReview.js');

test('review export requires one real source and supports explicit output',()=>{
  assert.throws(()=>review.parseArgs([]),/exactly one/);
  assert.deepEqual(review.parseArgs(['--snapshot','market.json','--output','review.md']),{server:null,snapshot:'market.json',output:'review.md'});
});

test('review pack is bounded and contains manual Daniel fields',()=>{
  const pois=Array.from({length:8},(_,index)=>({id:`p${index}`,type:'fvg',timeframe:'4H',direction:'bullish',range:{low:100,high:101},formedAt:'2026-08-17T08:00:00Z',tested:index%2===0,mitigationPercent:25,mitigationState:'PARTIALLY_MITIGATED',reaction:false,quality:'high',score:6,maxScore:8}));
  const report={generatedAt:'2026-08-17T10:00:00Z',source:'snapshot:test',symbol:'XAUUSD',price:102,relevantPois:{Daily:[], '4H':pois,H1:[]},keyLiquidity:[],confirmations:[],decision:{stage:'WATCH',direction:'BUY',internalStatus:'BUY_CONFIRMATION'}};
  const text=review.buildReviewPack(report);
  assert.match(text,/Review only.*not applied automatically/);
  assert.match(text,/DANIEL REVIEW:/);
  assert.match(text,/Relevant\? \[ \]/);
  assert.equal((text.match(/^## CASE/gm)||[]).length,6);
  assert.doesNotMatch(text,/CASE 7/);
});

test('empty real scan is labelled instead of inventing a case',()=>{
  const report={generatedAt:'x',source:'snapshot:test',symbol:'XAUUSD',price:1,relevantPois:{Daily:[],'4H':[],H1:[]},keyLiquidity:[],confirmations:[],decision:{stage:'WAIT',direction:null,internalStatus:'WAIT'}};
  assert.match(review.buildReviewPack(report),/REAL_CASE_NOT_AVAILABLE/);
});
