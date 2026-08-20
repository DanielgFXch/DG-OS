'use strict';

// ---------------------------------------------------------------------------
// Timeframe registry — Phase B ("REST Candle Data") of the Always-On Market
// Server build.
//
// DG OS is primarily an HTF/swing assistant, not a scalping system (Daniel's
// explicit correction). Priority order, highest first: Monthly > Weekly >
// Daily > 4H > 1H > 30M > 15M > 5M. 5M was added per Daniel's explicit
// request (Kapitel 8 update, 2026-08-20) as a SECOND, purely informational
// DG Confirmation timeframe alongside 15M — 15M stays authoritative for the
// Entry state machine. 1M is still deliberately NOT in this registry —
// "1M wird später ergänzt und ist aktuell KEINE Priorität." Adding it later
// means one new entry here, nothing else (same config-driven-registry
// pattern as LIQUIDITY_LEVEL_DEFS/POI_TYPE_DEFS in marketBrain.js).
//
// `outputsize` values are deliberately modest — "keine unnötig großen
// Datenmengen abrufen" — but sized so the EXISTING detectors in
// marketBrain.js (POI_ATR_WINDOW=14, Structure Engine's window*2+3 minimum)
// have a real, stable baseline once they're pointed at these series, not
// just the bare minimum to avoid crashing. `historicalReach` is a
// human-readable label, computed from outputsize × the timeframe's own
// duration — not a separate hand-maintained number that could drift out of
// sync with the actual outputsize.
// ---------------------------------------------------------------------------

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function humanDuration(totalSeconds) {
  const days = totalSeconds / DAY;
  if (days >= 365) return `${(days / 365).toFixed(1)} Jahre`;
  if (days >= 60) return `${Math.round(days / 30)} Monate`;
  if (days >= 1) return `${Math.round(days)} Tage`;
  return `${Math.round(totalSeconds / HOUR)} Stunden`;
}

// id: internal DG OS name. tdInterval: TwelveData's own `interval` query
// param. durationSeconds: length of one candle, used only to compute
// historicalReach for documentation/logging — never used for API calls.
const TIMEFRAME_DEFS = [
  { id: 'monthly', tdInterval: '1month', outputsize: 24, durationSeconds: 30 * DAY,
    reason: 'Monthly-Kontext ändert sich selten — 24 Balken (~2 Jahre) sind für HTF-Bias mehr als ausreichend, ohne unnötig viel abzurufen.' },
  { id: 'weekly', tdInterval: '1week', outputsize: 52, durationSeconds: 7 * DAY,
    reason: 'Rang 2 der Prioritätsliste. 52 Balken (~1 Jahr) reichen für Weekly-Swing-Struktur, Liquidity und Premium/Discount über mehrere Quartale.' },
  { id: 'daily', tdInterval: '1day', outputsize: 120, durationSeconds: DAY,
    reason: 'Rang 3. 120 Balken (~4 Monate) — deutlich über dem Minimum, das die bestehende Structure Engine (window*2+3) und POI_ATR_WINDOW=14 für eine stabile Baseline brauchen; die alte GitHub-Actions-Pipeline holte hier nur outputsize=5, zu wenig für echte Daily-Struktur/POI-Erkennung.' },
  { id: '4h', tdInterval: '4h', outputsize: 180, durationSeconds: 4 * HOUR,
    reason: 'Rang 4, Teil des HTF-Kerns laut Daniel. 180 Balken (~30 Tage) — vorher überhaupt nicht abgerufen, nur implizit aus H1 aggregierbar.' },
  { id: '1h', tdInterval: '1h', outputsize: 168, durationSeconds: HOUR,
    reason: 'Rang 5, letzte HTF-Kern-Timeframe. 168 Balken (~7 Tage) — mehr Historie als die bisherigen 72h/3 Tage, weiterhin bescheiden.' },
  { id: '30min', tdInterval: '30min', outputsize: 192, durationSeconds: 30 * MINUTE,
    reason: 'Rang 6, für feinere Reaktionen/Struktur unterhalb des HTF-Kerns, nicht für die Hauptanalyse. 192 Balken (~4 Tage).' },
  { id: '15min', tdInterval: '15min', outputsize: 192, durationSeconds: 15 * MINUTE,
    reason: 'Rang 7, primäre/entscheidende DG Confirmation-Timeframe (Kapitel 8) für den Entry-Status. 192 Balken (~2 Tage).' },
  { id: '5min', tdInterval: '5min', outputsize: 288, durationSeconds: 5 * MINUTE,
    reason: 'Rang 8, sekundäre/informative DG Confirmation-Timeframe (Kapitel 8, Daniels expliziter Wunsch 2026-08-20) — liefert einen früheren Alert, entscheidet aber nicht über WATCH/READY. 288 Balken (~1 Tag).' }
];

const TIMEFRAME_DEFS_DOCUMENTED = TIMEFRAME_DEFS.map(tf => Object.assign({}, tf, {
  historicalReach: humanDuration(tf.outputsize * tf.durationSeconds)
}));

module.exports = { TIMEFRAME_DEFS: TIMEFRAME_DEFS_DOCUMENTED, humanDuration };
