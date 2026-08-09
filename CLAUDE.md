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
currently no actual content — awaiting his input, chapter by chapter. As of this
build DG OS is in "Wissensmodus": no new features are built until a chapter is
filled in — strictly Regel → Implementierung → Tests → Deploy → BUILD FERTIG,
one chapter at a time, and a module is only switched to DG rules once its
chapter is complete. The system must never invent or silently change trading
rules; only Daniel edits that file. A chapter still marked TODO means DG OS
applies no rule for it and waits — see
the "DG methodology" section below. Code may get smarter at *applying* the rules
(statistics, pattern recognition) — never at redefining them.

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

## Current status

- Frontend: static PWA (`index.html`, `app.js`, `styles.css`), Jarvis-style dark HUD theme, self-hosted fonts (Chakra Petch for display/chrome, JetBrains Mono for data — see `fonts/`).
- Decision engine: WAIT/WATCH/READY with explainable checklist, still driven by the simulated Alpha buttons — the checks in `computeDecision()` are placeholders until `rules/strategy.md` is filled in. Do not wire real market data into the decision checks until then.
- Market Brain modules (Liquidity Engine, Fair Value Gap detector, Order Block detector, HTF Bias, Premium/Discount): real, working technical infrastructure on real data — but generic/structural definitions, not yet Daniel's DG-specific rules. Per the "DG methodology" section above, these are the foundation to be adapted into DG Liquidity / DG Valid FVG / DG Order Block / DG HTF Bias once he defines the exact rules — not a finished DG version of any of these concepts yet.
- Live market data: XAUUSD price/Daily Open/High/Low is real, via `.github/workflows/market-data.yml` (TwelveData free tier, cron every 15 min, deploys `data/market.json` straight to Pages without git commits). Needs a `TWELVEDATA_API_KEY` repo secret to run — see README. Frontend (`loadMarketData()` in `app.js`) only shows "LIVE" and real numbers when that file is fresh (<45 min old); otherwise it honestly falls back to "OFFLINE DEMO", never fabricated numbers. `data/` is gitignored — it's a generated artifact, not a source file.
- True real-time price: on top of the 15-min baseline, the browser can open a direct TwelveData WebSocket stream (`openTdSocket()` in `app.js`) once Daniel enters his API key client-side in the "XAUUSD Live" card. This is a deliberate, explicitly-approved trade-off (his call, asked and confirmed) — the key is then visible in frontend code, in exchange for real sub-minute updates instead of the 5-minute ceiling GitHub Actions cron allows. Key lives only in `localStorage`, never committed. Has reconnect-with-backoff and falls back to the 15-min JSON baseline if the stream can't stay connected.
- Telegram: client-side manual send/auto-send works; server-side heartbeat workflow (`.github/workflows/telegram-heartbeat.yml`) is ready but needs `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` repo secrets to run.
- Deployment: GitHub Pages, deployed both by `.github/workflows/deploy-pages.yml` (on push to `main`) and by `market-data.yml` (on its schedule) — both share the `pages` concurrency group so they don't race.
- Git workflow on this project: open a PR, then merge it directly — don't leave PRs sitting open waiting for manual approval, per explicit instruction from Daniel.
- Communication: whenever a piece of work is finished (a module, a fix, a merged PR), give Daniel a clear completion signal plus a short summary of what changed and what's next — written so he can forward it as-is. Don't just merge silently and move on.
- Versioning: DG OS uses Semantic Versioning (MAJOR.MINOR.PATCH — MAJOR for big milestones/architecture changes, MINOR for new modules or larger features, PATCH for bugfixes/small improvements). The current version lives in `DG_OS_VERSION` in `app.js` (shown in the UI footer) and must be bumped on every completed build, with a matching entry added to the top of `CHANGELOG.md` (New / Improved / Bugfixes / Changed files). Do this before committing, not as an afterthought.

## Roadmap — do not build ahead of need

Order Blocks, FVG/iFVG, Equal Highs/Lows, Premium/Discount/OTE, BOS/CHOCH,
Mitigation, Breaker, session/day/week/month opens & highs/lows, daily/weekly/
monthly/quarterly/yearly reports, win-rate & RR statistics. Build each of these
only once it can run on real data and/or Daniel's exact rules make it meaningful —
a module fed with fake data is a dummy feature, even if the code is "real."
