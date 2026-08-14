'use strict';

// ---------------------------------------------------------------------------
// MarketState — the Always-On Market Server's central state manager.
//
// This is deliberately NOT a second Market Brain. Every computation runs
// through the exact same marketBrain.js / events.js functions app.js and
// scripts/ingest.js already use — this module only orchestrates *when* to
// call them (on a REST refresh, on a WebSocket price tick) and where the
// result lives while the server is running.
//
// Two update paths, matching Phase B/C/F:
//   1. refreshTimeframe() — REST candle refresh for one timeframe. For the
//      timeframes that feed the existing brain shape (daily/weekly/monthly
//      latest bar, the 1h series, sessions), this recomputes the full
//      Market Brain and diffs it for events, exactly like
//      scripts/ingest.js does today.
//   2. applyPriceTick() — a WebSocket price update. Recomputes the full
//      Market Brain with the new live price (same computeAllDerivedModules
//      call, just fed a fresher price) — this is what closes the
//      "sweep-and-reversal invisible between fetches" gap identified in the
//      Market Data Reality Check: every tick re-evaluates Liquidity Engine
//      status, and a status transition (even one that reverses moments
//      later) gets diffed into a real event. Debounced (DIFF_DEBOUNCE_MS)
//      so a burst of ticks doesn't hammer the filesystem — the in-memory
//      state updates instantly regardless; only the diff+persist step is
//      throttled.
// ---------------------------------------------------------------------------

const MB = require('../marketBrain.js');
const { classifyMarketEvents } = require('../events.js');
const rest = require('./lib/twelveDataRest.js');
const store = require('./lib/marketStateStore.js');
const { TIMEFRAME_DEFS } = require('./lib/timeframes.js');

const DIFF_DEBOUNCE_MS = 5000;

// Which timeframe feeds which part of the existing (unchanged)
// computeAllDerivedModules() input contract. Everything else
// (4h/30min/15min, plus the full daily/weekly/monthly series) is raw data
// prepared for a *future* build to wire into per-timeframe detectors —
// Phase B is explicit: "Datenbasis vorbereiten. Noch KEINE neuen
// Tradingregeln erfinden." Not touched here.
const LIVE_DATA_TIMEFRAMES = new Set(['daily', 'weekly', 'monthly']);
const BRAIN_CANDLE_TIMEFRAME = '1h'; // the only series computeAllDerivedModules() actually consumes today

class MarketState {
  constructor({ apiKey, restBaseUrl }) {
    this.apiKey = apiKey;
    this.restBaseUrl = restBaseUrl;

    this.quote = null; // {symbol, price, previousClose, changePercent, isMarketOpen}
    this.candlesByTimeframe = {}; // id -> {latestRealBar, series}
    this.sessions = null;
    this.brain = MB.createMarketBrainState();

    this.lastPriceUpdateAt = null;
    this.lastQuoteUpdateAt = null;
    this.lastCandleUpdateAt = {}; // id -> Date
    this.restStatus = 'never'; // 'never' | 'ok' | 'error'
    this.lastRestError = null;
    this.websocketStatus = 'disconnected';

    // Two-tier diffing, deliberately not a single debounced step: every
    // brain change is classified against the immediately-preceding brain
    // state THE MOMENT it happens (in-memory, cheap, never skipped) — only
    // the disk WRITE is debounced. Diffing at the debounce boundary alone
    // would compare "state 5s ago" to "state now" and silently collapse a
    // sweep-and-reversal that both happened inside that same window back
    // to "no change" — exactly the failure mode this server exists to fix
    // (see the Market Data Reality Check). Verified by test — see
    // docs/ALWAYS_ON_SERVER.md.
    this._lastDiffedBrainState = store.readLatestState(); // seed from disk for restart-safety
    this._pendingEvents = [];
    this._diskFlushTimer = null;

    this.startedAt = new Date();
  }

  setWebsocketStatus(status) { this.websocketStatus = status; }

  // ---- REST candle refresh (Phase B/E) ------------------------------------

  async refreshTimeframe(timeframeId) {
    const def = TIMEFRAME_DEFS.find(tf => tf.id === timeframeId);
    if (!def) throw new Error(`Unknown timeframe: ${timeframeId}`);
    try {
      const { latestRealBar, series } = await rest.fetchCandles(this.apiKey, def.tdInterval, def.outputsize, this.restBaseUrl);
      this.candlesByTimeframe[timeframeId] = { latestRealBar, series, fetchedAt: new Date() };
      this.lastCandleUpdateAt[timeframeId] = new Date();
      this.restStatus = 'ok';
      this.lastRestError = null;

      if (BRAIN_CANDLE_TIMEFRAME === timeframeId || LIVE_DATA_TIMEFRAMES.has(timeframeId)) {
        this._recomputeLiveData();
        this._onBrainChanged();
      }
      return this.candlesByTimeframe[timeframeId];
    } catch (err) {
      this.restStatus = 'error';
      this.lastRestError = err.message;
      throw err;
    }
  }

  async refreshQuote() {
    try {
      this.quote = await rest.fetchQuote(this.apiKey, this.restBaseUrl);
      this.lastQuoteUpdateAt = new Date();
      this.restStatus = 'ok';
      this._recomputeLiveData();
      this._onBrainChanged();
    } catch (err) {
      this.restStatus = 'error';
      this.lastRestError = err.message;
      throw err;
    }
  }

  async refreshSessions() {
    const h1 = this.candlesByTimeframe[BRAIN_CANDLE_TIMEFRAME];
    if (!h1) return;
    const price = this._currentPrice();
    this.sessions = rest.computeSessionRanges(h1.series, price);
    this._recomputeLiveData();
    this._onBrainChanged();
  }

  // ---- WebSocket price tick (Phase C/F) -----------------------------------

  applyPriceTick(price, at) {
    this.lastPriceUpdateAt = at || new Date();
    if (!this.quote) this.quote = { symbol: 'XAU/USD', price: null, previousClose: null, changePercent: null, isMarketOpen: null };
    this.quote.price = price;
    this._recomputeLiveData();
    this._onBrainChanged(); // classified immediately, in-memory — see constructor comment
  }

  _currentPrice() {
    return this.quote && typeof this.quote.price === 'number' ? this.quote.price : null;
  }

  // Rebuilds the `liveData` shape computeAllDerivedModules() already
  // expects (same fields data/market.json has always had), from whatever
  // quote/candle data is currently known — then recomputes the full brain.
  // Purely in-memory, no I/O — safe to call on every single price tick.
  _recomputeLiveData() {
    const daily = this.candlesByTimeframe.daily && this.candlesByTimeframe.daily.latestRealBar;
    const weekly = this.candlesByTimeframe.weekly && this.candlesByTimeframe.weekly.latestRealBar;
    const monthly = this.candlesByTimeframe.monthly && this.candlesByTimeframe.monthly.latestRealBar;
    const h1 = this.candlesByTimeframe[BRAIN_CANDLE_TIMEFRAME];

    const liveData = {
      symbol: (this.quote && this.quote.symbol) || 'XAU/USD',
      price: this._currentPrice(),
      previousClose: this.quote && this.quote.previousClose,
      changePercent: this.quote && this.quote.changePercent,
      isMarketOpen: this.quote && this.quote.isMarketOpen,

      dailyOpen: daily && daily.open, dailyHigh: daily && daily.high, dailyLow: daily && daily.low, barDate: daily && daily.datetime,
      weeklyOpen: weekly && weekly.open, weeklyHigh: weekly && weekly.high, weeklyLow: weekly && weekly.low, weekBarDate: weekly && weekly.datetime,
      monthlyOpen: monthly && monthly.open, monthlyHigh: monthly && monthly.high, monthlyLow: monthly && monthly.low, monthBarDate: monthly && monthly.datetime,

      sessions: this.sessions || undefined
    };

    this.brain = MB.computeAllDerivedModules({
      liveData,
      sessions: this.sessions || null,
      candles: { h1: (h1 && h1.series) || [] }
    });
  }

  // Classifies the brain change THIS INSTANT against the last classified
  // state — never skipped, never batched — so a transition that reverses
  // itself before the next disk flush still produces a real event. Only
  // the disk write is debounced (_scheduleDiskFlush), not the
  // classification itself. See the constructor comment for why this
  // two-tier split exists.
  _onBrainChanged() {
    const { events, patternIds } = classifyMarketEvents(this._lastDiffedBrainState, this.brain);
    const persisted = store.toPersistedState(this.brain);
    persisted.patternIds = patternIds;
    this._lastDiffedBrainState = persisted; // becomes the baseline for the NEXT change, however soon it arrives
    if (events.length) this._pendingEvents.push(...events);
    this._scheduleDiskFlush();
    return events;
  }

  _scheduleDiskFlush() {
    if (this._diskFlushTimer) return;
    this._diskFlushTimer = setTimeout(() => {
      this._diskFlushTimer = null;
      this._flushToDisk();
    }, DIFF_DEBOUNCE_MS);
  }

  // Writes the LATEST known state (not necessarily the state at the moment
  // the timer was first scheduled — this._lastDiffedBrainState always
  // reflects the most recent _onBrainChanged() call) plus every event
  // collected since the last flush, in one batch.
  _flushToDisk() {
    store.writeLatestState(this._lastDiffedBrainState);
    if (this._pendingEvents.length) {
      store.appendEvents(this._pendingEvents);
      this._pendingEvents = [];
    }
  }

  // ---- Public snapshots ----------------------------------------------------

  getFreshness() {
    const now = new Date();
    const price = MB.computeDataFreshness(this.lastPriceUpdateAt, this.websocketStatus === 'streaming' || this.websocketStatus === 'connected');
    const candleUpdatedAt = this.lastCandleUpdateAt[BRAIN_CANDLE_TIMEFRAME] || null;
    const candle = MB.computeDataFreshness(candleUpdatedAt, false);
    return {
      serverTime: now.toISOString(),
      lastPriceUpdate: this.lastPriceUpdateAt ? this.lastPriceUpdateAt.toISOString() : null,
      lastCandleUpdate: candleUpdatedAt ? candleUpdatedAt.toISOString() : null,
      priceDataAge: price.ageSeconds,
      priceDataAgeLabel: MB.formatDataAge(price.ageSeconds),
      priceStatus: price.status,
      candleDataAge: candle.ageSeconds,
      candleDataAgeLabel: MB.formatDataAge(candle.ageSeconds),
      candleStatus: candle.status,
      websocketStatus: this.websocketStatus,
      restStatus: this.restStatus,
      // "LIVE" is only ever true when the WebSocket is actually connected
      // AND recent enough per computeDataFreshness's streaming thresholds —
      // never derived from candle/REST freshness. Per Daniel's explicit
      // instruction: "Das Wort LIVE darf nur erscheinen, wenn der WebSocket
      // tatsächlich verbunden ist und aktuelle Preisupdates eintreffen."
      isPriceLive: price.status === 'LIVE' && (this.websocketStatus === 'streaming')
    };
  }

  getHealth() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      websocketStatus: this.websocketStatus,
      restStatus: this.restStatus,
      lastRestError: this.lastRestError,
      timeframesLoaded: Object.keys(this.candlesByTimeframe),
      freshness: this.getFreshness()
    };
  }

  getPublicMarketState() {
    const candles = {};
    Object.keys(this.candlesByTimeframe).forEach(id => {
      const c = this.candlesByTimeframe[id];
      candles[id] = { latestRealBar: c.latestRealBar, series: c.series, fetchedAt: c.fetchedAt.toISOString() };
    });
    return {
      symbol: 'XAUUSD',
      quote: this.quote,
      sessions: this.sessions,
      brain: this.brain,
      candles,
      freshness: this.getFreshness()
    };
  }

  getRecentEvents(limit) {
    return store.readRecentEvents(limit);
  }
}

module.exports = { MarketState, BRAIN_CANDLE_TIMEFRAME, LIVE_DATA_TIMEFRAMES };
