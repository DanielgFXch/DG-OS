'use strict';

// ---------------------------------------------------------------------------
// HTTP API — Phase A endpoints, using Node's built-in `http` module. No
// Express, no dependency added — "möglichst kleinen Node.js Always-On
// Market Service", and the project has stayed dependency-free everywhere
// else (see package.json).
//
// Read-only, public market data — no authentication, no user data, no
// secrets ever appear in any response (see marketState.js's getHealth()/
// getPublicMarketState(), which never include apiKey). CORS is
// permissive (Access-Control-Allow-Origin: *) because the intended caller
// is the static GitHub Pages frontend on a different origin, and the data
// served is not sensitive.
// ---------------------------------------------------------------------------

const http = require('http');
const { URL } = require('url');
const MB = require('../marketBrain.js');
const { handleTelegramUpdate } = require('./lib/telegramAssistant.js');

function sendJson(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
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

// `telegram` (optional) — { token, chatId, webhookSecret } read from
// process.env by server/index.js. Undefined/absent in local dev or before
// Daniel configures the Railway env vars — the webhook route still exists
// and responds, it just can't actually send a reply without a token (see
// telegramAssistant.js's sendTelegramMessage), same "honestly degraded, not
// silently broken" pattern as every other optional integration here.
function createApiServer(marketState, telegram) {
  telegram = telegram || {};
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

    const url = new URL(req.url, 'http://localhost');

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

      // Phase G — architecturally present, not functionally implemented.
      // See docs/TRADINGVIEW_INTEGRATION_PLAN.md: no secret validation, no
      // schema validation, no event-store write happens here yet. Reading
      // the body (readBody) only so the connection is drained cleanly, not
      // because it's used for anything.
      if (req.method === 'POST' && url.pathname === '/api/tradingview/webhook') {
        await readBody(req);
        sendJson(res, 501, {
          error: 'not_implemented',
          message: 'TradingView webhook receiver is planned, not built — see docs/TRADINGVIEW_INTEGRATION_PLAN.md.'
        });
        return;
      }

      // DG OS Chat (Telegram webhook) — see server/lib/telegramAssistant.js.
      // Always responds 200 (Telegram retries aggressively on non-2xx,
      // which would just resend the same message repeatedly) — a
      // malformed body or a send failure is logged, never surfaced as an
      // HTTP error to Telegram itself.
      if (req.method === 'POST' && url.pathname === '/api/telegram/webhook') {
        const raw = await readBody(req);
        if (telegram.webhookSecret) {
          const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
          if (secretHeader !== telegram.webhookSecret) { sendJson(res, 401, { error: 'unauthorized' }); return; }
        }
        let update = null;
        try { update = JSON.parse(raw); } catch (err) { /* ignore malformed body */ }
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

      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      sendJson(res, 500, { error: 'internal_error' }); // never leak err.message — could echo request internals
    }
  });
}

module.exports = { createApiServer };
