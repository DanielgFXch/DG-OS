'use strict';
const assert = require('node:assert/strict');
const { readStrategy, getStrategyContext } = require('./jarvisStrategyMemory.js');

const s = readStrategy();
assert.equal(s.source, 'rules/strategy.md');
assert.match(s.sha256, /^[a-f0-9]{64}$/);
assert.equal(s.chapters.length, 17);
assert.deepEqual(s.chapters.map(x => x.number), Array.from({length:17},(_,i)=>i));
assert.ok(s.chapters.every(x => ['DEFINED','NOT_DEFINED'].includes(x.status)));
assert.ok(s.chapters[0].text.includes('DG Philosophy'));

const context = getStrategyContext([2,1,2,-1,99,NaN]);
assert.deepEqual(context.chapters.map(x => x.number), [2,1]);
assert.equal(context.sha256, s.sha256);
assert.match(context.note, /not implemented/);
assert.throws(() => { s.chapters.push('incorrect'); }, TypeError);
assert.throws(() => { s.chapters[0].title = 'tampered'; }, TypeError);
console.log('Jarvis strategy memory checks passed.');
