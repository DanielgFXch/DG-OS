'use strict';

// ---------------------------------------------------------------------------
// Persistence for the Session-Open Zonen-Update (Daniel's explicit ask,
// 2026-08-20: bei Asia/London/NY-Open eine Buy/Sell-Zonen-Übersicht).
// Stores the flat list of `${UTC-date}-${sessionId}` keys already sent —
// each key embeds its own date, so a new day never matches yesterday's
// keys and no explicit daily reset is needed (see marketBrain.js's
// nextSessionOpenToSend()). Same STATE_DIR/one-flat-JSON-file pattern as
// scheduledBriefingStore.js/tradingBrainStore.js — Railway-Persistent-
// Volume-only, never git-committed.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'state');
const SESSION_OPEN_STATE_PATH = path.join(STATE_DIR, 'sessionOpen.json');

// Caps growth the same way state/events.jsonl caps itself — 3 sessions/day,
// so 60 keeps ~3 weeks of history, far more than the dedup check ever needs.
const MAX_STORED_KEYS = 60;

function readSentKeys() {
  if (!fs.existsSync(SESSION_OPEN_STATE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSION_OPEN_STATE_PATH, 'utf8'));
    return Array.isArray(parsed && parsed.sentKeys) ? parsed.sentKeys : [];
  } catch (err) {
    return [];
  }
}

function appendSentKey(key) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const keys = readSentKeys();
  if (!keys.includes(key)) keys.push(key);
  const trimmed = keys.slice(-MAX_STORED_KEYS);
  fs.writeFileSync(SESSION_OPEN_STATE_PATH, JSON.stringify({ sentKeys: trimmed }, null, 2) + '\n');
}

module.exports = { SESSION_OPEN_STATE_PATH, readSentKeys, appendSentKey };
