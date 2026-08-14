'use strict';

// ---------------------------------------------------------------------------
// TwelveData REST client — Phase A/B of the Always-On Market Server.
//
// This is a direct JS port of the bash/jq logic that has lived in
// .github/workflows/market-data.yml since the very first build — same
// filtering rules, same reasoning, now reusable from a long-running Node
// process instead of a one-shot Actions job. `baseUrl` is injectable so
// tests can point this at a local mock server instead of the real
// TwelveData API — see server/test/ for how that's exercised.
//
// The API key is read by the caller (server/index.js, from
// process.env.TWELVEDATA_API_KEY) and passed in per-call — this module
// never reads process.env itself, and never logs the key it's given.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.twelvedata.com';

// "Scan forward for a real candle" (see docs/MARKET_BRAIN.md): TwelveData
// emits a bar for every calendar period, including ones with no real
// trading (a flat, carried-forward placeholder). Never trust values[0]
// blindly — scan forward for the first bar whose range is a meaningful
// fraction of price (> 0.1%). Identical threshold to the bash/jq version.
function firstRealBar(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const real = values.find(v => {
    const h = Number(v.high), l = Number(v.low), c = Number(v.close);
    return Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) && c > 0 && (h - l) / c > 0.001;
  });
  return real || values[0] || null;
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBar(bar) {
  if (!bar) return null;
  return {
    datetime: bar.datetime || null,
    open: toNumberOrNull(bar.open),
    high: toNumberOrNull(bar.high),
    low: toNumberOrNull(bar.low),
    close: toNumberOrNull(bar.close)
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (body && body.status === 'error') {
    const err = new Error(body.message || 'TwelveData API error');
    err.tdResponse = body;
    throw err;
  }
  return body;
}

async function fetchQuote(apiKey, baseUrl) {
  const url = `${baseUrl || DEFAULT_BASE_URL}/quote?symbol=XAU/USD&apikey=${encodeURIComponent(apiKey)}`;
  const body = await fetchJson(url);
  return {
    symbol: body.symbol || 'XAU/USD',
    price: toNumberOrNull(body.close),
    previousClose: toNumberOrNull(body.previous_close),
    changePercent: toNumberOrNull(body.percent_change),
    isMarketOpen: typeof body.is_market_open === 'boolean' ? body.is_market_open : null
  };
}

// Returns both the single most-recent REAL bar (for Open/High/Low display,
// Premium/Discount, etc.) AND the full chronologically-sorted series (for
// marketBrain.js's detectors, which need a real candle array — same shape
// as the existing candles.h1). One fetch, two uses — no second API call.
async function fetchCandles(apiKey, tdInterval, outputsize, baseUrl) {
  const url = `${baseUrl || DEFAULT_BASE_URL}/time_series?symbol=XAU/USD&interval=${encodeURIComponent(tdInterval)}&outputsize=${outputsize}&timezone=UTC&apikey=${encodeURIComponent(apiKey)}`;
  const body = await fetchJson(url);
  const values = Array.isArray(body.values) ? body.values : [];
  const latestRealBar = normalizeBar(firstRealBar(values));
  const series = values
    .filter(v => [v.open, v.high, v.low, v.close].every(x => toNumberOrNull(x) !== null))
    .map(normalizeBar)
    .sort((a, b) => (a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0));
  return { latestRealBar, series };
}

// Session Engine (Asia/London/NY) — identical grouping logic to
// market-data.yml's SESSION_FILTER, ported to JS. Takes the already-fetched
// 1h series (reused, no extra API call) plus the current price for the
// "meaningful range" filter.
const SESSION_WINDOWS = [
  { id: 'asia', startHour: 0, endHour: 8 },
  { id: 'london', startHour: 8, endHour: 16 },
  { id: 'ny', startHour: 13, endHour: 21 }
];

function computeSessionRanges(hourlySeries, price) {
  const result = {};
  SESSION_WINDOWS.forEach(w => {
    const inWindow = hourlySeries.filter(c => {
      const hour = Number(c.datetime.slice(11, 13));
      return hour >= w.startHour && hour < w.endHour;
    });
    const byDay = new Map();
    inWindow.forEach(c => {
      const day = c.datetime.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(c);
    });
    const days = Array.from(byDay.entries())
      .map(([day, candles]) => ({
        day,
        high: Math.max(...candles.map(c => c.high)),
        low: Math.min(...candles.map(c => c.low))
      }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)); // newest first

    const meaningful = typeof price === 'number' && price > 0
      ? days.find(d => (d.high - d.low) / price > 0.0005)
      : null;
    const chosen = meaningful || days[0] || { day: null, high: null, low: null };
    result[w.id] = { high: chosen.high, low: chosen.low, date: chosen.day };
  });
  return result;
}

module.exports = { fetchQuote, fetchCandles, computeSessionRanges, firstRealBar, DEFAULT_BASE_URL };
