#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// DG OS Always-On Market Server — entry point.
//
// Wires together: TwelveData REST (candle history, Phase B) + TwelveData
// WebSocket (live price, Phase C) + MarketState (the existing marketBrain.js
// / events.js engine, reused as-is — Phase F) + the HTTP API (Phase A) +
// the candle-close-aligned refresh scheduler (Phase E).
//
// Run locally:  TWELVEDATA_API_KEY=... node server/index.js
// Not deployed anywhere yet — see docs/ALWAYS_ON_HOSTING.md (Phase H: a
// comparison and a recommendation, no hosting booked, no account created).
//
// The API key is read once from process.env here and passed down by
// reference — never logged, never written to disk, never included in any
// HTTP response (see api.js/marketState.js).
// ---------------------------------------------------------------------------

const { MarketState } = require('./marketState.js');
const { createApiServer } = require('./api.js');
const { TwelveDataSocket } = require('./lib/twelveDataSocket.js');
const { scheduleTimeframeRefresh } = require('./lib/candleRefreshScheduler.js');
const { TIMEFRAME_DEFS } = require('./lib/timeframes.js');
const { sendTelegramMessage } = require('./lib/telegramAssistant.js');
const scheduledBriefingStore = require('./lib/scheduledBriefingStore.js');
const MB = require('../marketBrain.js');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const QUOTE_REFRESH_MS = 15 * 60 * 1000; // modest — previousClose/isMarketOpen don't need WS-level freshness

// Initial-burst spacing + one bounded retry pass. Root cause (see
// docs/ALWAYS_ON_SERVER.md's "Initial fetch reliability" section): firing 8
// REST requests (1 quote + 7 candle calls) within ~2.4s at the old 300ms
// stagger could trip TwelveData's free-tier rate limit, most likely to hit
// the FIRST calls in the loop — exactly the HTF-priority timeframes
// (monthly/weekly/daily/4h) DG OS cares about most. A failed initial fetch
// previously had no retry: the timeframe's key in candlesByTimeframe simply
// never got created, and the only thing that could ever fill it was that
// timeframe's own next candle-close (up to ~30 days away for monthly).
// Test-only overrides (same pattern as TWELVEDATA_REST_BASE_URL/TWELVEDATA_WS_URL
// below) — undefined in real use, lets local tests run in seconds instead of
// ~25s without changing production timing.
const INITIAL_FETCH_STAGGER_MS = parseInt(process.env.DGOS_INITIAL_FETCH_STAGGER_MS, 10) || 1500;
const RETRY_DELAY_MS = parseInt(process.env.DGOS_RETRY_DELAY_MS, 10) || 10000;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Runs refreshTimeframe() for exactly the given defs, staggered, and
// returns the ids that failed. Used for both the initial pass and the one
// retry pass below — same logic, no duplication.
async function fetchTimeframes(marketState, defs) {
  const failed = [];
  for (const def of defs) {
    try {
      await marketState.refreshTimeframe(def.id);
      console.log(`[server] loaded ${def.id} (${def.tdInterval}, ${def.outputsize} candles, ~${def.historicalReach})`);
    } catch (err) {
      console.error(`[server] initial fetch failed for ${def.id}:`, err.message);
      failed.push(def);
    }
    await sleep(INITIAL_FETCH_STAGGER_MS);
  }
  return failed;
}

async function main() {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    console.error('[server] TWELVEDATA_API_KEY is not set. Set it as an environment variable — never hardcode or commit it.');
    process.exit(1);
  }

  const restBaseUrl = process.env.TWELVEDATA_REST_BASE_URL; // test-only override, undefined in real use
  const wsUrl = process.env.TWELVEDATA_WS_URL; // test-only override, undefined in real use

  const marketState = new MarketState({ apiKey, restBaseUrl });

  console.log('[server] starting — initial REST fetch for all timeframes...');
  await marketState.refreshQuote().catch(err => console.error('[server] initial quote fetch failed:', err.message));

  const failedFirstPass = await fetchTimeframes(marketState, TIMEFRAME_DEFS);

  // Exactly one retry pass, only for timeframes still missing — never for
  // ones that already succeeded, never more than once (no infinite loop).
  if (failedFirstPass.length) {
    console.log(`[server] ${failedFirstPass.length} timeframe(s) missing after initial pass (${failedFirstPass.map(d => d.id).join(', ')}) — retrying once after ${RETRY_DELAY_MS / 1000}s...`);
    await sleep(RETRY_DELAY_MS);
    const failedRetry = await fetchTimeframes(marketState, failedFirstPass);
    if (failedRetry.length) {
      console.error(`[server] still missing after retry: ${failedRetry.map(d => d.id).join(', ')} — will only recover at their own next candle close.`);
    } else {
      console.log('[server] retry pass recovered all previously missing timeframes.');
    }
  }

  await marketState.refreshSessions();

  const socket = new TwelveDataSocket({
    apiKey,
    wsUrl,
    onPrice: ({ price, at }) => marketState.applyPriceTick(price, at),
    onStatusChange: (status) => {
      marketState.setWebsocketStatus(status);
      console.log(`[server] websocket status: ${status}`);
    }
  });
  socket.connect();

  const stopFns = TIMEFRAME_DEFS.map(def => scheduleTimeframeRefresh(
    def.id,
    async (id) => {
      await marketState.refreshTimeframe(id);
      if (id === 'daily' || id === '1h') await marketState.refreshSessions();
      console.log(`[server] refreshed ${id} candles (candle close)`);
    },
    (id, err) => console.error(`[server] refresh failed for ${id}:`, err.message)
  ));

  const quoteInterval = setInterval(() => {
    marketState.refreshQuote().catch(err => console.error('[server] quote refresh failed:', err.message));
  }, QUOTE_REFRESH_MS);

  // DG OS Chat (Telegram) — optional, same "configure once it's available"
  // pattern as TWELVEDATA_API_KEY. Undefined until Daniel adds these as
  // Railway env vars (separate from the GitHub Actions secrets of the same
  // name used by .github/workflows/telegram-heartbeat.yml) — the webhook
  // route still responds, it just can't send a reply without a token yet.
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const apiServer = createApiServer(marketState, {
    token: telegramToken,
    chatId: telegramChatId,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET
  });
  apiServer.listen(PORT, () => {
    console.log(`[server] API listening on :${PORT} — GET /api/health, /api/market/XAUUSD, /api/events/XAUUSD, /api/brain/XAUUSD, POST /api/telegram/webhook`);
  });

  // Proactive morning briefing — "ich will einfach immer up to date
  // werden", not only when Daniel asks. Off by default (honest opt-in): only
  // active once TELEGRAM_MORNING_BRIEFING_TIME (e.g. "07:00", Europe/Zurich)
  // is set alongside a token+chatId. A 60s check is coarse enough to never
  // matter for a once-a-day send, and cheap enough to just always run.
  const morningBriefingTime = process.env.TELEGRAM_MORNING_BRIEFING_TIME;
  const scheduledBriefingInterval = setInterval(() => {
    if (!morningBriefingTime || !telegramToken || !telegramChatId) return;
    const lastSentDate = scheduledBriefingStore.readLastBriefingSentDate();
    if (!MB.shouldSendScheduledBriefing(new Date(), lastSentDate, morningBriefingTime)) return;
    const brain = marketState.getTradingBrain();
    if (!brain || !brain.decision || !brain.report) return; // not ready yet — retries next tick, doesn't mark as sent
    const text = MB.generateDGBriefing(brain, new Date());
    sendTelegramMessage(telegramToken, telegramChatId, text)
      .then(() => {
        scheduledBriefingStore.writeLastBriefingSentDate(MB.zurichDateString(new Date()));
        console.log('[server] sent scheduled morning briefing');
      })
      .catch(err => console.error('[server] scheduled morning briefing send failed:', err.message));
  }, 60 * 1000);

  function shutdown() {
    console.log('[server] shutting down...');
    socket.disconnect();
    stopFns.forEach(stop => stop());
    clearInterval(quoteInterval);
    clearInterval(scheduledBriefingInterval);
    apiServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[server] fatal startup error:', err.message);
  process.exit(1);
});
