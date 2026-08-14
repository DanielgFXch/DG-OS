'use strict';

// ---------------------------------------------------------------------------
// Candle refresh scheduler — Phase E.
//
// "Da DG OS HTF-orientiert ist, muss nicht jede Sekunde jede
// Timeframe-Historie neu geladen werden... abgeschlossene Candles möglichst
// zeitnah nach Candle Close aktualisieren. Keine unnötigen API Requests
// verursachen."
//
// Each timeframe is refreshed once, shortly after its own candle actually
// closes — not on a fixed poll interval unrelated to the data's real
// cadence. A monthly candle triggers ~12 refreshes/year; a 15-min candle
// triggers ~96/day. Uses recursive setTimeout (not setInterval) because
// several of these boundaries aren't fixed-length in JS time-math terms
// (a month is 28-31 days) — computing "next boundary" fresh each time is
// simpler and more correct than trying to express it as a fixed interval.
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Buffer after the theoretical close before refetching — gives the
// provider a moment to finalize/publish the bar. Intraday timeframes need
// less slack than daily+ (which aggregate across a full global trading
// day and can finalize a little later).
function bufferMsFor(timeframeId) {
  if (timeframeId === 'monthly' || timeframeId === 'weekly' || timeframeId === 'daily') return 5 * MINUTE_MS;
  return 90 * 1000; // 4h/1h/30min/15min
}

function nextBoundaryUtc(timeframeId, from) {
  const d = new Date(from.getTime());
  switch (timeframeId) {
    case 'monthly': {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
      return next;
    }
    case 'weekly': {
      // Aligns to the start of the ISO week (Monday 00:00 UTC) — a
      // documented approximation, not a claim of exact instrument session
      // boundaries (see docs/ALWAYS_ON_SERVER.md).
      const day = d.getUTCDay(); // 0=Sun..6=Sat
      const daysUntilMonday = ((8 - day) % 7) || 7;
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0));
      return next;
    }
    case 'daily': {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
      return next;
    }
    case '4h': {
      const hourBlock = Math.floor(d.getUTCHours() / 4) * 4;
      let next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourBlock + 4, 0, 0));
      return next;
    }
    case '1h': {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1, 0, 0));
      return next;
    }
    case '30min': {
      const block = d.getUTCMinutes() < 30 ? 30 : 60;
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0) + block * MINUTE_MS);
      return next;
    }
    case '15min': {
      const block = (Math.floor(d.getUTCMinutes() / 15) + 1) * 15;
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0) + block * MINUTE_MS);
      return next;
    }
    default:
      throw new Error(`No boundary rule for timeframe: ${timeframeId}`);
  }
}

// onDue(timeframeId) is called once per boundary, after the buffer. Returns
// a stop() function. Errors from onDue are caught and logged (via
// onError), never allowed to break the recursive scheduling chain — a
// single failed refresh must not silently stop future refreshes forever.
function scheduleTimeframeRefresh(timeframeId, onDue, onError) {
  let stopped = false;
  let timer = null;

  function scheduleNext() {
    if (stopped) return;
    const now = new Date();
    const boundary = nextBoundaryUtc(timeframeId, now);
    const dueAt = new Date(boundary.getTime() + bufferMsFor(timeframeId));
    const delay = Math.max(1000, dueAt.getTime() - now.getTime());
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        await onDue(timeframeId);
      } catch (err) {
        if (onError) onError(timeframeId, err);
      }
      scheduleNext();
    }, delay);
  }

  scheduleNext();
  return function stop() { stopped = true; if (timer) clearTimeout(timer); };
}

module.exports = { scheduleTimeframeRefresh, nextBoundaryUtc, bufferMsFor };
