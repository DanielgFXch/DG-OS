'use strict';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const ZONE = 'Europe/Zurich';

function assertAccountId(accountId) {
  if (!['business', 'private'].includes(accountId)) throw new Error('unknown_account');
}

function validIsoDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

class GoogleCalendarIntegration {
  constructor(googleAuth) {
    this.googleAuth = googleAuth;
  }

  get configured() {
    return Boolean(this.googleAuth && this.googleAuth.configured);
  }

  async _fetch(accountId, resource, options, retried) {
    assertAccountId(accountId);
    if (!this.googleAuth || !this.googleAuth.configured) throw new Error('google_not_configured');
    const token = await this.googleAuth.accessToken(accountId, Boolean(retried));
    const request = Object.assign({}, options || {});
    request.headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + token });
    const response = await fetch(CALENDAR_API + resource, request);
    if (response.status === 401 && !retried) return this._fetch(accountId, resource, options, true);
    if (response.status === 403) throw new Error('calendar_scope_required');
    if (!response.ok) throw new Error('calendar_api_failed_' + response.status);
    if (response.status === 204) return {};
    return response.json();
  }

  async listCalendars(accountId) {
    const data = await this._fetch(accountId, '/users/me/calendarList?maxResults=100');
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter(item => item && item.id && item.hidden !== true)
      .map(item => ({
        id: item.id,
        summary: item.summary || item.id,
        primary: Boolean(item.primary),
        accessRole: item.accessRole || null,
        backgroundColor: item.backgroundColor || null
      }));
  }

  async listEvents(accountId, options) {
    options = options || {};
    if (!validIsoDateTime(options.timeMin) || !validIsoDateTime(options.timeMax)) throw new Error('invalid_calendar_range');
    if (Date.parse(options.timeMax) <= Date.parse(options.timeMin)) throw new Error('invalid_calendar_range');

    const calendars = await this.listCalendars(accountId);
    const selectedIds = Array.isArray(options.calendarIds) && options.calendarIds.length
      ? new Set(options.calendarIds.map(String))
      : null;
    const active = calendars
      .filter(cal => !selectedIds || selectedIds.has(cal.id))
      .slice(0, 20);

    const results = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, active.length) }, async () => {
      while (cursor < active.length) {
        const index = cursor++;
        const cal = active[index];
        const params = new URLSearchParams({
          timeMin: options.timeMin,
          timeMax: options.timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250'
        });
        const data = await this._fetch(accountId, '/calendars/' + encodeURIComponent(cal.id) + '/events?' + params.toString());
        for (const item of Array.isArray(data.items) ? data.items : []) {
          if (!item || item.status === 'cancelled') continue;
          results.push({
            id: item.id,
            calendarId: cal.id,
            calendarName: cal.summary,
            title: item.summary || '(Ohne Titel)',
            description: item.description || '',
            location: item.location || '',
            start: item.start || {},
            end: item.end || {},
            htmlLink: item.htmlLink || '',
            account: accountId,
            source: 'google'
          });
        }
      }
    });
    await Promise.all(workers);

    results.sort((a, b) => {
      const av = a.start.dateTime || a.start.date || '';
      const bv = b.start.dateTime || b.start.date || '';
      return av.localeCompare(bv);
    });
    return { calendars, events: results };
  }

  async createEvent(accountId, input) {
    assertAccountId(accountId);
    input = input || {};
    const title = String(input.title || '').trim().slice(0, 180);
    const date = String(input.date || '');
    const start = String(input.start || '');
    const end = String(input.end || '');
    const calendarId = String(input.calendarId || 'primary');
    if (!title || !validDate(date) || !validTime(start) || !validTime(end) || end <= start) {
      throw new Error('invalid_calendar_event');
    }

    const payload = {
      summary: title,
      description: String(input.description || '').slice(0, 4000),
      location: String(input.location || '').slice(0, 500),
      start: { dateTime: date + 'T' + start + ':00', timeZone: ZONE },
      end: { dateTime: date + 'T' + end + ':00', timeZone: ZONE }
    };

    const created = await this._fetch(accountId, '/calendars/' + encodeURIComponent(calendarId) + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return {
      id: created.id,
      calendarId,
      title: created.summary || title,
      start: created.start || payload.start,
      end: created.end || payload.end,
      htmlLink: created.htmlLink || '',
      account: accountId,
      source: 'google'
    };
  }
}

module.exports = { GoogleCalendarIntegration, ZONE, validIsoDateTime, validDate, validTime };
