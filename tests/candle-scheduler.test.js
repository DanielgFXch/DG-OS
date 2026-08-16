'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nextBoundaryUtc,
  nextBoundaryFromProviderOpen,
  parseProviderOpen
} = require('../server/lib/candleRefreshScheduler.js');

test('provider candle datetime is parsed as an explicit UTC open time', () => {
  assert.equal(parseProviderOpen('2026-08-16 21:00:00').toISOString(), '2026-08-16T21:00:00.000Z');
  assert.equal(parseProviderOpen('2026-08-16 21:00').toISOString(), '2026-08-16T21:00:00.000Z');
  assert.equal(parseProviderOpen('not-a-time'), null);
});

test('4h refresh follows the real provider grid instead of a 00/04 UTC assumption', () => {
  const now = new Date('2026-08-16T21:42:00Z');
  const next = nextBoundaryFromProviderOpen('4h', now, '2026-08-16 21:00:00');
  assert.equal(next.toISOString(), '2026-08-17T01:00:00.000Z');
  assert.notEqual(next.toISOString(), nextBoundaryUtc('4h', now).toISOString());
});

test('provider grid advances deterministically when the latest open is historical', () => {
  const now = new Date('2026-08-17T10:12:00Z');
  const next = nextBoundaryFromProviderOpen('4h', now, '2026-08-16 21:00:00');
  assert.equal(next.toISOString(), '2026-08-17T13:00:00.000Z');
});

test('daily and missing-provider cases retain the established UTC fallback', () => {
  const now = new Date('2026-08-16T21:42:00Z');
  assert.equal(
    nextBoundaryFromProviderOpen('daily', now, '2026-08-17').toISOString(),
    nextBoundaryUtc('daily', now).toISOString()
  );
  assert.equal(
    nextBoundaryFromProviderOpen('4h', now, null).toISOString(),
    nextBoundaryUtc('4h', now).toISOString()
  );
});
