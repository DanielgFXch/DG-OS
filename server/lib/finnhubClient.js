'use strict';

// ---------------------------------------------------------------------------
// Finnhub economic calendar client — Kapitel 14 (DG News), the free-tier
// data source Daniel picked ("machen wir erstmal das kostenlose"). Same
// pattern as twelveDataRest.js: `baseUrl` is injectable so tests point this
// at a local mock instead of the real API; the caller (server/index.js)
// reads process.env.FINNHUB_API_KEY and passes it in per-call — this
// module never reads process.env itself and never logs the key.
//
// Kapitel 14 is explicit: "News ≠ automatischer Direction Bias." This
// client only ever returns FACTS (which event, when, how impactful) — it
// computes no trading signal, no direction, no recommendation. Whatever
// consumes this output (marketBrain.js's computeNewsContext) must keep
// treating it as pure informational context, never a Bias/Entry input.
//
// Field-name caveat: normalized from Finnhub's documented economic-
// calendar response shape as of this build. Not yet verified against a
// real key/live response (Daniel hasn't provided one yet) — if the actual
// field names differ once real data flows, this is the one place to fix.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://finnhub.io/api/v1';

// Finnhub's `impact` field has been observed as either a string
// ('low'/'medium'/'high') or a small integer (1/2/3) depending on
// endpoint version — normalize both to the same three-value scale so the
// rest of the app only ever deals with one shape.
function normalizeImpact(raw) {
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === 'high' || lower === 'medium' || lower === 'low') return lower;
    return 'low';
  }
  if (typeof raw === 'number') {
    if (raw >= 3) return 'high';
    if (raw === 2) return 'medium';
    return 'low';
  }
  return 'low';
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const err = new Error((body && body.error) || `Finnhub HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Returns high-impact economic events for `country` (default 'US' — the
// dominant driver of XAUUSD moves) within [from, to], sorted chronologically.
// Never throws on an empty/malformed response — returns [] instead, since a
// temporary calendar hiccup must never take down the rest of the brain.
async function fetchEconomicCalendar(apiKey, { from, to, country = 'US', baseUrl } = {}) {
  if (!apiKey) return [];
  const fromStr = from || toDateStr(new Date());
  const toStr = to || toDateStr(new Date(Date.now() + 3 * 24 * 3600e3));
  const url = `${baseUrl || DEFAULT_BASE_URL}/calendar/economic?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&token=${encodeURIComponent(apiKey)}`;
  const body = await fetchJson(url);
  const raw = Array.isArray(body && body.economicCalendar) ? body.economicCalendar : [];
  return raw
    .filter(e => e && e.event && e.time)
    .map(e => ({
      event: String(e.event),
      country: e.country || null,
      time: e.time, // ISO-ish string as provided by Finnhub, passed through as-is — never reformatted/guessed
      impact: normalizeImpact(e.impact),
      actual: e.actual ?? null,
      estimate: e.estimate ?? null,
      previous: e.prev ?? null,
      unit: e.unit || null
    }))
    .filter(e => !country || e.country === country)
    .filter(e => e.impact === 'high') // Kapitel 14 context, not an alert-fatigue source — only the events that actually move Gold
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

module.exports = { fetchEconomicCalendar, normalizeImpact };
