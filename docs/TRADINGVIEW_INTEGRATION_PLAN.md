# TradingView Integration Plan

**Status:** architecture only — nothing in this document is implemented. No
webhook endpoint exists, no server receives HTTP requests, no code in this
repository talks to TradingView. This is deliberate: a real webhook needs an
always-on, publicly reachable HTTP host, and that infrastructure decision
hasn't been made yet (see "Why nothing is built yet" below). Writing the
plan now means the eventual build is a known, reviewed shape instead of an
improvised one.

## Why this exists

DG OS has exactly one market data source today: TwelveData, fetched on a
15-minute cron (see `docs/MARKET_BRAIN.md`, "Event Store & Ingest
Pipeline"). That's enough to compute H1-level structure, liquidity, and POI
facts, but it has two real limits TradingView could help with:

1. **No lower-timeframe data.** DG OS only fetches `1h` candles. M1/M5
   structure events (which Daniel explicitly asked about) would need a new,
   costlier TwelveData fetch — or could instead come from a Pine Script
   already running on the timeframe Daniel actually watches on his own
   chart.
2. **No continuous, real-time detection.** The ingest pipeline runs once
   per 15-minute cron cycle. TradingView's alert engine evaluates every bar
   close (or every tick, depending on alert settings) regardless of DG OS's
   own schedule — a fundamentally different, complementary cadence.

TradingView is being added as a **second detection source**, not a
replacement for TwelveData, and not a decision-maker. The boundary is exact:

```
MARKET DATA SOURCE (TwelveData)  →  continuous OHLC / price
TRADINGVIEW                       →  strategic event detections (alerts/webhooks)
DG OS                             →  merges both into ONE Event Store / Market State
```

TradingView delivers **facts** ("price swept Asia Low"). It never delivers
**decisions**. Interpretation — whether a fact matters, what it implies,
what to do about it — stays exclusively with the (still unbuilt) DG Trading
Brain, exactly the same separation the Daniel Decision Engine already
enforces between Market Brain facts and `rules/strategy.md` rules. Nothing
in this plan changes that boundary; it just adds a second place facts can
come from.

## Why nothing is built yet

A TradingView webhook is an inbound HTTP request. DG OS today has no
process that can receive one:

- **GitHub Pages** (the frontend host) serves static files only — it cannot
  accept a `POST` request at all.
- **GitHub Actions** (`market-data.yml`, the closest thing to a backend DG
  OS has) is a *scheduled batch job*. It runs, does its work, and exits —
  it is not a listening server and cannot receive a webhook the moment
  TradingView sends one.

Building the real endpoint therefore requires the same "always-on host"
decision the [`DG_OS_V2_AUDIT.md`](DG_OS_V2_AUDIT.md) already flagged as
open (Recommended V2 Architecture, Layer 1) — a small persistent process or
a serverless function platform, deliberately not chosen there and not
chosen here either. This plan is written so that decision, whenever it's
made, has a concrete spec to implement against rather than starting from
scratch.

**A possible bridge, not a recommendation:** GitHub's `repository_dispatch`
API can be called by a small relay (e.g. Zapier/Make, or a one-line
Cloudflare Worker) to trigger a `workflow_dispatch`-style Action run from an
external HTTP call, without standing up a real server. This *could* get
TradingView events into `state/events.jsonl` sooner, but it inherits GitHub
Actions' cold-start latency (tens of seconds, not real-time), adds a
third-party relay as a dependency, and still can't do synchronous
request/response (secret validation failures, duplicate detection, etc.
would have to happen inside the triggered workflow run, after the fact,
not at the moment of receipt). Noted here as an option, not proposed as the
actual solution.

## Architecture (target, once an always-on host exists)

```
┌──────────────────┐        ┌──────────────────────────┐
│   TradingView     │ POST   │  Webhook receiver          │
│   Pine Script      │──────▶│  POST /api/tradingview/    │
│   alert()           │        │  webhook                    │
└──────────────────┘        │  1. validate secret          │
                               │  2. validate JSON schema      │
                               │  3. validate eventType         │
                               │     against events.js's        │
                               │     EVENT_CATEGORY vocabulary    │
                               │  4. normalize into internal event │
                               │     shape (marketBrain.js/events.js│
                               │     conventions — see Event Mapping)│
                               │  5. dedupe check (idempotency key)  │
                               └──────────────┬───────────────────┘
                                                │ append
                                                ▼
                               ┌───────────────────────────────┐
                               │  Event Store                    │
                               │  (state/events.jsonl today, or    │
                               │  its future DB successor —         │
                               │  see DG_OS_V2_AUDIT.md Phase 2/3)    │
                               │  every event carries source:         │
                               │  'tradingview' | 'marketBrain'         │
                               └───────────────────────────────┘
                                                │ read by
                                                ▼
                               DG Trading Brain / Alert Layer / Query Layer
                               (all unbuilt — this plan stops at the store)
```

The receiver is intentionally described as "a webhook receiver," not a
specific product — it could be the same always-on process that eventually
runs `scripts/ingest.js` continuously (Phase 3 of the audit's migration
plan), sharing the same `marketBrain.js`/`events.js` code, or a separate
small function. Either way it writes into the **same** Event Store
`scripts/ingest.js` already writes into today, using the **same** event
shape (`{type, category, at, payload}`, see `events.js`) plus one new field
(`source`) — not a parallel, second event system.

## Webhook Flow

1. Pine Script condition fires → `alert()` sends the configured message
   (a JSON string, see Payload Schema) to the webhook URL configured in
   TradingView's alert dialog.
2. Receiver gets the `POST`, reads the raw body.
3. **Secret check** (see Security below) — reject immediately on failure,
   no further processing, no detail in the response body.
4. **Schema validation** — required fields present and correctly typed;
   reject with `400` otherwise (see Fehlerbehandlung).
5. **`eventType` validation** — must be one of the event types already
   defined in `events.js`'s `EVENT_CATEGORY` map. Unknown types are
   rejected, not silently stored — the Event Store's vocabulary is closed
   by design (see `docs/MARKET_BRAIN.md`), and an unrecognized string is
   far more likely a Pine Script typo than a new legitimate event.
6. **Normalize** — map the TradingView payload onto the same event object
   shape `classifyMarketEvents()` already produces internally, adding
   `source:'tradingview'`.
7. **Dedupe check** — compute an idempotency key (see Duplicate Protection)
   and skip (`200`, no-op) if an event with that exact key was already
   stored recently.
8. **Append** to the Event Store, tagged with its category (from the same
   `EVENT_CATEGORY` lookup `events.js` already uses — see Event Mapping for
   why TradingView events are always `'trading'`, never `'context'`).
9. Respond `200` once persisted. No trading decision is made in this
   request — the response only confirms "recorded," never "acted on."

## Payload Schema

Base shape, exactly as specified:

```json
{
  "source": "tradingview",
  "symbol": "XAUUSD",
  "timeframe": "5m",
  "eventType": "ASIA_LOW_SWEPT",
  "price": 4359.20,
  "timestamp": "2026-08-14T10:15:00Z",
  "metadata": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string | yes | Must be exactly `"tradingview"` — the receiver sets/verifies this, doesn't trust it blindly, so a future second webhook source can't spoof it. |
| `symbol` | string | yes | Must resolve to `"XAUUSD"` (DG OS is single-symbol today — see `docs/DG_OS_V2_AUDIT.md`). Reject anything else with `400`, don't silently ignore. |
| `timeframe` | string | yes | Free-form (`"1m"`, `"5m"`, ...) — stored as metadata on the event, not used for classification. Useful later for distinguishing "which chart detected this." |
| `eventType` | string | yes | Must be a key in `events.js`'s `EVENT_CATEGORY`. See Event Mapping. |
| `price` | number | yes | The price at the moment of detection — becomes the event's `payload.price`, same field name the existing internal events already use (e.g. `LIQUIDITY_SWEPT`'s payload). |
| `timestamp` | string (ISO 8601, UTC) | yes | See Timestamp Handling — this is the market event's own time, not necessarily the same as receipt time. |
| `metadata` | object | no | Free-form bag — Pine Script version, strategy/indicator name, bar index, anything Daniel's Pine code wants to attach. Never used for classification or dedup, purely descriptive, same spirit as the existing `payload` fields on internal events. |
| `secret` | string | yes (not in the example, but required) | Shared-secret token — see Security. Stripped before the event is ever logged or stored, never echoed back in a response. |

A required `secret` field was added beyond Daniel's example payload — see
Security below for why it has to travel inside the JSON body rather than as
an HTTP header.

## Security / Secret Validation

TradingView's webhook delivery (on most plans) POSTs a plain JSON body with
no custom HTTP headers and no built-in HMAC signing — the entire "message"
Pine Script's `alert()` sends *is* the request body, and that's the only
place a shared secret can travel. Plan:

- A secret token (generated once, stored the same way `TWELVEDATA_API_KEY`/
  `TELEGRAM_BOT_TOKEN` are today — as a secret on whatever host runs the
  receiver) is embedded as a `secret` field inside the Pine alert's JSON
  message.
- The receiver compares it using a constant-time comparison (never `===`
  on secrets — timing attacks are a real, cheap risk on a public endpoint).
- Defense in depth, if the hosting platform supports it: an unguessable
  token embedded in the endpoint path itself (e.g.
  `/api/tradingview/webhook/<random-token>`), so even a request that
  somehow bypasses body validation still needs the right URL.
- **The webhook URL (with any path-embedded token) is visible in
  TradingView's alert configuration UI** — anyone with edit access to that
  alert can see it. Rotate the secret if that access ever needs revoking
  (e.g. a shared/former device), the same operational assumption already
  documented for the TwelveData WebSocket key in `README.md`.
- Error responses never include the secret, the payload, or any detail
  that would help an attacker iterate (see Fehlerbehandlung).

## Duplicate Protection

TradingView is known to re-fire alerts — on delivery retry after a
non-2xx response, or when a Pine condition stays true across multiple bar
updates without `alert.freq_once_per_bar_close` configured. Two layers:

1. **Pine-side discipline** (documented for whoever writes the scripts,
   not enforced by DG OS): alerts should use "Once Per Bar Close"
   frequency, not "Once Per Bar" or "All", for anything that isn't
   inherently a single-tick event.
2. **Server-side idempotency key**, mandatory regardless of Pine-side
   discipline (since it can't be trusted to always be configured
   correctly): a deterministic key derived from
   `(source, symbol, eventType, timeframe, timestamp rounded to the
   bar)`, following the exact same principle Phase 1's `poiId()`/
   `structureId()` already established for internal events — same inputs,
   same key, every time. An incoming event whose key already exists in the
   recent event log is accepted with `200` but not stored again (not an
   error — TradingView's retry behavior is normal and expected, not a
   client mistake).

## Timestamp Handling

Pine Script offers two different "time" placeholders, and they mean
different things: `{{time}}` is the current bar's *open* time; `{{timenow}}`
is the server-side time the alert actually fired, which can lag the true
market event depending on Pine's execution/queueing. Neither is
"when the webhook arrived," which is a third, later timestamp again (network
+ TradingView's own delivery queue).

Plan:
- Pine alerts should always populate `timestamp` explicitly (via
  `{{timenow}}` or an equivalent formatted string) — the event's own
  claimed time, not left for the receiver to infer.
- If `timestamp` is missing or unparseable, the receiver falls back to
  its own receipt time — and marks `metadata.timestampSource:"received"`
  on the stored event, so it's honestly distinguishable from a real
  Pine-reported time. Same honesty precedent already established:
  `state/events.jsonl` entries carry an `ingestedAt` field distinct from
  the event's own `at`, precisely so "when we found out" and "when it
  happened" are never conflated.
- The receiver does not attempt clock-skew correction or reject events
  with an implausible timestamp (e.g. far in the future) beyond basic
  parseability — that's a monitoring/alerting concern for later, not a
  webhook-layer decision.

## Event Mapping

TradingView-sourced events use the **exact same vocabulary**
`events.js`'s `EVENT_CATEGORY` already defines — no separate "TradingView
event" type system. This is deliberate: the Alert Layer, the Query Layer,
and anything else built later reads one event vocabulary regardless of
which detector (TwelveData-derived or TradingView-derived) produced a given
event.

One structural fact worth stating explicitly: **every TradingView event is
`category: 'trading'`, never `'context'`.** The context/trading split (see
`docs/DG_OS_V2_AUDIT.md`, "Event classification") exists to keep passive
existence (a session level merely forming) separate from something actually
happening. TradingView's alert model only fires on conditions — there's no
Pine equivalent of "a level silently came into being" that would need
suppressing; every alert TradingView sends is, by construction, something
happening. So `ASIA_LOW_SWEPT` from TradingView and `ASIA_LOW_SWEPT` from
`scripts/ingest.js` land in the Event Store identically classified,
distinguished only by `source`.

Required schema addition when this is actually built: every stored event
(TradingView-sourced or not) needs a `source` field. Internally-produced
events don't have one today (`scripts/ingest.js` doesn't tag them) — adding
`source:'marketBrain'` to those at the same time keeps the schema
consistent rather than TradingView being a special case.

## Fehlerbehandlung (Error Handling)

| Condition | Response | Notes |
|---|---|---|
| Missing/invalid `secret` | `401`, generic body (`"unauthorized"`) | No hint about *why* it failed — don't help an attacker narrow it down. |
| Malformed JSON | `400`, generic body | TradingView's alert message editor makes malformed JSON a real, common Pine-authoring mistake — worth a clear message in server-side logs, but not in the response. |
| Missing required field | `400`, names the missing field | Safe to be specific here — this is a configuration bug in Daniel's own Pine Script, not an attack surface once past the secret check. |
| `symbol` ≠ `"XAUUSD"` | `400` | DG OS is single-symbol; reject rather than silently ignore, so a misconfigured alert is loud, not silently dropped. |
| Unrecognized `eventType` | `400`, names the received value | Protects the Event Store's closed vocabulary — see Webhook Flow step 5. |
| Duplicate (idempotency key already seen) | `200`, no-op | Not an error — expected TradingView retry behavior, see Duplicate Protection. |
| Store write failure (Event Store unavailable) | `500` | TradingView retries automatically on non-2xx; safe because of the idempotency key — a retried delivery after a transient failure is a normal duplicate, not a double-write. |
| Excessive request rate from one secret/IP | `429` (recommended, not yet specced in detail) | Protects against a misconfigured Pine Script alerting every tick instead of once per bar close. |

## Which events are better sourced from TradingView

- **M1/M5 structure events** — BOS/CHOCH, swing points, on timeframes DG OS
  doesn't fetch from TwelveData today (only H1). Cheaper to detect on a
  chart Daniel's already watching than to add a new, costlier TwelveData
  fetch and re-run the Structure Engine on a second candle series.
- **Engulfing Confirmation / Displacement on sub-H1 timeframes** —
  `marketBrain.js` already has generic detectors for these
  (`detectEngulfingCandles`, `detectDisplacementCandles`), but only over
  the H1 series it has. A Pine equivalent running on M1/M5 covers ground
  the current data pipeline structurally can't, without a new API
  integration.
- **Any future Daniel-specific Pine indicator** — if Daniel ever encodes
  part of his own visual pattern recognition as a Pine Script (something
  easier to express by drawing/coding directly on the chart than to
  re-derive purely from OHLC math), TradingView is the natural source —
  DG OS should consume it as a fact, not attempt to reimplement the same
  logic independently.

## Which events are better computed directly from Market Data

Everything the existing pipeline already computes correctly, for free,
without a third-party dependency:

- **Session High/Low Touch/Sweep** (Asia/London/NY) — Liquidity Engine,
  real today.
- **H1 Fair Value Gap / Order Block Touch** — POI Engine, real today.
- **H1 BOS/CHOCH** — Structure Engine, real today.
- **Zone Reaction** — `detectZoneReaction()`, real today (and the bug fixed
  in Phase 1 makes it trustworthy for this purpose).

These stay authoritative from TwelveData/`marketBrain.js`. Duplicating them
via TradingView would add a second, less reliable path (dependent on
TradingView's alert delivery uptime and Daniel keeping a chart/alert
correctly configured) for something DG OS already computes deterministically
and for free from data it already has. If both a TradingView alert and the
internal detector ever fire for the "same" real-world event, the dedup
layer (Duplicate Protection) treats them as distinct events by design (they
have different `source` values) rather than silently merging them — a
disagreement between the two is itself useful signal, not noise to hide.

## What this plan deliberately does not decide

- **Hosting platform** for the webhook receiver (serverless function,
  small VPS process, etc.) — tied to the broader always-on-host decision
  from `docs/DG_OS_V2_AUDIT.md`, not made here.
- **Exact Pine Script code** for any of the listed alert types — the table
  above describes what each alert should communicate and roughly how
  (bar-close-based, JSON `alert_message`, explicit timestamp), not
  finished, ready-to-paste Pine source. Writing that is implementation,
  not planning, and depends on the DG-specific version of each concept
  once `rules/strategy.md`'s corresponding chapters are actually filled
  in — a generic Pine "session sweep" alert is the same kind of
  placeholder architecture as the existing FVG/Order Block detectors, not
  Daniel's real rule.
- **Rate limits, monitoring, and alerting on the receiver itself** —
  flagged as needed (see Fehlerbehandlung's `429` row) but not specced in
  detail; a concern for whoever implements the receiver, informed by
  the actual hosting choice.
