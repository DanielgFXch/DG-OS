'use strict';

// ---------------------------------------------------------------------------
// Formats a DG Trading Brain V1 event (see events.js's tbEvent()/
// classifyMarketEvents()) into a German Telegram push message — the
// server-side counterpart to app.js's pollAndSendEventAlerts(), so Daniel
// gets pushed even when the dashboard isn't open (his explicit ask,
// 2026-08-20: "ich will das alles auf Telegram bekommen, auch wenn die App
// zu ist"). Every string here only PRESENTS a Market Fact/DG Interpretation
// events.js already computed — it invents no trading opinion of its own.
// ---------------------------------------------------------------------------

const MB = require('../../marketBrain.js');

const TYPE_LABEL = {
  LIQUIDITY_SWEPT: '💧 Liquidity Sweep',
  LIQUIDITY_REACTED: '↩️ Reaktion nach Sweep',
  LIQUIDITY_APPROACHING: '🎯 Liquidity Level in Reichweite',
  REACTION_DETECTED: '👀 Reaktion am POI erkannt',
  CONFIRMATION_DEVELOPING: '🟠 Confirmation entwickelt sich (15M)',
  ENGULFING_CONFIRMED: '✅ 15M Engulfing bestätigt',
  STRUCTURE_CONFIRMED: '✅ 15M Struktur-Bestätigung',
  '5M_REACTION_DETECTED': '👀 5M Reaktion erkannt',
  '5M_CONFIRMATION_DEVELOPING': '🟠 5M Confirmation entwickelt sich',
  '5M_ENGULFING_CONFIRMED': '⚡ 5M Engulfing (früher Hinweis — 15M bleibt entscheidend)',
  '5M_STRUCTURE_CONFIRMED': '⚡ 5M Struktur-Shift (früher Hinweis — 15M bleibt entscheidend)',
  WATCH_BUY: '🟡 WATCH BUY',
  WATCH_SELL: '🟡 WATCH SELL',
  BUY_CONFIRMATION: '🟠 BUY CONFIRMATION',
  SELL_CONFIRMATION: '🟠 SELL CONFIRMATION',
  BUY_READY: '🟢 BUY READY',
  SELL_READY: '🔴 SELL READY',
  MISSED: '⏭️ Setup verpasst (kein Entry, Kapitel 12)',
  SETUP_INVALIDATED: '❌ Setup ungültig',
  DATA_NOT_READY: '⚠️ Marktdaten nicht bereit',
  SYSTEM_RECOVERED: '✅ Marktdaten wieder vollständig',
  BOS_CONFIRMED: '📈 BOS bestätigt',
  CHOCH_CONFIRMED: '🔄 CHOCH bestätigt',
  POI_REACHED: '📍 POI erreicht',
  FVG_REACHED: '📍 FVG erreicht',
  ORDERBLOCK_REACHED: '📍 Order Block erreicht'
};

// Session-liquidity types are dynamically named (see events.js's
// SESSION_EVENT_PREFIX: ASIA_HIGH_SWEPT, LONDON_LOW_TOUCHED, ...) — build
// the label instead of hand-listing all 12 combinations.
function sessionLevelLabel(type) {
  const m = /^(ASIA|LONDON|NY)_(HIGH|LOW)_(TOUCHED|SWEPT)$/.exec(type);
  if (!m) return null;
  const sessionName = { ASIA: 'Asia', LONDON: 'London', NY: 'New York' }[m[1]];
  const side = m[2] === 'HIGH' ? 'High' : 'Low';
  if (m[3] === 'SWEPT') return `💥 ${sessionName} Session ${side} gesweept`;
  return `👉 ${sessionName} Session ${side} getouched`;
}

// Only 'trading' category events are ever worth a push (see events.js
// header: "Level entsteht = Market Context -> still speichern. Mit einem
// Level passiert etwas = Trading Event -> potenziell relevant.") — a
// *_CREATED context event never reaches Telegram, guarded again here even
// though EVENT_CATEGORY already marks it 'context' upstream.
function formatEventForTelegram(event) {
  if (!event || event.category !== 'trading') return null;
  const sessionLabel = sessionLevelLabel(event.type);
  const headline = sessionLabel || TYPE_LABEL[event.type] || event.type;

  const detailParts = [];
  if (event.timeframe) detailParts.push(event.timeframe);
  if (typeof event.price === 'number') detailParts.push(MB.fmtPrice(event.price));
  if (event.direction) {
    const bullish = event.direction === 'bullish' || event.direction === 'up';
    const bearish = event.direction === 'bearish' || event.direction === 'down';
    detailParts.push(bullish ? 'bullish' : (bearish ? 'bearish' : event.direction));
  }

  const lines = [headline];
  if (detailParts.length) lines.push(detailParts.join(' · '));
  if (event.explanation) lines.push(event.explanation);
  lines.push('', 'XAUUSD — DG OS');
  return lines.join('\n');
}

module.exports = { formatEventForTelegram, TYPE_LABEL, sessionLevelLabel };
