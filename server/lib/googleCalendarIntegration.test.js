'use strict';

const assert = require('assert');
const {
  GoogleCalendarIntegration,
  validIsoDateTime,
  validDate,
  validTime
} = require('./googleCalendarIntegration.js');

assert.strictEqual(validIsoDateTime('2026-09-21T08:00:00.000Z'), true);
assert.strictEqual(validIsoDateTime('not-a-date'), false);
assert.strictEqual(validDate('2026-09-21'), true);
assert.strictEqual(validDate('21.09.2026'), false);
assert.strictEqual(validTime('09:30'), true);
assert.strictEqual(validTime('25:00'), false);

const originalFetch = global.fetch;
const calls = [];
global.fetch = async (url, options) => {
  calls.push({ url: String(url), options: options || {} });
  const href = String(url);
  if (href.includes('/users/me/calendarList')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [
        { id: 'primary@example.com', summary: 'Primär', primary: true, accessRole: 'owner' },
        { id: 'hidden@example.com', summary: 'Hidden', hidden: true, accessRole: 'reader' }
      ] })
    };
  }
  if (href.includes('/events?') && (!options || options.method !== 'POST')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{
        id: 'evt-1',
        summary: 'Testtermin',
        start: { dateTime: '2026-09-21T09:00:00+02:00' },
        end: { dateTime: '2026-09-21T10:00:00+02:00' },
        status: 'confirmed'
      }] })
    };
  }
  if (href.endsWith('/events') && options && options.method === 'POST') {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'evt-created',
        summary: body.summary,
        start: body.start,
        end: body.end,
        htmlLink: 'https://calendar.google.com/'
      })
    };
  }
  throw new Error('Unexpected fetch: ' + href);
};

(async () => {
  try {
    const auth = {
      configured: true,
      accessToken: async (accountId) => {
        assert.ok(['business','private'].includes(accountId));
        return 'token-123';
      }
    };
    const calendar = new GoogleCalendarIntegration(auth);

    const calendars = await calendar.listCalendars('business');
    assert.strictEqual(calendars.length, 1);
    assert.strictEqual(calendars[0].primary, true);

    const result = await calendar.listEvents('business', {
      timeMin: '2026-09-20T00:00:00.000Z',
      timeMax: '2026-09-23T00:00:00.000Z'
    });
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].title, 'Testtermin');
    assert.strictEqual(result.events[0].account, 'business');

    const created = await calendar.createEvent('private', {
      title: 'Zahnarzt',
      date: '2026-09-24',
      start: '14:00',
      end: '15:00'
    });
    assert.strictEqual(created.id, 'evt-created');
    assert.strictEqual(created.account, 'private');

    assert.ok(calls.every(call => call.options.headers && call.options.headers.Authorization === 'Bearer token-123'));
    console.log('Google Calendar integration unit tests: OK');
  } finally {
    global.fetch = originalFetch;
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
