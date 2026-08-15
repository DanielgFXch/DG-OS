'use strict';

// ---------------------------------------------------------------------------
// Persistence for the DG Trading Brain V1's cross-restart memory (Phase 9/10
// of the autonomous night build): the previous Entry Status (Kapitel 9) and
// the Active Setup Model, so a Railway restart doesn't forget a WATCH/
// CONFIRMATION/READY setup that was already in progress ("Market Memory",
// Phase 11). Same STATE_DIR/pattern as marketStateStore.js — one more flat
// JSON file on the existing Persistent Volume, no database migration, no
// new hosting.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'state');
const TRADING_BRAIN_STATE_PATH = path.join(STATE_DIR, 'tradingBrainState.json');

function readTradingBrainState() {
  if (!fs.existsSync(TRADING_BRAIN_STATE_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(TRADING_BRAIN_STATE_PATH, 'utf8')); } catch (err) { return null; }
}

function writeTradingBrainState(state) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(TRADING_BRAIN_STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

module.exports = { TRADING_BRAIN_STATE_PATH, readTradingBrainState, writeTradingBrainState };
