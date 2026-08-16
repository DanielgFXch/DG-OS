# DG OS Always-On Market Server

**Status:** built and tested locally against mock TwelveData REST/WebSocket
endpoints. **Not deployed anywhere** — see
[`ALWAYS_ON_HOSTING.md`](ALWAYS_ON_HOSTING.md) for the hosting comparison
(no hosting booked yet) and "Real TwelveData verification" below for what
that gap means honestly.

## Why this exists

The Market Data Reality Check found that `.github/workflows/market-data.yml`,
configured for a 15-minute cron, actually runs on a real median of ~66
minutes (49–155 minute range) in production — GitHub Actions' `schedule`
trigger is well-documented to not honor short intervals reliably. A
follow-up HTF-priority reassessment found the GitHub Actions cadence is
largely *adequate* for Weekly/Daily/4H context, but genuinely inadequate
for anything faster, and structurally unable to catch a liquidity
sweep-and-reversal that completes between two fetches (the Liquidity
Engine only ever compares a point-in-time price snapshot against a level,
with no memory of what happened in between).

This server exists to close that gap — for the HTF core Daniel actually
trades from, and as the foundation for reliable session-level sweep
detection — without inventing a second Market Brain. It reuses
`marketBrain.js` and `events.js` exactly as they already exist.

## Architecture

```
TwelveData REST                 TwelveData WebSocket
  (candle history, 7            (current XAUUSD price,
   HTF-priority timeframes)      continuous ticks)
        │                               │
        ▼                               ▼
  server/lib/twelveDataRest.js    server/lib/twelveDataSocket.js
  (fetch + "scan forward for a    (connect, subscribe, heartbeat,
   real candle" filter — same     reconnect-with-backoff — server-
   logic as market-data.yml,      side port of the browser-only
   now reusable from Node)        openTdSocket() app.js has had
        │                         since the WebSocket feature shipped)
        │                               │
        └───────────────┬───────────────┘
                         ▼
                 server/marketState.js
                 (the ONLY place that calls marketBrain.js's
                  computeAllDerivedModules() and events.js's
                  classifyMarketEvents() — same functions
                  app.js and scripts/ingest.js already use)
                         │
           ┌─────────────┼─────────────────┐
           ▼             ▼                 ▼
   server/api.js   server/lib/          server/lib/
   (HTTP API,      marketStateStore.js  candleRefreshScheduler.js
   Phase A)        (state/latest.json + (candle-close-aligned
                    state/events.jsonl,  refresh timing, Phase E)
                    shared with
                    scripts/ingest.js)
```

**"Keine zweite parallele Trading-/Market-Engine"** is enforced at three
layers, not just asserted:

1. **Computation** — `server/marketState.js` calls
   `MB.computeAllDerivedModules()` and `classifyMarketEvents()` directly.
   No detector, no scoring function, no event-classification rule is
   redefined here.
2. **Persistence** — `toPersistedState()`/`writeLatestState()`/
   `appendEvents()` were extracted out of `scripts/ingest.js` into
   `server/lib/marketStateStore.js`; `scripts/ingest.js` now requires that
   shared module instead of owning its own copy. Both the GitHub Actions
   fallback and the always-on server write `state/latest.json` /
   `state/events.jsonl` in exactly the same shape.
3. **Ids** — POI/structure ids are the same deterministic ids
   `marketBrain.js` has used since Phase 1 (Core Foundation), so events
   diffed by the server and events diffed by `scripts/ingest.js` are
   directly comparable — a restart from one to the other doesn't produce
   spurious duplicate/missing events.

## Phase A — Server & API

`server/index.js` is the entry point. Run locally:

```
TWELVEDATA_API_KEY=... node server/index.js
```

Endpoints (Node's built-in `http` module — no Express, no dependency
added; the project has stayed at zero npm dependencies throughout):

| Endpoint | Method | Returns |
|---|---|---|
| `/api/health` | GET | Uptime, WebSocket/REST status, which timeframes are loaded, the freshness block (see Phase D) |
| `/api/market/XAUUSD` | GET | Full current market state: quote, sessions, the entire computed Market Brain (`brain`), all 7 timeframes' candle series, freshness |
| `/api/events/XAUUSD` | GET | Recent events from `state/events.jsonl` (`?limit=N`, default 50, max 500) |
| `/api/tradingview/webhook` | POST | **Stub only** — returns `501 not_implemented` with a pointer to `docs/TRADINGVIEW_INTEGRATION_PLAN.md`. See Phase G. |

CORS is permissive (`Access-Control-Allow-Origin: *`) — this is read-only
public market data with no user data and no secrets in any response;
that's a deliberate, documented choice, not an oversight.

No trading execution exists anywhere in this server, per explicit scope.

## Phase B — REST candle data (7 HTF-priority timeframes)

`server/lib/timeframes.js` is the registry (config-driven, same pattern as
`LIQUIDITY_LEVEL_DEFS`/`POI_TYPE_DEFS` in `marketBrain.js` — adding an 8th
timeframe later is one entry, nothing else). Deliberately **not** including
5M/1M yet, per Daniel's explicit "5M und 1M werden später ergänzt und sind
aktuell KEINE Priorität."

| Timeframe | TwelveData interval | Candles | ≈ Historical reach | Why this many |
|---|---|---|---|---|
| Monthly | `1month` | 24 | ~2 years | Rarely changes; this comfortably covers HTF bias without over-fetching |
| Weekly | `1week` | 52 | ~1 year | Rank 2 — a full year of weekly swings/liquidity/Premium-Discount |
| Daily | `1day` | 120 | ~4 months | Rank 3 — well above the bare minimum the existing Structure Engine (`window*2+3`) and `POI_ATR_WINDOW=14` need for a stable baseline; the old pipeline fetched only 5 |
| 4H | `4h` | 180 | ~30 days | Rank 4, part of the HTF core — previously not fetched *at all* |
| 1H | `1h` | 168 | ~7 days | Rank 5, last HTF-core timeframe — more history than the previous 72h/3-day fetch |
| 30M | `30min` | 192 | ~4 days | Rank 6 — finer reactions/structure, not the main analysis |
| 15M | `15min` | 384 | ~4 calendar days | Rank 7 — confirmation/entry timing; preserves usable trading history across a placeholder-filled weekend without increasing request frequency |

**Important scope boundary:** this is data *preparation*, not new
detection. `computeAllDerivedModules()` still only consumes the `1h`
series (same as `data/market.json` always has) plus the latest real bar of
daily/weekly/monthly — exactly like today. The full per-timeframe series
(4h/30min/15min, and the fuller daily/weekly/monthly history) are fetched
and exposed via `/api/market/XAUUSD` so a *future* build can wire
per-timeframe POI/Structure detectors onto them — "Datenbasis vorbereiten,
noch keine neuen Tradingregeln," exactly as instructed. Wiring an HTF POI/
Structure/Liquidity engine onto these series is explicitly future work, not
part of this build.

The raw per-timeframe series are **not** written into `state/latest.json`
— same reasoning that already excluded `candles.h1` from that file before
this server existed: they're re-fetchable input, not computed output.
Persisting them would bloat every git commit with fully-reproducible data.

## Phase C — TwelveData WebSocket, server-side

`server/lib/twelveDataSocket.js` — a direct, framework-agnostic port of
`app.js`'s `openTdSocket()` (browser-only, dies when the tab closes) to a
long-running Node process, using Node 22's built-in `WebSocket` (no
dependency added). Same protocol: subscribe to `XAU/USD`, 10s heartbeat,
reconnect with linear backoff (3s × attempt, capped at 30s).

Tested against a local mock WebSocket server (RFC 6455 handshake,
subscribe/price protocol matching TwelveData's real shape):
connect → subscribe → stream ticks, clean disconnect, and — the important
one — **abrupt connection loss**: killing the mock process mid-stream, the
client detected the drop within ~0.5s and issued its first reconnect
attempt at exactly the expected 3s backoff.

`TWELVEDATA_API_KEY` is read once from `process.env` in `server/index.js`
and passed by reference into the socket/REST modules — never logged, never
written to disk, never present in any HTTP response (`getHealth()`/
`getPublicMarketState()` never include it; verified by inspecting actual
API responses during testing).

## Phase D — Market Freshness (server + frontend)

The server tracks price and candle freshness **separately** — a WebSocket
tick and a REST candle refresh are genuinely different events with
different natural cadences, and the previous single "Data Age"/"Data
Status" (from the earlier Version & Freshness build) hid that distinction.

`server/marketState.js`'s `getFreshness()` reuses `marketBrain.js`'s
existing `computeDataFreshness()` — the *same* function, called twice:

- **Price** — `computeDataFreshness(lastPriceUpdateAt, isStreaming)`,
  `isStreaming` from the WebSocket's own status. LIVE ≤20s / DELAYED ≤90s /
  STALE beyond (the `streaming` threshold set, unchanged from the earlier
  build).
- **Candles** — `computeDataFreshness(lastCandleUpdateAt, false)`. LIVE
  ≤5min / DELAYED ≤20min / STALE beyond (the `baseline` threshold set).
  These are the *same numbers* the earlier build used for the old GitHub
  Actions cadence, where they were miscalibrated (real cadence ~66 min
  meant "STALE" ~70% of the time). Paired with this server's candle-close-
  aligned refresh (Phase E) instead of GitHub's unreliable cron, the same
  thresholds are now correctly calibrated — the mismatch was in the
  *update mechanism*, not the thresholds.

**`isPriceLive`** is the literal, sole gate for ever showing the word
"LIVE": `priceStatus === 'LIVE' && websocketStatus === 'streaming'`. Tested
explicitly: killing only the mock WebSocket while REST stayed healthy left
`priceStatus` still computing "LIVE" for a few more seconds (the price was
still recent by age alone) — `isPriceLive` correctly went `false`
immediately, and the frontend correctly downgraded its display to
DELAYED, never showing LIVE off a connection that wasn't actually there.

### Frontend (`app.js`, `index.html`)

The System Status card now shows Price and Candles as separate rows (Last
Price / HTF Candles / Price Source / Candles), matching Daniel's requested
layout. A new optional field, "Always-On Market Server URL" (same
localStorage pattern as the existing TwelveData WebSocket key field), lets
the dashboard point at a deployed server once one exists:

- **Not configured (today's default, and today's actual production
  state — no server is hosted yet):** behaves exactly as before this
  build. Price and Candle freshness both read from the same
  `computeDataFreshness(lastMarketUpdateAt, tdStreaming)` local
  computation — reported as equal, honestly, since in this mode they
  really do come from the same fetch.
- **Configured and reachable:** polls `/api/market/XAUUSD` every 3s and
  uses the server's own freshness numbers directly — Price and Candle rows
  now genuinely differ (verified in testing: e.g. price "0s ago" via
  WebSocket next to candles "24s ago" via REST).
- **Configured but unreachable:** falls back to the same local computation
  as "not configured," with a visible status message explaining why.

This was tested in both modes via Playwright, including the CORS path
(browser on one origin, mock server on another) — no dashboard regression
in the unconfigured/default state, which is what production actually runs
today.

## Phase E — HTF candle refresh scheduling

`server/lib/candleRefreshScheduler.js` — not fixed-interval polling.
Each timeframe is refreshed once, shortly after its *own* candle actually
closes (a small buffer after the boundary: 90s for intraday timeframes,
5 minutes for daily/weekly/monthly, giving TwelveData a moment to finalize
the bar). A monthly candle triggers ~12 refreshes/year; a 15-min candle
triggers ~96/day — no wasted requests, no fixed poll unrelated to the
data's real cadence.

Boundary math is verified by direct unit test for every timeframe,
including hour/day/month rollovers (e.g. Dec 20 → next boundary Jan 1 of
the following year, computed correctly).

Uses recursive `setTimeout`, not `setInterval` — several boundaries aren't
fixed-length in JS time-math terms (a month is 28–31 days), so "compute the
next boundary fresh each time" is simpler and more correct than expressing
it as a repeating interval. A failed refresh (network error, TwelveData
error response) is caught and logged without breaking the recursive
scheduling chain — one bad fetch doesn't silently stop all future
refreshes for that timeframe.

## Phase F — Existing Event Store, live-price touch monitoring

The Market-Context-vs-Trading-Event classification (`events.js`) is
completely unchanged — this server is a new *producer* of brain snapshots
to diff, not a change to what counts as which category.

What's new: every WebSocket price tick calls `applyPriceTick()`, which
recomputes the full Market Brain (same `computeAllDerivedModules()` call,
just fed a fresher price) and classifies the change *immediately*,
in-memory — not on a debounce timer. Only the **disk write** is debounced
(5s), not the event classification itself.

This distinction mattered in practice: an earlier version of this server
diffed only at the debounce boundary, comparing "state 5 seconds ago" to
"state now" — a sweep-and-reversal that completed *within* that 5-second
window would net out to "no change" and be silently lost, defeating the
entire point of Phase F. Fixed by splitting into two tiers: every tick is
classified against the immediately preceding tick's state (never skipped),
while accumulated events are only flushed to `state/events.jsonl` in a
batch every 5s. Verified by test: a synthetic sweep-then-reversal happening
across two ticks inside one debounce window still produced a real
`ASIA_HIGH_SWEPT`/`LIQUIDITY_SWEPT` event pair, even though the final
in-memory state showed price back below the level.

No Daniel-specific sweep/confirmation logic was invented — this is the
same generic Liquidity Engine status transition that already existed,
now evaluated continuously instead of once per (unreliable) cron cycle.

## Phase G — TradingView preparation

`POST /api/tradingview/webhook` exists as a route and returns `501`. No
secret validation, no schema validation, no event-store write happens —
see [`TRADINGVIEW_INTEGRATION_PLAN.md`](TRADINGVIEW_INTEGRATION_PLAN.md)
for the full design once it's actually built. The route exists so the
server's shape doesn't need to change later, not because it does anything
yet.

## Real TwelveData verification — an honest gap

Everything above was tested against **local mock TwelveData REST and
WebSocket servers** (protocol-correct: same request/response shapes, same
subscribe/price message flow), not against the real TwelveData API with
real credentials. This was deliberate — the real `TWELVEDATA_API_KEY` is a
GitHub Actions secret this session cannot read, and asking Daniel to paste
it into chat just to test would undermine the "never commit/expose it"
principle this build otherwise enforces everywhere else. The mocks prove
the *code* is correct (parsing, filtering, reconnect logic, event
classification, API responses); they cannot prove TwelveData's real API
behaves exactly like the mock in every edge case. First real-world
verification will happen either via a local run with the real key (never
via chat) or once a hosting decision is made and the server is actually
deployed.

## Local testing summary

- REST module: quote + candle fetch against a mock server, correct parsing,
  correct chronological sorting, correct "scan forward for a real candle"
  filtering, correct session-range grouping, and correct (key-free) error
  propagation on a simulated TwelveData error response.
- WebSocket module: connect/subscribe/stream, clean disconnect, and abrupt
  connection-loss reconnect with correct backoff timing.
- Candle scheduler: boundary math verified for all 7 timeframes including
  rollovers.
- Market state: full end-to-end run of the real `server/index.js` against
  both mocks — all 7 timeframes loaded, WebSocket streaming, all four API
  endpoints returning correct data, no secret in any response.
- Event pipeline: the corrected two-tier diffing verified to catch a
  sweep-and-reversal spanning two ticks inside one debounce window.
- Frontend: both operating modes (no server configured / configured and
  reachable) verified via Playwright, including the "LIVE only when the
  WebSocket is truly connected" constraint under a simulated WS-down/
  REST-still-fine scenario, and a full regression pass confirming every
  existing dashboard card still renders correctly.
