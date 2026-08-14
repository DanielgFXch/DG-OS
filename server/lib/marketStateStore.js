'use strict';

// ---------------------------------------------------------------------------
// Shared persistence layer for state/latest.json + state/events.jsonl.
//
// Extracted out of scripts/ingest.js (Phase 1, v0.20.0) so the Always-On
// Market Server can use the EXACT same persisted-state shape and
// event-log-writing logic as the GitHub Actions ingest script — one
// implementation, two callers, per Daniel's explicit "keine zweite
// parallele Trading-/Market-Engine bauen." scripts/ingest.js now requires
// this module instead of defining its own copy.
//
// Deliberately excludes the raw per-timeframe candle series from the
// persisted shape — those are re-fetchable input (same reasoning that
// already excluded candles.h1 before this file existed), not computed
// output. The Always-On Server holds the full candle series in memory and
// serves them live via its API; only the *computed* Market Brain output
// gets written here, for restart-safety.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'state');
const LATEST_PATH = path.join(STATE_DIR, 'latest.json');
const EVENTS_PATH = path.join(STATE_DIR, 'events.jsonl');

// Keep the hot event log bounded — see docs/DG_OS_V2_AUDIT.md's migration
// plan: a real database is Phase 3+ territory, this is the interim, honest
// limit. Nothing is deleted from git history, only from the working file.
const EVENTS_RETAIN = 2000;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (err) { return null; }
}

function readEventLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
}

function toPersistedState(brain) {
  return {
    updatedAt: new Date().toISOString(),
    dgOsVersion: pkg.version,
    liveData: brain.liveData ? {
      price: brain.liveData.price, dailyOpen: brain.liveData.dailyOpen, dailyHigh: brain.liveData.dailyHigh, dailyLow: brain.liveData.dailyLow, barDate: brain.liveData.barDate,
      weeklyOpen: brain.liveData.weeklyOpen, weeklyHigh: brain.liveData.weeklyHigh, weeklyLow: brain.liveData.weeklyLow, weekBarDate: brain.liveData.weekBarDate,
      monthlyOpen: brain.liveData.monthlyOpen, monthlyHigh: brain.liveData.monthlyHigh, monthlyLow: brain.liveData.monthlyLow, monthBarDate: brain.liveData.monthBarDate
    } : null,
    sessions: brain.sessions || null,
    premiumDiscount: brain.premiumDiscount || null,
    htfBias: brain.htfBias || null,
    liquidity: brain.liquidity || null,
    pois: (brain.pois && brain.pois.list) || [],
    structure: (brain.structure && brain.structure.list) || [],
    dgConfidence: brain.dgConfidence || null,
    decision: brain.decision || null,
    overview: brain.overview || null,
    patternIds: [] // filled by the caller after classifyMarketEvents() runs
  };
}

function readLatestState() {
  return readJson(LATEST_PATH);
}

function writeLatestState(persisted) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LATEST_PATH, JSON.stringify(persisted, null, 2) + '\n');
}

function appendEvents(events) {
  if (!events.length) return;
  const existingLines = readEventLines(EVENTS_PATH);
  const newLines = events.map(e => JSON.stringify(Object.assign({ ingestedAt: new Date().toISOString() }, e)));
  const allLines = existingLines.concat(newLines).slice(-EVENTS_RETAIN);
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(EVENTS_PATH, allLines.join('\n') + '\n');
}

function readRecentEvents(limit) {
  const lines = readEventLines(EVENTS_PATH);
  const slice = typeof limit === 'number' ? lines.slice(-limit) : lines;
  return slice.map(line => { try { return JSON.parse(line); } catch (err) { return null; } }).filter(Boolean);
}

module.exports = {
  STATE_DIR, LATEST_PATH, EVENTS_PATH, EVENTS_RETAIN,
  readJson, readEventLines, toPersistedState,
  readLatestState, writeLatestState, appendEvents, readRecentEvents
};
