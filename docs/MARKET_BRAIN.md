# DG OS Market Brain — Architecture

The Market Brain is the **data layer** of DG OS. It knows real, live facts
about XAUUSD — price, session, ranges, opens — and makes **no trading
decisions**. The Daniel Decision Engine (built later, once
[`rules/strategy.md`](../rules/strategy.md) is filled in with Daniel's actual
rules) will consume Market Brain output. It never talks to the data provider
directly, and the Market Brain never invents a trading opinion.

Full vision context: [`VISION.md`](VISION.md).

## DG methodology — technical foundation, not the finished DG version

**Every module below is currently a generic/structural implementation, not
Daniel's DG-specific version of that concept.** Per the permanent project
rule in [`CLAUDE.md`](../CLAUDE.md#dg-methodology--not-ict-not-generic-smart-money):
DG OS digitizes Daniel Gomes' own way of reading the market — not ICT, not
generic Smart Money Concepts, not a TradingView-style indicator set. The
Liquidity Engine, Fair Value Gap detector, Order Block detector, and HTF
Bias documented here are real, working technical infrastructure — genuine
detection on genuine data — built so each one can be adapted step by step
into **DG Liquidity**, **DG Valid FVG**, **DG Order Block**, and **DG HTF
Bias** once Daniel defines the exact rules for each in
[`rules/strategy.md`](../rules/strategy.md). Until then: never invent or
approximate a generic trading rule as a stand-in for an undefined DG rule —
prepare the architecture and wait, same as the Decision Engine already
does.

## System tree (target architecture)

```
Market Brain              (data layer — this document)
├── Live Data             done   — Module 1
├── Sessions               done   — Module 3
├── Premium / Discount     done   — Module 4
├── HTF Bias               done   — Module 5 (structural proxy only)
├── Liquidity              done   — Module 6 (level status, no decision/alert)
├── POIs                   in progress — Module 7, Stage 2/4 (Fair Value Gap + Order Block detection; 6 types still planned)
└── Structure              in progress — Module 9 (Swing High/Low, HH/HL/LH/LL, BOS/CHOCH, internal + external; pure detection, no decision)

Daniel Brain               (applies rules/strategy.md — in progress)
├── DG Confidence Engine   in progress — Module 8 (contribution-score architecture; no decision/alerts/entries yet)
├── Decision Engine        in progress — Module 10, "Daniel Decision Engine" (WAIT/WATCH/READY/INVALID architecture; always WAIT today, zero DG rules defined)
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

Module numbers (Module 1, 6, 8, 9, ...) track **build order**, not
architectural layer — Module 9 (Structure Engine) is Market Brain data,
built chronologically after Module 8 (DG Confidence Engine, Daniel Brain),
because that's the order Daniel asked for them. `app.js` places the code
next to the other Market Brain modules regardless of build order, for
readability.

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

## Liquidity Engine (Module 6) — level status, not a trading decision

Also client-side, also re-evaluated on every price tick — no new API call.
This is one of the most important modules in DG OS: the Daniel Decision
Engine, Alert Engine, Reports, and Learning Engine will all eventually read
`MarketBrain.liquidity` rather than touching ranges directly. It deliberately
stops at *status*, nothing more — **no sweep alerts, no confirmation, no
trading opinion live here.**

`computeLiquidityEngine(data)` returns a flat array of 12 level objects (not
nested by category — a flat list is what every future consumer, from a
table renderer to an alert loop, actually wants to iterate):

```js
{
  id, label,               // e.g. 'dailyHigh', 'Daily High'
  type,                     // 'high' | 'low'
  timeframe,                 // 'Daily' | 'Weekly' | 'Monthly' | 'Asia Session' | 'London Session' | 'New York Session'
  period,                    // reference date/period this level belongs to, or null
  price,                      // the level's price, or null if unavailable
  status                       // 'active' | 'touched' | 'sweeped' | 'invalid'
}
```

**Config-driven**, exactly like `SESSIONS` (Module 3): `LIQUIDITY_LEVEL_DEFS`
is a 12-entry array describing where each level's price/period come from
(either a top-level `market.json` field, or a `MarketBrain.sessions.*`
sub-object). Adding a 13th level later — Sydney High/Low, a prior-week's
value area, whatever — means adding one entry, not a new function.

**Status logic — the key insight**: comparing live price against a level
works correctly *regardless* of whether the reference period is still
forming or already closed, with no separate "is this period closed" check
needed at all:

- A level from a period **still forming** (today's daily high, right now)
  mathematically can never be `sweeped` by construction — the level itself
  keeps extending as price prints a new high/low, so it can only be
  `active` or `touched`.
- A level from a period **already closed** (yesterday's daily high, a
  finished London session, or a weekend's carried-forward placeholder) is
  where a genuine sweep becomes observable — price can trade through it.

Both cases run through the exact same `computeLiquidityStatus(levelPrice,
type, currentPrice)` comparison; no branch distinguishes "closed" from
"forming". `LIQUIDITY_TOUCH_PERCENT` (0.05% of current price) defines how
close price must get to a level to count as `touched` rather than merely
`active`. `invalid` means the underlying price is genuinely missing (e.g.
London session hasn't started yet this run) — an honest gap, not a
trading-invalidation concept, which would require rules not yet available.

## POI Engine (Module 7) — Stage 2/4: Erkennung (Fair Value Gap + Order Block)

Four explicit stages, one build at a time: **1. Architecture** (v0.12.0,
done) → **2. Erkennung** (detection — Fair Value Gap in v0.13.0, Order Block
in v0.14.0, six types still to go) → **3. Bewertung** (cross-module scoring)
→ **4. Verbindung mit der Daniel Decision Engine**.

Unlike Modules 4-6, POIs are meant to become DG OS's **memory**, not a
disposable UI drawing — the future Daniel Decision Engine, Alert Engine,
Reports, and Learning Engine will all read `MarketBrain.pois` the same way
they'll read `MarketBrain.liquidity`.

**POI object shape** — every field below is guaranteed present (or
explicitly `null`) on every POI, assembled by a single `createPOI()`
factory so no detector improvises its own shape:

```js
{
  id, type,                    // e.g. 'fvg' | 'orderBlock' — one of POI_TYPE_DEFS ids
  direction,                    // 'bullish' | 'bearish' | null
  priceHigh, priceLow,           // the POI's price range
  timeframe,                      // e.g. 'H1' — whichever the detector used
  createdAt,                       // ISO timestamp — market time of formation if known, else detection time
  status,                            // 'fresh' | 'mitigated'
  strength,                           // 0-100, reserved for Stage 3 (cross-module scoring)
  confidence,                          // 0-100, intrinsic to the detector's own pattern (see below)
  reason,                               // why this POI was created
  sourceCandle,                          // Entstehungskerze — the raw OHLC candle that formed it
  impulseSize,                            // Impulsgröße — price distance the move traveled away from the zone (null if n/a)
  displacement,                            // { candle, range, avgRange, ratio } — the displacement evidence (null if n/a)
  structureReference,                       // reserved for a future BOS/CHOCH Structure Engine — always null right now
  mitigationDetail,                          // reserved for a future nuanced mitigation flag (body-close vs. wick, % filled) — always null right now
  relatedLiquidity,                           // ids into MarketBrain.liquidity, filled by enrichment
  relatedSession,                              // 'asia' | 'london' | 'ny' | null, filled by enrichment
  relatedHTFBias,                               // MarketBrain.htfBias.bias snapshot, filled by enrichment
  premiumDiscountZone                            // zone snapshot, filled by enrichment
}
```

`impulseSize`/`displacement` are populated by the Order Block detector
today; any future detector that has its own genuine notion of impulse or
displacement can populate them too, following the same meaning. FVGs leave
them `null` — honest absence, not a fabricated value.

### Hard modularity rule: detectors know nothing about other modules

Daniel's explicit instruction for this stage: *"Keine Detector-Funktion darf
Wissen über andere Module besitzen. Jeder Detector arbeitet unabhängig und
liefert nur seine Erkenntnisse an das Market Brain. Das Market Brain
bewertet später alles gemeinsam."* This is enforced structurally, not just
by convention:

- **`POI_TYPE_DEFS`** pairs each type with a `detect` function *and* an
  `input` selector. Only `input` (which runs in the aggregator) is allowed
  to know `MarketBrain`'s shape — it picks out the one raw slice (e.g. the
  H1 candle array) a detector needs.
- **A detector** (`detectFairValueGaps(candles)`, `detectOrderBlocks(candles)`,
  etc.) receives *only* that slice as its argument. It cannot reach
  `MarketBrain.liquidity`, `sessions`, or `htfBias` because it never has a
  reference to `MarketBrain` at all — not a discipline, a language-level
  guarantee.
- **Shared candle-math helpers** (`localAverageRange`, `isZoneMitigatedAfter`)
  are plain functions over a candle array, used by both detectors to avoid
  duplicating identical logic. This is ordinary code reuse *within* the POI
  Engine's own detection layer, not a dependency on another module — the
  rule is about MarketBrain/Liquidity/Sessions/HTF Bias, not about detectors
  sharing candle arithmetic with each other.
- **`enrichPOIContext(poi, brain)`** is the single place, in the
  aggregator, where a detected zone is correlated with the rest of the
  Market Brain — filling in `relatedLiquidity`, `relatedSession`,
  `relatedHTFBias`, `premiumDiscountZone`. It runs once per POI, after
  detection, regardless of which detector produced it, so every future
  detector gets this enrichment for free without writing a line of
  cross-module code itself.
- **`computePOIEngine(brain)`** ties it together: `rawList =
  POI_TYPE_DEFS.flatMap(def => def.detect(def.input(brain)))`, then
  `rawList.map(poi => enrichPOIContext(poi, brain))`.

### Fair Value Gap detector (`detectFairValueGaps`)

The first real Stage 2 detector, and the template for every one after it.
Classic 3-candle ICT imbalance on the H1 series: for chronological candles
`c0, c1, c2`, a **bullish** FVG exists when `c0.high < c2.low` — the
untraded space between them is the gap. A **bearish** FVG is the mirror
case, `c0.low > c2.high`. `c1`, the middle "displacement" candle whose range
actually created the imbalance, is stored as the POI's `sourceCandle`.

- **Confidence is intrinsic only** — gap size relative to the average
  candle range of the preceding 14 candles (`POI_ATR_WINDOW`, a simple
  local ATR). A gap as wide as the recent average range scores close to
  100; a sliver scores low. This says nothing about liquidity/session/bias
  confluence — that kind of cross-module weighting is explicitly Stage 3's
  job, not this detector's.
- **Status** is decided purely from the same candle array: `mitigated` once
  any later candle's range trades back into the gap, `fresh` otherwise. No
  external state, no other module consulted.

### Order Block detector (`detectOrderBlocks`)

Deliberately the *architecture* for the future "Daniel Order Block", not a
fully tuned SMC implementation — it identifies the zone structurally and
fills every field a later stage will need, without making a final trading
judgement. Definition: for chronological candles `obCandle = c[i-1]`,
`displacementCandle = c[i]` — `obCandle` is a **bullish** Order Block if it
is itself a down-close candle immediately followed by a genuine bullish
displacement candle: range ≥ `OB_DISPLACEMENT_RATIO` (1.5x) the local
average, closing in the outer third of its own range
(`OB_CLOSE_STRENGTH_MIN`, 0.66). **Bearish** is the mirror case.
`obCandle`'s own high/low becomes the zone — the standard "last opposite
candle before the move" starting definition, with no swing-point or BOS
confirmation yet; that belongs to a real Structure Engine, not this build.

- `sourceCandle` = the Order Block candle itself (`obCandle`).
- `displacement` = `{ candle: displacementCandle, range, avgRange, ratio }`
  — the structural evidence that justified calling it a displacement.
- `impulseSize` = how far price actually traveled away from the zone (the
  displacement candle's far edge minus the zone's near edge).
- `confidence` blends two intrinsic, bounded components: how many multiples
  of the local average range the displacement candle was (capped at 3x),
  and how strongly it closed toward its extreme — again nothing about
  liquidity/session/bias.
- `structureReference` and `mitigationDetail` stay explicitly `null` — they
  need a Structure Engine (BOS/CHOCH) and a more nuanced mitigation model
  that don't exist yet, so they are left honestly empty rather than faked.

### Where the candles come from

`data/market.json` carries `candles.h1`: the same 72-hour hourly fetch the
Session Engine (Module 3) already pulls, reused as-is with **no extra API
call** — sorted chronologically ascending (oldest first) server-side so no
detector has to trust or re-derive TwelveData's own ordering. See
`market-data.yml`'s `CANDLE_FILTER`. Both the FVG and Order Block detectors
read this same array.

### UI

The registry still always renders — "Aktiv" for Fair Value Gap and Order
Block now, "Erkennung folgt" for the other six — plus every detected zone
with its range, confidence, status, and enrichment context (session/bias/
zone/liquidity count, plus displacement ratio/impulse size where
applicable) inline. "Noch keine POIs erkannt." only appears when the list is
genuinely empty (e.g. stale/missing candle data) — never fabricated example
zones, same non-negotiable rule as every other module.

## Structure Engine (Module 9) — pure market structure

A Market Brain data module, built after Module 8 chronologically (see the
build-order note above the system tree) but a peer of Liquidity/POIs, not
part of Daniel Brain. Foundation for DG HTF Bias, the Daniel Decision
Engine, the Learning Engine, Reports, and Alerts — but this build is
**exclusively structure detection**. No trading decision, no alert, no DG
rule (every `rules/strategy.md` chapter is still TODO).

**Structure object shape** — every element, uniform regardless of type,
assembled by `createStructureElement()`:

```js
{
  id, type,           // 'swingHigh' | 'swingLow' | 'BOS' | 'CHOCH'
  label,                // 'HH' | 'LH' (swingHigh) | 'HL' | 'LL' (swingLow) | null
  price, createdAt, timeframe,
  direction,             // 'bullish' | 'bearish' | null
  structureType,          // 'internal' | 'external'
  status,                  // 'active' | 'broken' (swing points) | 'confirmed' (BOS/CHOCH)
  confidence,               // 0-100, intrinsic
  reason, sourceCandle, brokenLevel,
  relatedSession, relatedHTFBias   // filled by enrichment
}
```

Same modularity discipline as the POI Engine: `detectStructure(candles,
window, structureType)` only ever sees a plain candle array — never
`MarketBrain`, never Session/Liquidity/HTF Bias directly. `enrichStructureContext(el,
brain)` is the one place a structure element is correlated with the rest of
the Market Brain (session + current HTF Bias snapshot), run once per
element after detection, mirroring `enrichPOIContext()` exactly.

### Swing detection (the fractal pivot)

A candle is a **swing high** if its high exceeds every candle in a
`window`-sized neighborhood on both sides; a **swing low** mirrors that on
the low. Ties don't count (strict `<`) — a genuinely flat pivot is
conservatively skipped rather than guessed at. Each swing point is labeled
relative to the immediately preceding swing point of the *same* type: `HH`/`LH`
for highs, `HL`/`LL` for lows. The first point of a type has no prior to
compare against, so its label stays `null` — honest absence, not a guess.

### Internal vs. external structure

Rather than fetching a second timeframe, both are computed from the same H1
candle series with two different fractal window sizes:
`STRUCTURE_INTERNAL_WINDOW = 1` (3-candle fractal, minor/frequent swings)
and `STRUCTURE_EXTERNAL_WINDOW = 3` (7-candle fractal, major swings). A
standard, well-known technique for approximating multi-timeframe structure
from one series — not a DG rule, documented as such per the DG methodology.

### BOS / CHOCH

Walks the candles in chronological order tracking the most recent unbroken
swing high/low ("key levels") and the currently established bias. A close
beyond the key level *in the direction of* the existing (or not-yet-
established) bias is a **BOS** (continuation); a close beyond the key level
*against* the established bias is a **CHOCH** (character change) and flips
the bias. Once a key level is broken it's marked `'broken'` and never
refires — the next confirmed swing point of that type becomes the new key
level. `computeStructureEngine(brain)` exposes the resulting `internalBias`/
`externalBias` (`'bullish' | 'bearish' | null`) as a convenience summary —
the same mechanical signal a future DG HTF Bias could read directly, once
its chapter in `rules/strategy.md` is filled in.

Confidence is intrinsic only, reusing the same local-ATR pattern as the POI
Engine's `localAverageRange()`: for swing points, how far the pivot stands
out from its neighborhood relative to typical range; for BOS/CHOCH, how
decisively the close broke through the level relative to typical range.
Nothing about liquidity/session/bias confluence — that's later work.

### UI

New "Structure Engine" card: current internal/external bias at the top
(reusing the HTF Bias card's bullish/bearish color language), then every
detected element — label, price, confidence, session/bias context, status
pill — most recent first. "Noch keine Struktur erkannt." only appears when
genuinely empty.

## DG Confidence Engine (Module 8) — architecture only, the first piece of Daniel Brain

Sits directly above the Market Brain, not inside it — the first module of
the "Daniel Brain" tier from the system tree. Per the permanent [DG
methodology rule](../CLAUDE.md#dg-methodology--not-ict-not-generic-smart-money),
this is explicitly **not** a trading decision, **not** an alert, **not** an
entry, and it does not invent a weighting scheme pretending to be Daniel's
real rules — those don't exist yet. What it does today: give every Market
Brain module one uniform way to report *"how much clear, usable structural
signal do I currently have"* — nothing about a trade direction, nothing
about buy/sell. That's honestly answerable with zero DG rules defined, and
it's exactly the shape the later Daniel Decision Engine
(WAIT/WATCH/READY/HIGH PROBABILITY) will consume once those rules exist.

**Contribution shape** — every module's contribution, uniform regardless of
source:

```js
{
  id, label,     // which module this came from, e.g. 'htfBias' / 'HTF Bias'
  score,          // 0-100, or null if the module has nothing usable yet
  status,          // 'positive' | 'negative' | 'missing'
  reason            // one honest, factual sentence — never a trading opinion
}
```

- `'positive'` — this module currently has a clear, usable structural signal
  (e.g. HTF Bias is bullish/bearish with high confidence, most Liquidity
  levels are valid, a Premium/Discount zone is unambiguous, fresh
  high-confidence FVGs/Order Blocks exist).
- `'negative'` — the module has data, but it's weak, ambiguous, or
  conflicting (e.g. HTF Bias is `mixed`, all detected FVGs are already
  mitigated, Premium/Discount sits in equilibrium).
- `'missing'` — the module has no usable data yet at all (e.g. candles
  haven't loaded, no session has a real range yet).

**Config-driven, same pattern as `POI_TYPE_DEFS`**: `CONFIDENCE_CONTRIBUTORS`
is the entire surface a new module needs to touch to participate — one
entry, an `input` selector (the *only* place allowed to know
`MarketBrain`'s shape) and a `compute` function that only ever sees its own
module's already-computed output (never another module's, never raw
`data/market.json`). *"Neue Module müssen später nur ihren Score liefern.
Der Rest passiert automatisch."* Today's six contributors: Sessions,
Liquidity Engine, Premium/Discount, HTF Bias, Fair Value Gap, Order Block.

`computeDGConfidenceEngine(brain)` is the single aggregator — same
centralization pattern as `enrichPOIContext()` in Module 7:

```js
{
  confidence,        // 0-100 or null — simple average of every non-missing score, no invented weighting
  contributions,       // every contribution, in registry order
  positiveFactors,       // contributions filtered to status 'positive'
  negativeFactors,        // contributions filtered to status 'negative'
  missingFactors            // contributions filtered to status 'missing'
}
```

`confidence` is a plain, transparent average of whatever scores are
currently available — deliberately the simplest defensible aggregation,
not a fabricated DG-specific weighting. Once Daniel's real rules exist,
this formula is exactly what gets replaced — the contribution interface
around it does not need to change.

### UI

New "DG Confidence Engine" card: overall score, then three grouped lists
(Positive/Negative/Fehlende Faktoren), each factor showing its source
module and one-line reason. A group that's currently empty (e.g. no
negative factors right now) simply doesn't render — no fabricated
placeholder rows.

## Daniel Decision Engine (Module 10) — architecture only

Sits at the very top of Daniel Brain, above the DG Confidence Engine — the
module every future consumer (Telegram Alerts, Reports, Replay, the
Learning Engine, eventually Auto Trading) is meant to read instead of
touching Market Brain modules directly. This build is **exclusively the
architecture**: the full `DecisionState` data shape and an orchestration
layer that reads HTF Bias, Structure Engine, Liquidity Engine, POI Engine,
Premium/Discount, and the DG Confidence Engine — with no DG rules, no
entries, no alerts, and no invented trading logic.

**DecisionState shape** — the single object every future downstream module
will consume:

```js
{
  id, timestamp,
  state,                  // 'WAIT' | 'WATCH' | 'READY' | 'INVALID'
  confidence,               // pulled from MarketBrain.dgConfidence, never recomputed here
  reason,                    // one honest sentence explaining the state
  supportingModules,          // ids of modules with available data consistent with the current state
  missingModules,              // ids of modules with no data yet
  conflictingModules,           // pairs of available directional modules whose signals disagree
  metConditions,                 // DG rule conditions currently satisfied (empty until rules exist)
  unmetConditions,                // DG rule conditions currently unsatisfied, with why
  rulesStatus,                     // snapshot of DG_RULES_DEFINED at evaluation time
  moduleSnapshot                    // per-module {available, direction, summary} — full context for downstream consumers
}
```

`DECISION_STATES` documents what each of the four states *means* — WAIT (no
clearance / rules missing), WATCH (setup forming), READY (all defined DG
conditions met), INVALID (a previously-tracked setup the rules ruled out) —
without ever computing WATCH/READY/INVALID today, since no chapter of
`rules/strategy.md` is defined yet to justify them.

### Why the state is always WAIT right now

The Decision Engine must never own a trading rule — it only reads
`rules/strategy.md` (via `DG_RULES_DEFINED`, a hand-maintained mirror of
that file's Status-Übersicht — flip a chapter to `true` only when Daniel
has actually filled it in, exactly like `POI_TYPE_DEFS.implemented`) and
the mechanical output of the other modules. Since every chapter is still
`TODO`, there is currently no rule to apply — so the engine can only ever
honestly output `WAIT`, with `unmetConditions` explicitly naming
`rules/strategy.md` as the reason. That is not a placeholder shortcut; with
zero DG rules defined, `WAIT` is the only truthful answer.

### Module orchestration

Same modularity discipline as the POI Engine and DG Confidence Engine:
`DECISION_INPUT_MODULES` pairs each of the six source modules with an
`input` selector (the only place allowed to know `MarketBrain`'s shape) and
a `describe` function that reduces that module's current output to a
uniform `{available, direction, summary}` snapshot. A future seventh input
(e.g. once a Confirmation Engine exists) means one new registry entry,
nothing else.

`computeDecisionEngine(brain)` derives everything else mechanically from
those snapshots — no DG opinion involved:
- **`supportingModules`** / **`missingModules`** — which of the six modules
  currently have usable data.
- **`conflictingModules`** — pairwise comparison of the modules that *do*
  carry a directional signal (HTF Bias, Structure Engine's external bias,
  POI Engine's fresh-POI majority direction; Liquidity/Premium-Discount/DG
  Confidence Engine don't have a clean single direction and are excluded
  from conflict detection on purpose). Two modules disagreeing is a
  mechanical fact, not a DG rule — flagging it is honest, computing what to
  *do* about it is not this build's job.

### UI

New "Daniel Decision Engine" card: the state badge (color-coded per
`DECISION_STATES`), the reason sentence, then the same grouped-list
presentation as the DG Confidence Engine card — Verfügbare Module /
Fehlende Module / Konflikte zwischen Modulen / Erfüllte Bedingungen /
Fehlende Bedingungen. Empty groups simply don't render.

### Future consumers (not built yet)

The reason this module exists now, ahead of any DG rule: so these can be
built against a stable, real data shape later, instead of each reaching
into six different Market Brain modules on its own —

- **Telegram Alerts** — would watch `state` transitions (e.g. WAIT → READY)
  to decide when to notify.
- **Reports** — would aggregate historical `DecisionState` snapshots over
  time (needs a persistence/history layer, not built yet).
- **Replay** — would need `DecisionState` snapshots indexed by timestamp to
  replay a past session (same persistence need as Reports).
- **Learning Engine** — would analyze patterns in `metConditions`/
  `unmetConditions` against actual market outcomes (needs outcome tracking,
  not built yet).
- **Auto Trading** — would read `state === 'READY'` plus `moduleSnapshot`
  for execution parameters (far future, needs broker integration).

## MarketBrain aggregator (`app.js`)

```js
const MarketBrain = { liveData, sessions, premiumDiscount, htfBias, liquidity, pois, structure, dgConfidence, decision };
```

One shared object, populated by `loadMarketData()` and kept live-reactive by
`refreshDerivedModules()` (called after every JSON refresh *and* every
WebSocket tick). Every module in this document reads from and writes to this
object — nothing reaches into `data/market.json` directly except
`loadMarketData()` itself. Future modules (Confirmation, the remaining
Stage 2 POI detectors, or new DG Confidence Engine / Decision Engine
contributors) should add their own key here — and for a new Confidence
contributor specifically, just one entry in `CONFIDENCE_CONTRIBUTORS`; for a
new Decision Engine input, one entry in `DECISION_INPUT_MODULES` — nothing
else — following the same shape as Modules 4-10.

## `data/market.json` schema (grows module by module)

| Module | Status | Fields added |
|---|---|---|
| 1 — Live price + daily range | done | `price`, `dailyOpen`, `dailyHigh`, `dailyLow`, `barDate`, `previousClose`, `changePercent`, `isMarketOpen` |
| 2 — Weekly/monthly range | done | `weeklyOpen`, `weeklyHigh`, `weeklyLow`, `weekBarDate`, `monthlyOpen`, `monthlyHigh`, `monthlyLow`, `monthBarDate` |
| 3 — Session ranges (Asia/London/NY) | done | `sessions.{asia,london,ny}.{high,low,date}` |
| 4 — Premium/Discount | done | *(client-derived, not in market.json — see above)* |
| 5 — HTF Bias | done | *(client-derived, not in market.json — see above)* |
| 6 — Liquidity | done | *(client-derived, not in market.json — see above)* |
| 7 — POI Engine | Stage 2/4 (Fair Value Gap + Order Block detection) | `candles.h1` (array of `{datetime, open, high, low, close}`, reused from the Session Engine fetch) |
| 8 — DG Confidence Engine | architecture only | *(client-derived, not in market.json — see above)* |
| 9 — Structure Engine | pure structure detection | *(client-derived from `candles.h1`, not in market.json — see above)* |
| 10 — Daniel Decision Engine | architecture only, always WAIT | *(client-derived, not in market.json — see above)* |

Every field is either real (fetched, with a freshness check) or absent —
never fabricated. The frontend must keep showing "OFFLINE DEMO" / `—` for
anything it can't back with real data, per the project's non-negotiable
build rule (see `CLAUDE.md`).

## Engine roadmap (future modules, not yet built)

Once the Market Brain is complete and stable, later engines will be built
**on top of it**, never bypassing it to fetch data on their own:

- **POI Engine**: remaining Stage 2 detectors (Breaker, iFVG, Mitigation Block, Rejection Block, Supply/Demand Zone), then Stage 3 (Bewertung) and Stage 4 (Verbindung mit der Daniel Decision Engine) — see the Module 7 section above
- **DG Confidence Engine**: more contributors as new Market Brain modules ship (each just adds one `CONFIDENCE_CONTRIBUTORS` entry) — Structure Engine is a natural next contributor, not wired in yet — see the Module 8 section above
- **Structure Engine**: DG HTF Bias will eventually be able to read `MarketBrain.structure.internalBias`/`externalBias` directly once its `rules/strategy.md` chapter is defined — see the Module 9 section above
- **Daniel Decision Engine**: the actual rule-application logic — once a `rules/strategy.md` chapter flips to defined, `DG_RULES_DEFINED` is updated and `computeDecisionEngine()` gains real `metConditions`/`unmetConditions` evaluation for that chapter, moving the state beyond permanent WAIT for the first time — see the Module 10 section above
- **Confirmation Engine** — entry-trigger detection (engulfing, displacement, structure breaks from Module 9, …)
- **Alert Engine** — decides *when* something is worth a Telegram push (not just "sends messages") — a future consumer of `MarketBrain.decision`
- **Learning Engine** — statistics/pattern recognition over historical performance, never redefines rules — a future consumer of `MarketBrain.decision`
- **Performance Engine** — win-rate, RR, reports (daily/weekly/monthly/quarterly/yearly)

The old simulated `computeDecision()`/`render()` (Alpha Simulation card) is
untouched by any of this — it's still the manual demo buttons, kept
separate on purpose until the real Daniel Decision Engine's state is ready
to replace it in the UI.
