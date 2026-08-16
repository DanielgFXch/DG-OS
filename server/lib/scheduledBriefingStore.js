'use strict';

// ---------------------------------------------------------------------------
// Persistence for the DG OS Chat's proactive morning briefing (Daniel's
// "ich will einfach immer up to date werden" ask): remembers the last
// Europe/Zurich calendar date a briefing was actually sent, so a restart
// near the send time (or a server check running more than once that
// minute) never double-sends. Same STATE_DIR/one-flat-JSON-file pattern as
// tradingBrainStore.js — Railway-Persistent-Volume-only, never git-committed.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'state');
const SCHEDULED_BRIEFING_STATE_PATH = path.join(STATE_DIR, 'scheduledBriefing.json');

function readLastBriefingSentDate() {
  if (!fs.existsSync(SCHEDULED_BRIEFING_STATE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(SCHEDULED_BRIEFING_STATE_PATH, 'utf8'));
    return parsed && parsed.lastSentDate ? parsed.lastSentDate : null;
  } catch (err) {
    return null;
  }
}

function writeLastBriefingSentDate(dateStr) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SCHEDULED_BRIEFING_STATE_PATH, JSON.stringify({ lastSentDate: dateStr }, null, 2) + '\n');
}

module.exports = { SCHEDULED_BRIEFING_STATE_PATH, readLastBriefingSentDate, writeLastBriefingSentDate };
