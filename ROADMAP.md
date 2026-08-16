# DG OS Roadmap

Where the project is, and what's next — module by module. The detailed
architecture for each module lives in [`docs/MARKET_BRAIN.md`](docs/MARKET_BRAIN.md);
this file is the higher-level map. Engineering ground rules live in
[`CLAUDE.md`](CLAUDE.md); Daniel's trading rules live in
[`rules/strategy.md`](rules/strategy.md).

## DG Learning Philosophy — not a trading AI

Before any roadmap item below: DG OS is **not a trading AI** — it is a
digital extension of Daniel Gomes. Its highest-level goal is permanent:
*"DG OS soll im Laufe der Zeit immer besser verstehen, wie Daniel Gomes
denkt."* Every roadmap item, especially the Learning Engine and Reports
phase near the bottom of this file, exists to serve that one goal — never a
goal of its own.

**Allowed**, once the relevant modules exist:
- Learn continuously from real market data, historical data, and trading results.
- Build statistics.
- Recognize patterns.
- Analyze performance.
- Propose improvements.
- Calculate alternative scenarios.
- Compare probabilities.

**Never allowed, under any circumstance:**
- DG OS may never change a trading rule on its own.
- DG OS may never overwrite a rule.
- DG OS may never activate a new rule on its own.

Every improvement DG OS ever produces must be explicitly labeled a
**recommendation** ("Empfehlung") — never applied automatically. Only Daniel
decides whether a recommendation is adopted, and adoption always means *he*
edits `rules/strategy.md` himself. This rule is permanent, applies
automatically to every module below, and is documented identically in
[`CLAUDE.md`](CLAUDE.md#dg-learning-philosophy--not-a-trading-ai) and
[`docs/MARKET_BRAIN.md`](docs/MARKET_BRAIN.md).

## Where things stand

> **Current v0.36.0 status:** The tables and milestone narrative below were
> originally written before Trading Brain V1. Today all 17 strategy chapters
> are defined, 14 runtime chapters are implemented, the Always-On Railway
> server is live, and the V1 Decision Engine can produce WAIT/WATCH/READY/
> MISSED/DATA_NOT_READY. The current priority is real-market accuracy,
> relevance, explainability and Daniel review—not architecture-only modules.

**Market Brain (data layer) — done or in progress, real data throughout:**

| Module | Status |
|---|---|
| 1 — Live Data (price, Daily Open/High/Low) | done |
| 2 — Weekly/Monthly range | done |
| 3 — Sessions (Asia/London/NY) | done |
| 4 — Premium/Discount | done |
| 5 — HTF Bias | done (structural proxy) |
| 6 — Liquidity Engine | done (level status, no decision) |
| 7 — POI Engine | V1 — FVG, Order Block, Breaker and iFVG with mitigation/reaction/relevance; remaining zone types are not V1 priorities |
| 9 — Structure Engine | done — Swing High/Low, HH/HL/LH/LL, BOS/CHOCH, internal + external |

**Daniel Brain (applies `rules/strategy.md`) — V1 active:**

| Module | Status |
|---|---|
| 8 — DG Confidence Engine | architecture done — contribution-score aggregation, no trading opinion |
| 10 — Daniel Decision Engine | V1 — detailed internal states plus WAIT/WATCH/READY/MISSED/DATA_NOT_READY presentation |

**System layer:**

| Module | Status |
|---|---|
| DG Overview (dashboard aggregation) | done — at-a-glance session/day/week levels, structure bias, open H1 zones, text feed for sweeps + zone reactions; reads existing modules only, no new detection |
| Event Store & Ingest Pipeline | done — Phase 1 "Core Foundation" (v0.20.0): `marketBrain.js`/`events.js`/`scripts/ingest.js`, git-committed `state/latest.json` + `state/events.jsonl`, Market-Context-vs-Trading-Event classification. GitHub Actions remains a periodic fallback — see the Always-On Market Server row below for the primary path |
| System Status (Version/Freshness/Source) | done (v0.21.0, extended v0.22.0) — `package.json` as version single source of truth; Price and Candle freshness now tracked separately (LIVE only when the WebSocket is actually connected, never off a stale timestamp), optionally sourced from a deployed Always-On Market Server. See `docs/MARKET_BRAIN.md`'s "System Status" section and `docs/ALWAYS_ON_SERVER.md`'s "Phase D" |
| Always-On Market Server | **deployed and live on Railway** — TwelveData REST (7 HTF-priority timeframes, Monthly→15M), WebSocket price, shared `marketBrain.js`/`events.js`, persistent memory and read-only Health/Market/Events/Brain APIs. Full architecture: `docs/ALWAYS_ON_SERVER.md` |
| TradingView Integration | plan only (v0.21.0), webhook route stubbed (`501`) in the Always-On Server (v0.22.0) — hybrid architecture (TwelveData = continuous OHLC, TradingView = strategic events via webhook) designed and documented, no validation/schema/event-store logic built yet: blocked on Daniel choosing and deploying a host. Full plan: [`docs/TRADINGVIEW_INTEGRATION_PLAN.md`](docs/TRADINGVIEW_INTEGRATION_PLAN.md) |
| Market Story / Explainability | V1 active — deterministic WAIT/WATCH/READY story plus met/missing/invalidating/context factors |
| Text & Voice Assistant | V1 foundation active — dashboard text chat, wake word, browser speech input/output and one daily spoken briefing; deterministic Brain facts, no fabricated LLM opinion |
| Telegram | V1 foundation active — allowlisted server chat, event pushes and optional daily morning briefing; Production configuration remains an operational step |
| News / Fundamentals | partial / blocked by provider access — Finnhub client exists, current configured account returns an access error; no fallback facts are invented |
| Daniel Feedback / Learning | review-export tooling active; persistent feedback loop, statistics and recommendations still planned; rules never self-modify |

(Module numbers track build order, not architectural layer — see the note
above the system tree in `docs/MARKET_BRAIN.md`.)

## Current phase: V1 accuracy and Daniel validation

DG OS's core V1 infrastructure and rule application exist. The focus is no
longer placeholder architecture or digitizing empty chapters; it is validating
the implemented interpretation against real XAUUSD situations and comparing
DG OS output with Daniel's judgement.

New trading behavior is only built when Daniel has defined the corresponding
rule. Daniel has now explicitly defined the wider product goal as a personal
text- and voice-capable XAUUSD Jarvis with Telegram, sourced fundamentals and
a controlled feedback loop. These product layers may therefore progress
incrementally, provided they reuse the verified Brain facts and never invent
or silently modify a trading rule.

Permanent priority order for this phase, every session:

1. Run the Reality Harness against real candles.
2. Review a small set of relevant POIs, sweeps and confirmations with Daniel.
3. Record unclear decisions as `DG_RULE_QUESTION`.
4. Correct only objective implementation errors or Daniel-approved rules.
5. Keep reports quiet, current and internally consistent.
6. Never change a rule on DG OS's own initiative.

The goal remains that DG OS gets more precise through Daniel-vs-DG-OS review,
not through self-modifying rules or feature volume.

## DG Knowledge Assistant — active support while digitizing Daniel's rules

Part of Knowledge Mode, not a separate phase: whenever Daniel defines or
edits a chapter in `rules/strategy.md`, DG OS must not just save the text.
It actively helps him formulate it more precisely, by:

- Flagging anything unclear or self-contradictory in what he wrote.
- Asking clarifying questions before treating a chapter as complete.
- Naming plausible edge cases the rule doesn't yet cover.
- Generating examples that illustrate the rule as written.
- Generating test cases a future implementation could be checked against.
- Suggesting how the rule could eventually be validated against live market data.
- Suggesting which existing Market Brain / Daniel Brain modules would consume this rule once it's implemented.

**Still absolute:** DG OS may never invent a trading rule of its own. Every
one of the seven actions above exists to sharpen *Daniel's own* rule —
clarifying questions, generated examples/test cases, and validation
suggestions are all proposals for him to confirm or correct, never
silently-assumed answers written into `rules/strategy.md` on DG OS's own
authority. Only Daniel's own words in that file are the rule. Documented
identically in
[`CLAUDE.md`](CLAUDE.md#dg-knowledge-assistant--active-support-while-digitizing-daniels-rules)
and [`docs/MARKET_BRAIN.md`](docs/MARKET_BRAIN.md).

## Next phases

1. Continue the Daniel-reviewed library of compact real XAUUSD cases,
   especially positive 15M Confirmation, READY, MISSED and Counter-Bias.
2. Complete the single Market Story contract across dashboard, voice and
   Telegram; remove remaining Alpha/demo prominence from the live path.
3. Confirm closed-candle/data-health behavior and provider semantics.
4. Restore a permitted economic-calendar/news source and expose source time,
   freshness and failure state without turning News into automatic Bias.
5. Build Daniel Feedback Memory: reviewed case, Daniel verdict, reason and
   recommendation; never automatic rule changes.
6. Add statistics and learning recommendations only after enough reviewed
   real cases exist.
7. Add further POI types or lower timeframes only after Daniel explicitly
   defines and prioritizes them.
8. **v1.0 DG OS Alpha** — once the above is real, tested, and running on
   live data with at least the core `rules/strategy.md` chapters (DG
   Philosophy, DG HTF Bias, DG Liquidity, DG Order Block, DG Valid FVG, DG
   Confirmation) defined and wired in.

Every item above is built only once it can run on real data and/or Daniel's
exact rules make it meaningful — a module fed with fake data is a dummy
feature, even if the code is "real" (see `CLAUDE.md`'s non-negotiable build
rule).
