# DG OS — Engineering Guide

DG OS is a long-term "Trading Operating System" for XAUUSD, built to think exactly
like Daniel Gomes trades — not a signal service, not a generic dashboard. Full
mission/principles: [`docs/VISION.md`](docs/VISION.md). Read it before making any
architectural decision; everything below is a condensed, actionable summary of it.

## Non-negotiable build rule

Every change should do two things:
1. Visibly improve the interface.
2. Add one real, working feature.

No dummy features. No fabricated data when real data is available — if data isn't
connected yet, the UI must say so honestly (e.g. the "OFFLINE DEMO" badge) rather
than presenting invented numbers as real.

## Decision system

DG OS never guesses. Every setup status is one of **WAIT / WATCH / READY**, always
with an explicit, itemized reason (which criteria are met/unmet) — see
`computeDecision()` in `app.js`. Never collapse this back to a plain boolean.

## Strategy rules

Daniel's exact trading rules live in [`rules/strategy.md`](rules/strategy.md) —
the central knowledge base of DG OS, structured into chapter 0 (DG Philosophy —
his underlying view of the market, not a rule; the lens all other chapters are
read through) plus 16 rule chapters (DG HTF Bias, DG Liquidity, DG
Premium/Discount, DG Order Block, DG Valid FVG, DG Inverse FVG, DG Breaker, DG
Confirmation, Entry, Exit, Risk Management, No Trades, Session-Regeln, News,
Beispiele, Edge Cases), each with a status marker and guiding questions but
currently no actual content — awaiting his input, chapter by chapter. DG OS is
permanently in **Knowledge Mode** (see the section below) for this reason: no
new features are built until a chapter is filled in — strictly Regel →
Implementierung → Tests → Deploy → BUILD FERTIG, one chapter at a time, and a
module is only switched to DG rules once its chapter is complete. The system
must never invent or silently change trading rules; only Daniel edits that
file. A chapter still marked TODO means DG OS applies no rule for it and
waits — see the "DG methodology" section below. Code may get smarter at
*applying* the rules (statistics, pattern recognition) — never at redefining
them.

## DG methodology — not ICT, not generic Smart Money

DG OS digitizes **Daniel Gomes' own way of reading the market** — it is not an ICT
implementation, not a generic Smart Money Concepts indicator, not a TradingView-style
tool. Every concept is named, and will eventually be *defined*, as Daniel's own
version of it, not the textbook one:

- **DG Order Block**, not "an Order Block"
- **DG Valid FVG**, not "a Fair Value Gap"
- **DG Liquidity**, not "generic liquidity"
- **DG HTF Bias**, not "an HTF Bias"
- **DG Confirmation**, not "a Confirmation"
- **DG Decision Engine**, not "an Entry Engine"

The modules already built (Liquidity Engine, Fair Value Gap detector, Order Block
detector, HTF Bias, ...) are the **technical foundation only** — real, working
detection/computation infrastructure, deliberately built so it can be adapted step
by step once Daniel's exact DG rules exist for each concept. They are not the
finished DG version of anything, and should not be presented or discussed as such.

Never invent or approximate generic trading logic (ICT-style thresholds, textbook
SMC heuristics, standard-indicator formulas) as a stand-in for a DG rule that hasn't
been defined yet. If the exact DG rule for something isn't in
[`rules/strategy.md`](rules/strategy.md) yet, prepare the architecture and wait for
Daniel's definition — never guess at what he'd want. This generalizes the "Strategy
rules" principle above (only Daniel edits trading rules) to every module in the
system, not just the Decision Engine. Quality over speed, always — this rule is
permanent and applies to every future build.

## DG Learning Philosophy — not a trading AI

DG OS is **not a trading AI** — it is a digital extension of Daniel Gomes. Its
highest-level goal is permanent: *"DG OS soll im Laufe der Zeit immer besser
verstehen, wie Daniel Gomes denkt."* Everything the system is ever allowed to
learn serves that one goal — never a goal of its own.

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
edits [`rules/strategy.md`](rules/strategy.md) himself — the system never
edits it for him, no matter how confident a pattern looks. This is a
permanent rule and applies automatically to every future module — especially
the Learning Engine, Reports, Statistics, and any future Auto Trading work.
See also [`ROADMAP.md`](ROADMAP.md) and the matching section in
[`docs/MARKET_BRAIN.md`](docs/MARKET_BRAIN.md).

## Knowledge Mode (current project phase)

DG OS's technical infrastructure (Market Brain Modules 1-9, Daniel Brain
Modules 8 and 10) is now largely complete. As of this build, the project is
permanently in **Knowledge Mode** — the formal name for what "Wissensmodus"
above already meant, now the explicit current phase, not just a rule for
`rules/strategy.md` chapters specifically.

**The focus is no longer new modules. The focus is digitizing Daniel's
trading knowledge.** New modules are only built from now on when they are
directly required to implement a DG rule Daniel has actually defined — not
proactively, not because an architecture "would be nice to have ahead of
time." No further architecture-only modules will be built until Daniel
defines new requirements.

Priority order, permanent, applies to every session from here on:

1. Document Daniel's thinking (`rules/strategy.md`, starting with Chapter 0 — DG Philosophy).
2. Digitize his rules (fill in the remaining chapters).
3. Implement his rules (adapt the corresponding Market Brain / Daniel Brain module — see the "rule-by-rule activation" phase in [`ROADMAP.md`](ROADMAP.md)).
4. Test against real market data.
5. Measure performance.
6. Generate improvement recommendations (per the "DG Learning Philosophy" section above — recommendations only).
7. Never change a rule on DG OS's own initiative.

The goal: DG OS gets more intelligent every week — not because new features
appear, but because its understanding of how Daniel actually trades gets
more precise. Full phase details and status: [`ROADMAP.md`](ROADMAP.md).

## DG Knowledge Assistant — active support while digitizing Daniel's rules

Part of Knowledge Mode, not a separate phase: whenever Daniel defines or
edits a chapter in [`rules/strategy.md`](rules/strategy.md), DG OS must not
just save the text. It actively helps him formulate it more precisely, by:

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
authority. Only Daniel's own words in that file are the rule.

This is a permanent behavioral rule for every future session working on
`rules/strategy.md` — it has no UI, no new module, no version-gated
feature; it governs how the assistant behaves. Documented identically in
[`ROADMAP.md`](ROADMAP.md) and [`docs/MARKET_BRAIN.md`](docs/MARKET_BRAIN.md).

## Current status

- Frontend: static PWA (`index.html`, `app.js`, `styles.css`), Jarvis-style dark HUD theme, self-hosted fonts (Chakra Petch for display/chrome, JetBrains Mono for data — see `fonts/`).
- Decision engine: WAIT/WATCH/READY with explainable checklist, still driven by the simulated Alpha buttons — the checks in `computeDecision()` are placeholders until `rules/strategy.md` is filled in. Do not wire real market data into the decision checks until then.
- Market Brain modules (Liquidity Engine, Fair Value Gap detector, Order Block detector, HTF Bias, Premium/Discount): real, working technical infrastructure on real data — but generic/structural definitions, not yet Daniel's DG-specific rules. Per the "DG methodology" section above, these are the foundation to be adapted into DG Liquidity / DG Valid FVG / DG Order Block / DG HTF Bias once he defines the exact rules — not a finished DG version of any of these concepts yet.
- DG Overview: a dashboard card, not a new module — aggregates existing Liquidity/Structure/POI Engine output into an at-a-glance view (session/day/week High-Low levels, structure bias, open high-confidence H1 zones, and a text feed for level sweeps + zone reactions). "Zone reaction" (`detectZoneReaction()` in `app.js`) is a purely mechanical check — price traded into a fresh zone and a later candle closed back outside it — deliberately not named "DG Confirmation" since that DG rule isn't defined yet. "Open zones" are explicitly labeled H1, not Daily — DG OS doesn't fetch Daily-candle history yet, so it never claims to.
- Live market data: XAUUSD price/Daily Open/High/Low is real, via `.github/workflows/market-data.yml` (TwelveData free tier, cron every 15 min, deploys `data/market.json` straight to Pages without git commits). Needs a `TWELVEDATA_API_KEY` repo secret to run — see README. Frontend (`loadMarketData()` in `app.js`) only shows "LIVE" and real numbers when that file is fresh (<45 min old); otherwise it honestly falls back to "OFFLINE DEMO", never fabricated numbers. `data/` is gitignored — it's a generated artifact, not a source file.
- True real-time price: on top of the 15-min baseline, the browser can open a direct TwelveData WebSocket stream (`openTdSocket()` in `app.js`) once Daniel enters his API key client-side in the "XAUUSD Live" card. This is a deliberate, explicitly-approved trade-off (his call, asked and confirmed) — the key is then visible in frontend code, in exchange for real sub-minute updates instead of the 5-minute ceiling GitHub Actions cron allows. Key lives only in `localStorage`, never committed. Has reconnect-with-backoff and falls back to the 15-min JSON baseline if the stream can't stay connected.
- Telegram: client-side manual send/auto-send works; server-side heartbeat workflow (`.github/workflows/telegram-heartbeat.yml`) is ready but needs `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` repo secrets to run.
- Deployment: GitHub Pages, deployed both by `.github/workflows/deploy-pages.yml` (on push to `main`) and by `market-data.yml` (on its schedule) — both share the `pages` concurrency group so they don't race.
- Git workflow on this project: open a PR, then merge it directly — don't leave PRs sitting open waiting for manual approval, per explicit instruction from Daniel.
- Communication: whenever a piece of work is finished (a module, a fix, a merged PR), give Daniel a clear completion signal plus a short summary of what changed and what's next — written so he can forward it as-is. Don't just merge silently and move on.
- Versioning: DG OS uses Semantic Versioning (MAJOR.MINOR.PATCH — MAJOR for big milestones/architecture changes, MINOR for new modules or larger features, PATCH for bugfixes/small improvements). The current version lives in `DG_OS_VERSION` in `app.js` (shown in the UI footer) and must be bumped on every completed build, with a matching entry added to the top of `CHANGELOG.md` (New / Improved / Bugfixes / Changed files). Do this before committing, not as an afterthought.

## Roadmap — do not build ahead of need

Full module-by-module roadmap and current phase: [`ROADMAP.md`](ROADMAP.md).
Build each future module only once it can run on real data and/or Daniel's
exact rules make it meaningful — a module fed with fake data is a dummy
feature, even if the code is "real."
