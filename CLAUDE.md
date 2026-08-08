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

Daniel's exact trading rules (HTF bias criteria, liquidity/POI criteria,
confirmation criteria, invalidation, risk management) live in
[`rules/strategy.md`](rules/strategy.md) — currently a placeholder awaiting his
input. The system must never invent or silently change trading rules; only Daniel
edits that file. Code may get smarter at *applying* the rules (statistics, pattern
recognition) — never at redefining them.

## Current status

- Frontend: static PWA (`index.html`, `app.js`, `styles.css`), Jarvis-style dark HUD theme, self-hosted fonts (Chakra Petch for display/chrome, JetBrains Mono for data — see `fonts/`).
- Decision engine: WAIT/WATCH/READY with explainable checklist, still driven by the simulated Alpha buttons — the checks in `computeDecision()` are placeholders until `rules/strategy.md` is filled in. Do not wire real market data into the decision checks until then.
- Live market data: XAUUSD price/Daily Open/High/Low is real, via `.github/workflows/market-data.yml` (TwelveData free tier, cron every 15 min, deploys `data/market.json` straight to Pages without git commits). Needs a `TWELVEDATA_API_KEY` repo secret to run — see README. Frontend (`loadMarketData()` in `app.js`) only shows "LIVE" and real numbers when that file is fresh (<45 min old); otherwise it honestly falls back to "OFFLINE DEMO", never fabricated numbers. `data/` is gitignored — it's a generated artifact, not a source file.
- True real-time price: on top of the 15-min baseline, the browser can open a direct TwelveData WebSocket stream (`openTdSocket()` in `app.js`) once Daniel enters his API key client-side in the "XAUUSD Live" card. This is a deliberate, explicitly-approved trade-off (his call, asked and confirmed) — the key is then visible in frontend code, in exchange for real sub-minute updates instead of the 5-minute ceiling GitHub Actions cron allows. Key lives only in `localStorage`, never committed. Has reconnect-with-backoff and falls back to the 15-min JSON baseline if the stream can't stay connected.
- Telegram: client-side manual send/auto-send works; server-side heartbeat workflow (`.github/workflows/telegram-heartbeat.yml`) is ready but needs `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` repo secrets to run.
- Deployment: GitHub Pages, deployed both by `.github/workflows/deploy-pages.yml` (on push to `main`) and by `market-data.yml` (on its schedule) — both share the `pages` concurrency group so they don't race.
- Git workflow on this project: open a PR, then merge it directly — don't leave PRs sitting open waiting for manual approval, per explicit instruction from Daniel.

## Roadmap — do not build ahead of need

Order Blocks, FVG/iFVG, Equal Highs/Lows, Premium/Discount/OTE, BOS/CHOCH,
Mitigation, Breaker, session/day/week/month opens & highs/lows, daily/weekly/
monthly/quarterly/yearly reports, win-rate & RR statistics. Build each of these
only once it can run on real data and/or Daniel's exact rules make it meaningful —
a module fed with fake data is a dummy feature, even if the code is "real."
