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

const PORT = parseInt(process.env.PORT, 10) || 8080;
const QUOTE_REFRESH_MS = 15 * 60 * 1000; // modest — previousClose/isMarketOpen don't need WS-level freshness

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
  for (const def of TIMEFRAME_DEFS) {
    try {
      await marketState.refreshTimeframe(def.id);
      console.log(`[server] loaded ${def.id} (${def.tdInterval}, ${def.outputsize} candles, ~${def.historicalReach})`);
    } catch (err) {
      console.error(`[server] initial fetch failed for ${def.id}:`, err.message);
    }
    await sleep(300); // stay well under TwelveData's free-tier rate limit during the initial burst
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

  const apiServer = createApiServer(marketState);
  apiServer.listen(PORT, () => {
    console.log(`[server] API listening on :${PORT} — GET /api/health, /api/market/XAUUSD, /api/events/XAUUSD`);
  });

  function shutdown() {
    console.log('[server] shutting down...');
    socket.disconnect();
    stopFns.forEach(stop => stop());
    clearInterval(quoteInterval);
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
