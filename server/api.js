'use strict';

const http = require('http');
const { URL } = require('url');
const MB = require('../marketBrain.js');
const { handleTelegramUpdate } = require('./lib/telegramAssistant.js');
const { serveStatic } = require('./lib/staticApp.js');

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(json);
}

function sendPrivateJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (_) { throw new Error('invalid_json'); }
}

function gmailErrorStatus(err) {
  const code = err && err.message;
  if (['invalid_json', 'unknown_account', 'invalid_recipient', 'invalid_subject', 'no_messages_selected'].includes(code)) return 400;
  if (code === 'account_not_connected') return 409;
  if (code === 'gmail_not_configured') return 503;
  if (String(code || '').startsWith('gmail_api_failed_') || code === 'oauth_refresh_failed') return 502;
  return 500;
}

function gmailPublicError(err) {
  const code = err && err.message;
  if (code === 'account_not_connected') return 'account_not_connected';
  if (code === 'gmail_not_configured') return 'gmail_not_configured';
  if (['invalid_json', 'unknown_account', 'invalid_recipient', 'invalid_subject', 'no_messages_selected'].includes(code)) return code;
  return 'gmail_request_failed';
}

function requireMailSession(req, res, gmail) {
  if (!gmail || !gmail.configured) {
    sendPrivateJson(res, 503, { error: 'gmail_not_configured' });
    return false;
  }
  if (!gmail.isAuthorized(req)) {
    sendPrivateJson(res, 401, { error: 'mail_session_required' });
    return false;
  }
  return true;
}

function createApiServer(marketState, telegram, gmail, calendar) {
  telegram = telegram || {};

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      if (url.pathname.startsWith('/api/gmail/') || url.pathname.startsWith('/api/calendar/') || url.pathname === '/api/hub/status') {
        sendPrivateJson(res, 403, { error: 'same_origin_required' });
      } else {
        sendJson(res, 204, {});
      }
      return;
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, marketState.getHealth());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/market/XAUUSD') {
        sendJson(res, 200, marketState.getPublicMarketState());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/brain/XAUUSD') {
        sendJson(res, 200, marketState.getTradingBrain());
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/events/XAUUSD') {
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 50)) : 50;
        sendJson(res, 200, { events: marketState.getRecentEvents(limit) });
        return;
      }

      // Unified Jarvis Hub status — same-origin only. No message contents,
      // calendar event data or secrets are exposed here.
      if (req.method === 'GET' && url.pathname === '/api/hub/status') {
        const google = gmail ? gmail.status(req) : { configured: false, authenticated: false, accounts: [] };
        sendPrivateJson(res, 200, {
          hub: 'DG OS',
          server: true,
          googleWorkspace: google,
          services: {
            weather: { connected: true, provider: 'Open-Meteo', mode: 'client' },
            telegram: { connected: Boolean(telegram.token && telegram.chatId), mode: 'server' },
            whoop: { connected: false, mode: 'not_configured' },
            icloudCalendar: { connected: false, mode: 'not_configured' }
          }
        });
        return;
      }

      // Gmail status is intentionally same-origin and never gets wildcard CORS.
      if (req.method === 'GET' && url.pathname === '/api/gmail/status') {
        if (!gmail) { sendPrivateJson(res, 200, { configured: false, authenticated: false, accounts: [] }); return; }
        sendPrivateJson(res, 200, gmail.status(req));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/gmail/oauth/start') {
        if (!gmail || !gmail.configured) { sendPrivateJson(res, 503, { error: 'gmail_not_configured' }); return; }
        try {
          const destination = gmail.authorizationUrl(url.searchParams.get('account'));
          res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
          res.end();
        } catch (err) {
          sendPrivateJson(res, gmailErrorStatus(err), { error: gmailPublicError(err) });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/gmail/oauth/callback') {
        if (!gmail || !gmail.configured) { sendPrivateJson(res, 503, { error: 'gmail_not_configured' }); return; }
        const googleError = url.searchParams.get('error');
        if (googleError) {
          res.writeHead(302, { Location: gmail.appUrl + '/?gmail=error#personalEmail', 'Cache-Control': 'no-store' });
          res.end();
          return;
        }
        try {
          const account = await gmail.handleOAuthCallback(url.searchParams.get('code'), url.searchParams.get('state'));
          res.writeHead(302, {
            Location: gmail.appUrl + '/?gmail=connected&account=' + encodeURIComponent(account.id) + '#personalEmail',
            'Set-Cookie': gmail.sessionCookie(),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer'
          });
          res.end();
        } catch (err) {
          console.error('[server] Gmail OAuth callback failed:', err.message);
          res.writeHead(302, { Location: gmail.appUrl + '/?gmail=error#personalEmail', 'Cache-Control': 'no-store' });
          res.end();
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/gmail/logout') {
        if (!gmail) { sendPrivateJson(res, 200, { ok: true }); return; }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': gmail.clearSessionCookie(),
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/gmail/messages') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          const data = await gmail.listMessages(url.searchParams.get('account'), {
            filter: url.searchParams.get('filter'),
            query: url.searchParams.get('q'),
            pageToken: url.searchParams.get('pageToken')
          });
          sendPrivateJson(res, 200, data);
        } catch (err) {
          sendPrivateJson(res, gmailErrorStatus(err), { error: gmailPublicError(err) });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/gmail/message/')) {
        if (!requireMailSession(req, res, gmail)) return;
        const id = decodeURIComponent(url.pathname.slice('/api/gmail/message/'.length));
        try {
          sendPrivateJson(res, 200, await gmail.getMessage(url.searchParams.get('account'), id));
        } catch (err) {
          sendPrivateJson(res, gmailErrorStatus(err), { error: gmailPublicError(err) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/gmail/trash') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          const body = await readJson(req);
          sendPrivateJson(res, 200, await gmail.trashMessages(body.account, body.messageIds));
        } catch (err) {
          sendPrivateJson(res, gmailErrorStatus(err), { error: gmailPublicError(err) });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/gmail/send') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          const body = await readJson(req);
          sendPrivateJson(res, 200, await gmail.sendMessage(body.account, body));
        } catch (err) {
          sendPrivateJson(res, gmailErrorStatus(err), { error: gmailPublicError(err) });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/calendar/calendars') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          sendPrivateJson(res, 200, { calendars: await calendar.listCalendars(url.searchParams.get('account')) });
        } catch (err) {
          const code = err && err.message;
          const status = code === 'calendar_scope_required' ? 409 : code === 'account_not_connected' ? 409 : 502;
          sendPrivateJson(res, status, { error: code === 'calendar_scope_required' ? 'google_reconnect_required' : 'calendar_request_failed' });
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/calendar/events') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          const calendarIds = url.searchParams.getAll('calendarId');
          sendPrivateJson(res, 200, await calendar.listEvents(url.searchParams.get('account'), {
            timeMin: url.searchParams.get('timeMin'),
            timeMax: url.searchParams.get('timeMax'),
            calendarIds
          }));
        } catch (err) {
          const code = err && err.message;
          const status = ['invalid_calendar_range','unknown_account'].includes(code) ? 400 : ['calendar_scope_required','account_not_connected'].includes(code) ? 409 : 502;
          sendPrivateJson(res, status, { error: code === 'calendar_scope_required' ? 'google_reconnect_required' : code === 'invalid_calendar_range' ? code : 'calendar_request_failed' });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/calendar/events') {
        if (!requireMailSession(req, res, gmail)) return;
        try {
          const body = await readJson(req);
          sendPrivateJson(res, 200, await calendar.createEvent(body.account, body));
        } catch (err) {
          const code = err && err.message;
          const status = ['invalid_calendar_event','unknown_account'].includes(code) ? 400 : ['calendar_scope_required','account_not_connected'].includes(code) ? 409 : 502;
          sendPrivateJson(res, status, { error: code === 'calendar_scope_required' ? 'google_reconnect_required' : code === 'invalid_calendar_event' ? code : 'calendar_request_failed' });
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/tradingview/webhook') {
        await readBody(req);
        sendJson(res, 501, {
          error: 'not_implemented',
          message: 'TradingView webhook receiver is planned, not built — see docs/TRADINGVIEW_INTEGRATION_PLAN.md.'
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/telegram/webhook') {
        const raw = await readBody(req);
        if (telegram.webhookSecret) {
          const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
          if (secretHeader !== telegram.webhookSecret) { sendJson(res, 401, { error: 'unauthorized' }); return; }
        }
        let update = null;
        try { update = JSON.parse(raw); } catch (_) { /* malformed body: acknowledge without retry storm */ }
        if (update) {
          handleTelegramUpdate(update, {
            MB,
            getBrain: () => marketState.getTradingBrain(),
            token: telegram.token,
            allowedChatId: telegram.chatId
          }).catch(err => console.error('[server] Telegram webhook handling failed:', err.message));
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (!url.pathname.startsWith('/api/') && serveStatic(req, res)) return;
      if (url.pathname.startsWith('/api/gmail/') || url.pathname.startsWith('/api/calendar/') || url.pathname === '/api/hub/status') sendPrivateJson(res, 404, { error: 'not_found' });
      else sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      console.error('[server] request failed:', err.message);
      if (url.pathname.startsWith('/api/gmail/') || url.pathname.startsWith('/api/calendar/') || url.pathname === '/api/hub/status') sendPrivateJson(res, 500, { error: 'internal_error' });
      else sendJson(res, 500, { error: 'internal_error' });
    }
  });
}

module.exports = { createApiServer };
