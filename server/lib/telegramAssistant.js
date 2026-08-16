'use strict';

// ---------------------------------------------------------------------------
// DG OS Chat — Telegram webhook handler (Daniel's explicit ask: "ich will
// mit diesem System reden können"). Daniel messages the bot ("Gomez, wie
// sieht der Markt aus?"), Telegram calls this server's webhook, and the
// reply is built exclusively by marketBrain.js's answerMarketQuestion()
// against the real, current DG Trading Brain V1 snapshot — no LLM call
// here, no fabricated market opinion, same honesty rule as every other V1
// surface. Push-alerts (events.js / app.js's pollAndSendEventAlerts) are a
// SEPARATE, existing mechanism — this module only ever answers an incoming
// question, it never originates a message on its own.
//
// Privacy: only ever replies to Daniel's OWN configured chat (TELEGRAM_
// CHAT_ID) — never a public bot that hands out real market data to
// whoever finds it on Telegram. A message from any other chat is silently
// ignored (still 200s the webhook so Telegram doesn't retry it forever).
// ---------------------------------------------------------------------------

const https = require('https');

function sendTelegramMessage(token, chatId, text) {
  return new Promise((resolve, reject) => {
    if (!token) { reject(new Error('no TELEGRAM_BOT_TOKEN configured')); return; }
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Handles one incoming Telegram update object (the raw parsed webhook
// body). `deps.MB` is marketBrain.js (injected, not required here, so this
// stays testable without touching the real module cache). `deps.getBrain`
// is a function returning the current computeTradingBrainV1() output —
// injected rather than a MarketState instance directly, so this module
// never needs to know MarketState's shape.
async function handleTelegramUpdate(update, deps) {
  const { MB, getBrain, token, allowedChatId } = deps;
  const message = update && update.message;
  const text = message && message.text;
  const chatId = message && message.chat && message.chat.id != null ? String(message.chat.id) : null;

  if (!text || !chatId) return { handled: false, reason: 'no_text_message' };
  // Fail CLOSED, not open: an unconfigured allowlist must never mean "reply
  // to anyone" — real market data only ever goes to Daniel's own chat.
  if (!allowedChatId || chatId !== String(allowedChatId)) {
    return { handled: false, reason: allowedChatId ? 'chat_not_allowed' : 'chat_allowlist_not_configured' };
  }

  const brain = getBrain ? getBrain() : null;
  const reply = MB.answerMarketQuestion(text, brain, new Date());

  if (token) {
    try {
      await sendTelegramMessage(token, chatId, reply);
    } catch (err) {
      return { handled: true, reply, sendError: err.message };
    }
  }
  return { handled: true, reply };
}

module.exports = { sendTelegramMessage, handleTelegramUpdate };
