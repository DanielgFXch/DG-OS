# DG OS Market Brain — Architecture

The Market Brain is the **data layer** of DG OS. It knows real, live facts
about XAUUSD — price, session, ranges, opens — and makes **no trading
decisions**. The Daniel Decision Engine (built later, once
[`rules/strategy.md`](../rules/strategy.md) is filled in with Daniel's actual
rules) will consume Market Brain output. It never talks to the data provider
directly, and the Market Brain never invents a trading opinion.

Full vision context: [`VISION.md`](VISION.md).

## System tree (target architecture)

```
Market Brain              (data layer — this document)
├── Live Data             done   — Module 1
├── Sessions               done   — Module 3
├── Premium / Discount     done   — Module 4
├── HTF Bias               done   — Module 5 (structural proxy only)
├── Liquidity              planned
├── POIs                   planned
├── Order Blocks           planned
├── FVG                    planned
└── Confirmation           planned

Daniel Brain               (applies rules/strategy.md — not started)
├── Decision Engine        planned — replaces the simulated computeDecision()
├── Scenario Engine        planned
└── Risk Engine            planned

System                     (not started)
├── Alerts                 planned — server-side push, beyond the manual Telegram button
├── Reports                planned
├── Learning                planned
└── Statistics              planned
```

Every module in Market Brain is built to be **read by**, never **bypassed
by**, everything above it. Daniel Brain and System never fetch data or talk
to TwelveData directly — they read `MarketBrain.*` (see `app.js`).

## Data flow

```
TwelveData API (server-side key, GitHub Secret)
  -> .github/workflows/market-data.yml   (scheduled, every 15 min)
  -> data/market.json                     (deployed straight to Pages, gitignored)
  -> app.js loadMarketData()              (client, no API key needed for this path)
  -> dashboard UI
```

A second, optional path exists for sub-minute price ticks: the browser can
open a direct WebSocket to TwelveData once Daniel enters his own API key
client-side (see `openTdSocket()` in `app.js`). That path only ever updates
`price`/`change` — ranges and opens still come from the 15-min JSON baseline.

## Robustness pattern: "scan forward for a real candle"

TwelveData emits a daily/weekly/monthly bar for every calendar period,
**including periods with no real trading** (e.g. weekend days get a flat,
carried-forward placeholder candle instead of being omitted). Naively trusting
`values[0]` produces a misleadingly flat range around any period boundary.

Every OHLC fetch in the Market Brain instead fetches a few recent bars
(`outputsize` > 1) and scans forward for the first one whose range is a
meaningful fraction of price:

```
(high - low) / close > 0.001   # i.e. > 0.1% — anything under this is treated
                                # as a non-trading placeholder, not a real bar
```

This is intentionally provider-agnostic and period-agnostic — the same jq
filter is reused for daily, weekly, and monthly candles (see
`market-data.yml`). Any future module that fetches a new OHLC period should
reuse this exact pattern rather than assuming index 0 is always valid.

## Session Engine (Module 3) — reusable session model

Sessions are modeled once, generically, both server-side and client-side —
never as three copy-pasted Asia/London/NY blocks:

- **Server-side** (`market-data.yml`): one shared hourly fetch
  (`interval=1h&outputsize=72&timezone=UTC`, 72h so a Sunday/Monday run can
  still reach back to Friday's sessions across the weekend) feeds a single jq
  `session_range(startHour; endHour; price)` function, called once per
  session with its own UTC hour window. It groups candles by calendar day,
  then applies the *same* "scan forward for a real candle" pattern as
  daily/weekly/monthly — but per session-occurrence instead of per calendar
  day, using a smaller 0.05%-of-price threshold (session ranges are
  naturally smaller than daily ranges, so the daily 0.1% cutoff would risk
  rejecting a real-but-quiet session). Known limitation: a genuinely real
  but very quiet session start could in theory still fall under the
  threshold and get skipped in favor of the prior day — acceptable given
  gold's typical intra-session volatility, but worth remembering if a
  session ever shows a suspiciously old date.
- **Client-side** (`app.js`): a single `SESSIONS` config
  (`[{id, name, startHour, endHour}, ...]`) drives everything — window
  math (`sessionWindowToday`), live status (`sessionStatus`: upcoming /
  active / closed, pure function of the current UTC clock, no data
  dependency), card rendering (`renderSessionCards`), and data binding
  (`updateSessionData`). Adding a fourth session (e.g. Sydney) means adding
  one entry to `SESSIONS` — no new functions.
- Fields reserved for later, deliberately **not** in the UI yet (no dummy
  features): each session's sweep/manipulation/expansion flags. Those
  belong to the Liquidity Engine once it exists and will attach to the same
  per-session object rather than inventing a parallel structure.

## Premium / Discount Engine (Module 4) — reusable zone model

Client-side only, no new API call — recomputed from ranges already in
`MarketBrain.liveData` (and re-evaluated instantly on every WebSocket price
tick, not just every 15 min). Returns a **full object per timeframe**, never
just a boolean, via `computeZoneForRange(price, high, low)`:

```js
{
  high, low, range, equilibrium,       // the reference range itself
  price,                                // current price at evaluation time
  distanceToEq, distanceToEqPercent,    // signed — negative means below EQ
  zone,                                  // 'premium' | 'discount' | 'equilibrium'
  isPremium, isDiscount, isEquilibrium   // convenience booleans for consumers
}
```

`computePremiumDiscount(data)` returns `{daily, weekly, monthly}` — one such
object per range, since "premium/discount" is meaningless without saying
*relative to which range*. A ±3% band around the midpoint (`EQUILIBRIUM_BAND_PERCENT`)
counts as `'equilibrium'` rather than forcing every price into premium or
discount. Once an Order Block/swing-based "dealing range" exists, add it as
a fourth key (e.g. `dealingRange`) rather than replacing daily/weekly/monthly.

## HTF Bias Engine (Module 5) — structural proxy, not Daniel's rules

Also client-side, also re-evaluated on every price tick. `computeHTFBias(data)`
returns:

```js
{
  bias,              // 'bullish' | 'bearish' | 'mixed'
  confidence,         // 0-100, % of timeframes (daily/weekly/monthly) agreeing
  trendStrength,       // 0-100, avg. |price-open|/range across timeframes, capped
  reason,              // e.g. "Daily > Open · Weekly > Open · Monthly < Open"
  lastBOS,             // reserved, always null until a Structure Engine exists
  currentStructure      // reserved, always null until a Structure Engine exists
}
```

**Explicitly not** Daniel's real bias methodology — that depends on
`rules/strategy.md` and belongs to the Daniel Decision Engine once it's
built. This is a mechanical, fully transparent proxy (price vs. opens across
timeframes) so the dashboard has *something real* to show instead of nothing,
without ever pretending to be smarter than it is. `lastBOS`/`currentStructure`
are intentionally left `null` rather than faked — no dummy features.

## MarketBrain aggregator (`app.js`)

```js
const MarketBrain = { liveData, sessions, premiumDiscount, htfBias };
```

One shared object, populated by `loadMarketData()` and kept live-reactive by
`refreshDerivedModules()` (called after every JSON refresh *and* every
WebSocket tick). Every module in this document reads from and writes to this
object — nothing reaches into `data/market.json` directly except
`loadMarketData()` itself. Future modules (Liquidity, POIs, Order Blocks,
FVG, Confirmation) should add their own key here (e.g. `MarketBrain.liquidity`)
and a `computeX(data)` + `renderX(x)` pair, following the same shape as
Modules 4-5.

## `data/market.json` schema (grows module by module)

| Module | Status | Fields added |
|---|---|---|
| 1 — Live price + daily range | done | `price`, `dailyOpen`, `dailyHigh`, `dailyLow`, `barDate`, `previousClose`, `changePercent`, `isMarketOpen` |
| 2 — Weekly/monthly range | done | `weeklyOpen`, `weeklyHigh`, `weeklyLow`, `weekBarDate`, `monthlyOpen`, `monthlyHigh`, `monthlyLow`, `monthBarDate` |
| 3 — Session ranges (Asia/London/NY) | done | `sessions.{asia,london,ny}.{high,low,date}` |
| 4 — Premium/Discount | done | *(client-derived, not in market.json — see above)* |
| 5 — HTF Bias | done | *(client-derived, not in market.json — see above)* |

Every field is either real (fetched, with a freshness check) or absent —
never fabricated. The frontend must keep showing "OFFLINE DEMO" / `—` for
anything it can't back with real data, per the project's non-negotiable
build rule (see `CLAUDE.md`).

## Engine roadmap (future modules, not yet built)

Once the Market Brain is complete and stable, later engines will be built
**on top of it**, never bypassing it to fetch data on their own:

- **Liquidity Engine** — sweep detection off Market Brain's session/daily/weekly highs & lows
- **POI Engine** / **Order Block Engine** / **FVG Engine** — structural analysis modules
- **Confirmation Engine** — entry-trigger detection (engulfing, displacement, CHOCH, …)
- **Alert Engine** — decides *when* something is worth a Telegram push (not just "sends messages")
- **Learning Engine** — statistics/pattern recognition over historical performance, never redefines rules
- **Performance Engine** — win-rate, RR, reports (daily/weekly/monthly/quarterly/yearly)

The **Daniel Decision Engine** (WAIT/WATCH/READY, `computeDecision()` in
`app.js`) sits above all of these — it applies `rules/strategy.md` to
whatever the engines below it observe. It is being deliberately built last.
