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

**System layer:**

| Module | Status |
|---|---|
| DG Overview (dashboard aggregation) | done — at-a-glance session/day/week levels, structure bias, open H1 zones, text feed for sweeps + zone reactions; reads existing modules only, no new detection |
| Event Store & Ingest Pipeline | done — Phase 1 "Core Foundation" (v0.20.0): `marketBrain.js`/`events.js`/`scripts/ingest.js`, git-committed `state/latest.json` + `state/events.jsonl`, Market-Context-vs-Trading-Event classification. Still on the 15-min cron, not a truly continuous always-on watcher — see `docs/MARKET_BRAIN.md`'s "Event Store & Ingest Pipeline" section |
| Alerts, Reports, Learning, Statistics | not started — Alerts is the first natural consumer of the Event Store above |

(Module numbers track build order, not architectural layer — see the note
above the system tree in `docs/MARKET_BRAIN.md`.)

## Current phase: Knowledge Mode

DG OS's technical infrastructure (Market Brain Modules 1-9, Daniel Brain
Modules 8 and 10) is now largely complete. As of this build, the project has
permanently entered **Phase 2: Knowledge Mode** — the formal name for what
was previously called "Wissensmodus." **The focus is no longer new modules.
The focus is digitizing Daniel's trading knowledge.**

New modules are only built from now on when they are directly required to
implement a DG rule Daniel has actually defined — not proactively, not
because an architecture "would be nice to have ahead of time." **No further
architecture-only modules will be built until Daniel defines new
requirements.** The "Next phases" list below still describes the intended
future shape of the system, but every item on it is on hold under this
gate — it happens only as a direct consequence of rule-by-rule activation,
never as a standalone build.

Permanent priority order for this phase, every session:

1. Document Daniel's thinking (`rules/strategy.md`, starting with Chapter 0 — DG Philosophy).
2. Digitize his rules (fill in the remaining chapters).
3. Implement his rules (adapt the corresponding module — see "Rule-by-rule activation" below).
4. Test against real market data.
5. Measure performance.
6. Generate improvement recommendations (per the DG Learning Philosophy above — recommendations only).
7. Never change a rule on DG OS's own initiative.

The goal: DG OS gets more intelligent every week — not because new features
appear, but because its understanding of how Daniel actually trades gets
more precise. See `rules/strategy.md`'s Status-Übersicht for exactly which
of its 17 chapters (0-16) are still `TODO`.

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

## Next phases (gated behind Knowledge Mode — see above)

1. **Rule-by-rule activation** — as each `rules/strategy.md` chapter is
   filled in, the corresponding Market Brain module is adapted from its
   generic/structural placeholder to Daniel's real DG rule (e.g. DG Valid
   FVG replacing the current generic Fair Value Gap detector), and
   `DG_RULES_DEFINED` in `app.js` is updated so the Daniel Decision Engine
   can evaluate that chapter's conditions for the first time.
2. **Remaining POI Engine detectors** — Breaker, Inverse FVG, Mitigation
   Block, Rejection Block, Supply/Demand Zone (Stage 2), then Stage 3
   (Bewertung) and Stage 4 (wiring into the Decision Engine) — built only
   once the corresponding DG rule needs them, per Knowledge Mode.
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
