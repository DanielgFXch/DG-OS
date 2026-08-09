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

**Market Brain (data layer) — done or in progress, real data throughout:**

| Module | Status |
|---|---|
| 1 — Live Data (price, Daily Open/High/Low) | done |
| 2 — Weekly/Monthly range | done |
| 3 — Sessions (Asia/London/NY) | done |
| 4 — Premium/Discount | done |
| 5 — HTF Bias | done (structural proxy) |
| 6 — Liquidity Engine | done (level status, no decision) |
| 7 — POI Engine | in progress — Fair Value Gap + Order Block detection (Stage 2/4); Breaker, iFVG, Mitigation Block, Rejection Block, Supply/Demand Zone still to build |
| 9 — Structure Engine | done — Swing High/Low, HH/HL/LH/LL, BOS/CHOCH, internal + external |

**Daniel Brain (applies `rules/strategy.md`) — architecture built, zero DG rules defined yet:**

| Module | Status |
|---|---|
| 8 — DG Confidence Engine | architecture done — contribution-score aggregation, no trading opinion |
| 10 — Daniel Decision Engine | architecture done — WAIT/WATCH/READY/INVALID data model, always WAIT today since `rules/strategy.md` is entirely `TODO` |

**System layer — not started:** Alerts, Reports, Learning, Statistics.

(Module numbers track build order, not architectural layer — see the note
above the system tree in `docs/MARKET_BRAIN.md`.)

## Current phase: Wissensmodus

DG OS is in "Wissensmodus": no new Market Brain/Daniel Brain modules are
built until Daniel fills in a chapter of `rules/strategy.md`. Per chapter,
strictly: **Regel → Implementierung → Tests → Deploy → BUILD FERTIG.** See
`rules/strategy.md`'s Status-Übersicht for exactly which of its 17 chapters
(0-16) are still `TODO`.

## Next phases

1. **Rule-by-rule activation** — as each `rules/strategy.md` chapter is
   filled in, the corresponding Market Brain module is adapted from its
   generic/structural placeholder to Daniel's real DG rule (e.g. DG Valid
   FVG replacing the current generic Fair Value Gap detector), and
   `DG_RULES_DEFINED` in `app.js` is updated so the Daniel Decision Engine
   can evaluate that chapter's conditions for the first time.
2. **Remaining POI Engine detectors** — Breaker, Inverse FVG, Mitigation
   Block, Rejection Block, Supply/Demand Zone (Stage 2), then Stage 3
   (Bewertung) and Stage 4 (wiring into the Decision Engine).
3. **Confirmation Engine** — entry-trigger detection, once its
   `rules/strategy.md` chapter exists.
4. **System layer**, once the Decision Engine can reach a real (non-WAIT)
   state for at least one chapter:
   - **Alert Engine** — decides *when* something is worth a Telegram push,
     reading `MarketBrain.decision`.
   - **Reports** — daily/weekly/monthly/quarterly/yearly performance
     reports, win-rate & RR statistics.
   - **Learning Engine** — pattern recognition and performance analysis per
     the DG Learning Philosophy above: statistics and recommendations only,
     never rule changes.
   - **Replay** — historical `DecisionState` playback for review.
5. **v1.0 DG OS Alpha** — once the above is real, tested, and running on
   live data with at least the core `rules/strategy.md` chapters (DG
   Philosophy, DG HTF Bias, DG Liquidity, DG Order Block, DG Valid FVG, DG
   Confirmation) defined and wired in.

Every item above is built only once it can run on real data and/or Daniel's
exact rules make it meaningful — a module fed with fake data is a dummy
feature, even if the code is "real" (see `CLAUDE.md`'s non-negotiable build
rule).
