# DG OS V2 Audit

**Purpose:** a complete, honest technical inventory of DG OS as it exists today (v0.19.0), done *before* any V2 work starts, so the move toward the **DG OS – Personal AI Trading Brain** vision (see below) is a deliberate architectural decision, not an accidental one. Nothing in this document has been implemented. No code was changed while writing it.

**Target vision this audit is measured against** (as given): DG OS becomes a permanently-running personal trading assistant that understands Daniel's strategy, watches the market continuously, and can answer a question like *"Gomez, wie ist die Lage?"* using real current data — price, sessions, liquidity, POIs, structure, confirmations, targets, news, and what the strategy says should happen next — plus a persisted stream of typed market events (`ASIA_HIGH_SWEPT`, `POI_REACHED`, `BOS_CONFIRMED`, …) that can drive alerts. Not every event is notify-worthy, though — a level simply forming (e.g. `ASIA_HIGH_CREATED`) is silent market context, while something happening *to* a level (touched/swept/reacted to) is a real trading event; see "Event classification" under RECOMMENDED V2 ARCHITECTURE for the full rule. The system itself never invents trading rules; a separate **DG Trading Brain** (Daniel's rules) stays the only source of strategic decisions.

---

## CURRENT ARCHITECTURE

DG OS today is a **static PWA with no backend and no database**, hosted on GitHub Pages, with a single scheduled GitHub Actions job standing in for a backend's data-fetch step.

```
TwelveData REST API                     Telegram Bot API
        │ (server-side, cron)                    │ (client-side, direct)
        ▼                                         │
.github/workflows/market-data.yml                 │
  bash + jq ETL, every 15 min                     │
        │                                         │
        ▼                                         │
  data/market.json  ──────────────┐               │
  (gitignored, deployed to Pages  │               │
   as a build artifact, never     │               │
   committed, no history kept)    │               │
        │                         │               │
        ▼                         │               │
GitHub Pages (static hosting) ◄───┘               │
        │                                         │
        ▼                                         │
  index.html + app.js + styles.css  ───────────────┘
  (single browser tab, all computation client-side)
        │
        ▼
  MarketBrain (in-memory JS object, rebuilt from
  scratch on every page load — no persistence)
```

- **No package.json, no bundler, no framework.** `app.js` is one 1,738-line file loaded via a plain `<script>` tag; `index.html` (320 lines) is hand-written markup; `styles.css` (379 lines) is a hand-written custom-property theme. No React/Vue/etc., no client-side router (the bottom nav has 4 buttons, only "Dashboard" does anything).
- **No backend process of DG OS's own.** The closest equivalent is `market-data.yml`'s bash+jq script — a scheduled batch ETL job, not an always-on service. It holds the only server-side secret (`TWELVEDATA_API_KEY`), does the only real data transformation, and writes the only server-side artifact.
- **Two deploy paths share one `pages` concurrency group:** `deploy-pages.yml` (on push to `main`) and `market-data.yml` (cron `*/15 * * * *`) — both `upload-pages-artifact` the whole repo directory, which is how `data/market.json` reaches the live site without ever being committed.
- **Client-side aggregator (`MarketBrain`)** is the single source of truth *while the page is open*: `{liveData, sessions, candles, premiumDiscount, htfBias, liquidity, pois, structure, dgConfidence, decision, overview}`. Every module reads/writes it; `refreshDerivedModules()` recomputes all of it after every 15-min JSON refresh and every WebSocket price tick. Closing the tab discards it entirely.
- **Module layering** (build order, documented in `docs/MARKET_BRAIN.md`): Live price/ranges → Sessions → Premium/Discount → HTF Bias (structural proxy) → Liquidity Engine → POI Engine (FVG + Order Block detectors, 6 more stubbed) → Structure Engine (swings/BOS/CHOCH) → DG Confidence Engine (contribution-score aggregation) → Daniel Decision Engine (WAIT/WATCH/READY/INVALID state machine) → DG Overview (v0.19.0, pure UI aggregation).
- **`rules/strategy.md`** has all 17 chapters (0–16); every one is still `🔴 TODO`. `DG_RULES_DEFINED` in `app.js` mirrors this with 17 boolean flags, all `false`. Zero DG-specific trading rules exist anywhere in the codebase.
- **A legacy "Alpha Simulation" subsystem** (the original pre-engine scaffold) still drives the most visible parts of the UI — see LIVE vs. SIMULATED below.

---

## LIVE COMPONENTS

Real data, verified end-to-end (source → workflow → JSON → `MarketBrain` → render):

| Component | Source | Notes |
|---|---|---|
| XAUUSD price, Daily Open/High/Low, previousClose, changePercent | TwelveData `/quote` + `/time_series` (1day) | Gated by a 45-min freshness check (`MARKET_STALE_MS`); falls back to honest "OFFLINE DEMO" otherwise |
| Weekly / Monthly Open/High/Low | TwelveData `/time_series` (1week/1month) | Same freshness gate |
| Asia / London / NY Session High/Low | Derived server-side (in the workflow) from a 72h `1h` TwelveData fetch, grouped by session window | |
| `candles.h1` (H1 OHLC series) | Same 72h hourly fetch, reused — no extra API call | Feeds POI Engine + Structure Engine |
| Premium/Discount, HTF Bias (proxy), Liquidity Engine, POI Engine (FVG + Order Block), Structure Engine, DG Confidence Engine, Daniel Decision Engine, DG Overview | 100% client-side computation over the real fields above | Real math on real data — but *not* Daniel's real trading rules (see TRADING LOGIC below); "live" here means "not fabricated," not "DG-validated" |
| Real-time price stream | TwelveData WebSocket (`openTdSocket`) | Optional, user's own API key, price only (no OHLC) |
| Telegram `getMe` / `sendMessage` | Telegram Bot API, direct from the browser | Real HTTP calls, not simulated — but only manually triggered, or auto-sent when the *fake* Alpha Simulation state says so (see below) |

---

## SIMULATED COMPONENTS

Everything below is fully or partially fake, and — critically — several of these sit in the **most visible** parts of the UI, not in some obscure debug corner:

- **The entire "Alpha Simulation" subsystem** (`app.js` lines ~1519–1613): `state = {asia, sweep, engulf}`, toggled only by the four buttons in the "Alpha Simulation" card (`data-step="asia|sweep|engulf|reset"`); `computeDecision()`; `render()`.
- **The hero "AKTUELLE HANDLUNG" badge** — the single most prominent element in the app (top of the page, WAIT / SELL WATCH / SELL READY + the DG Confidence ring) — is driven entirely by `computeDecision()`'s fake tier, **not** by `MarketBrain.decision` (the real, architecturally-complete Daniel Decision Engine, which renders separately, further down the page, and is always `WAIT` today). A new user has no way to tell these two "decisions" apart from the UI alone.
- **Duplicate "Asia Session" card** in the legacy two-column layout: `asiaHigh`/`asiaLow`/`asiaRange` hardcoded to `'4302.00'` / `'4290.00'` / `'$12.00'` whenever `state.asia` is true — sitting right next to the *real* Session Engine card, which shows genuine data for the same session.
- **"Market Plan" card**: `htfPlan` hardcoded to the literal string `"Bullish"`, `primaryTarget` hardcoded to `"Daily Buyside"` — never computed from `MarketBrain.htfBias`.
- **"Liquidity" and "Confirmation" check-list cards**: "Preis im Premium" and "Bearisher POI" checks are `class="on"` in the markup — permanently shown as true, never computed at all, real or fake.
- **`briefingText()`** (the Telegram message preview/send): hardcodes `"HTF: Bullish"` / `"Primary Target: Daily Buyside"` regardless of what the real HTF Bias Engine says, and its sweep/confirmation lines come from `state`, not `MarketBrain`.
- **Daniel Decision Engine's permanent `WAIT`** is *not* a bug — it's the honest, documented consequence of zero `rules/strategy.md` chapters being defined — but is listed here because a future reader could easily mistake "always WAIT" for something broken rather than something correct.

---

## TRADING LOGIC CURRENTLY IMPLEMENTED

**Zero DG-specific trading rules.** What exists is generic/structural *detection infrastructure*, explicitly documented throughout the codebase as not-yet-Daniel's-methodology:

- **Premium/Discount** — generic equilibrium math (±3% band), not DG-specific.
- **HTF Bias** — naive proxy (price vs. Daily/Weekly/Monthly Open); code comment explicitly says this is not Daniel's real bias methodology.
- **Liquidity Engine** — 12 levels (Daily/Weekly/Monthly + session High/Low), status via a flat % tolerance (`active`/`touched`/`sweeped`/`invalid`). Generic sweep detection, no DG interpretation of *why* a sweep matters.
- **POI Engine** — 2 of 8 planned detector types are real: Fair Value Gap (classic 3-candle ICT imbalance) and Order Block (last opposite candle before a ≥1.5× local-ATR displacement closing in the outer third of its range). Both are explicitly documented as generic/ICT-style *architecture* for a future "DG Order Block"/"DG Valid FVG," not Daniel's real definitions. The other 6 detectors (Breaker, iFVG, Mitigation Block, Rejection Block, Supply Zone, Demand Zone) are stubs returning `[]`.
- **Structure Engine** — standard fractal-pivot swing detection + BOS/CHOCH via key-level tracking. Well-known technique, not DG-specific.
- **DG Confidence Engine** — averages whatever contribution scores are available; cannot have DG-specific weighting because no DG rules exist to weight by.
- **Daniel Decision Engine** — architecturally reads all of the above, but with `rules/strategy.md` entirely TODO there is nothing to evaluate; it always resolves to `WAIT`, with `unmetConditions` literally citing "chapter X is TODO."
- **No Confirmation Engine** exists as real code — engulfing/displacement-as-entry-trigger is only faked by the Alpha Simulation's `state.engulf` boolean. (Order Block's displacement-ratio math is a real, reusable *building block* for a future Confirmation Engine, but is not one itself.)
- **No News integration** anywhere — chapter 14 of `rules/strategy.md` is TODO and there is no fetch code, no news card, no news field in `data/market.json`.
- **No Risk Management / Exit / Target logic** exists in any form, real or simulated.
- **No persisted event log.** The "Market Events" card is driven solely by the fake Alpha Simulation `state`; none of the real engines (Liquidity/Structure/POI/DG Overview) write into it. DG Overview's "Meldungen" feed (v0.19.0) is the closest thing to a live text feed of real conditions, but it's fully ephemeral: recomputed by a full re-scan on every refresh, never stored, never deduplicated against a previous tick, and forgotten on reload.

---

## DATA SOURCES

- **TwelveData REST API** — `/quote`, `/time_series` (1day/1week/1month/1h). Called server-side only, from `market-data.yml`, every 15 minutes.
- **TwelveData WebSocket** (`wss://ws.twelvedata.com`) — called client-side only, optional, price-only, requires the user's own API key pasted into the browser and persisted in `localStorage` (visible in DevTools — a documented, accepted trade-off for a single-user tool).
- **Telegram Bot API** (`getMe`, `sendMessage`) — called client-side, direct from the browser, token in `localStorage`.
- **Nothing else.** No news API, no economic-calendar API, no broker/exchange API, no historical-data warehouse, no second market-data vendor for redundancy.

---

## DATABASE

**None exists.** The entire persistence layer is:

1. `data/market.json` — a single flat file, fully overwritten every 15 minutes, never versioned (gitignored on purpose, lives only as a transient Pages-deploy artifact). The previous snapshot is gone the moment the next one is written.
2. `localStorage` (client-side only) — exactly four values: `dgos.tdKey`, `dgos.tgToken`, `dgos.tgChatId`, `dgos.tgAutoSend`. No market data, no event history, no trading journal, nothing else.

**Direct implication for the target vision:** there is currently no way to answer any question about anything that happened more than "right now." No history of past sweeps, past POIs, past decisions, past sessions. Every browser session is amnesiac — a page reload forgets everything except those four localStorage values.

---

## FRONTEND

- `index.html` (320 lines) — static markup, all cards hand-written, no templating engine.
- `app.js` (1,738 lines) — one monolithic script; no ES modules, no imports, no bundler; state lives in a handful of module-level objects (`state`, `tg`, `MarketBrain`); rendering is direct DOM manipulation via a `$(id)` helper and template-literal `innerHTML` assignment per render function.
- `styles.css` (379 lines) — hand-written, custom-property-driven "Jarvis-style dark HUD" theme, no CSS framework.
- PWA shell: `manifest.webmanifest` + `sw.js` (basic cache-first service worker) + self-hosted fonts (`fonts/`).
- **No component framework**, no state-management library, no client-side router — the bottom nav (`Dashboard`/`Market Plan`/`Events`/`Learning`) is visually present but three of its four buttons have no click handler at all.
- **No automated test suite** — no test files, no `package.json`, no lint/test step in either workflow. Verification during development has been ad-hoc, manual Playwright scripts run once and discarded.

---

## BACKEND

**No conventional backend/server process exists.** The nearest functional equivalent is `market-data.yml`'s bash+jq ETL script inside GitHub Actions:

- It's the only place holding a server-side secret (`TWELVEDATA_API_KEY`).
- It does the only real data transformation in the system (the "scan forward for a real candle" bar-selection heuristic; session-window grouping by UTC hour).
- It "writes" to what is effectively the system's only datastore (`data/market.json`).
- It runs on a fixed 15-minute cron — it cannot react to anything in real time, cannot hold state between runs, and cannot be queried on demand (only `workflow_dispatch` for a manual run).

There is no API server DG OS's own frontend calls — the frontend fetches the static `data/market.json` file it already owns, and otherwise talks directly to TwelveData/Telegram. There is no authentication/authorization anywhere; the deployed site is fully public (GitHub Pages), and the only "access control" is that credentials live in each user's own browser.

---

## KNOWN ISSUES

1. **Broken PWA icon paths (concrete bug).** `manifest.webmanifest`, `sw.js`'s `ASSETS` list, and `index.html`'s `apple-touch-icon` `<link>` all reference `./icons/icon-192.png` / `./icons/icon-512.png` — but the actual files live at the repo root (`icon-192.png`, `icon-512.png`); no `/icons/` directory exists. Effect: the PWA install icon is broken, and because `caches.addAll()` in `sw.js` rejects entirely if *any single* URL 404s, the service worker's install step has very likely never successfully cached anything — offline support has probably never worked.
2. **Fake hero decision badge.** The most prominent UI element in the app is still 100% simulated (see SIMULATED COMPONENTS) while a real, architecturally complete Decision Engine renders separately and is ignored by it.
3. **Four more Alpha-Simulation-only blocks** present real-looking but fully hardcoded numbers/checks (duplicate Asia card, Market Plan card, Liquidity/Confirmation check cards) — see SIMULATED COMPONENTS for the full list.
4. **No persisted event/history store at all.** Every one of the 17 event types requested (`ASIA_LOW_CREATED`, `POI_REACHED`, `BOS_CONFIRMED`, …) needs timestamps that survive a reload; nothing like that exists today.
5. **`data/market.json` has no history.** Overwritten every 15 minutes, never committed. Any "what happened an hour ago" question is unanswerable server-side today.
6. **Credentials in `localStorage`.** The Telegram bot token and (optionally) the TwelveData WS key live in plaintext in the browser and are visible in DevTools. An explicit, documented trade-off for a single-user/trusted-device tool today — a hard blocker for any multi-device future or a backend that needs to hold these itself.
7. **`telegram-heartbeat.yml` is not actually a heartbeat.** It's `workflow_dispatch`-only (no cron) despite its name/description — a one-off manual connectivity test, not periodic monitoring.
8. **Brief data gap after every code deploy.** `deploy-pages.yml` (on push to `main`) deploys the repo without `data/market.json` (gitignored, absent from a fresh checkout) — so every code deploy causes a window (up to 15 min, until the next `market-data.yml` cron) where the live site has no market data and correctly, if unexpectedly, shows "OFFLINE DEMO."
9. **Dead reserved fields.** `computeHTFBias()`'s code comment reserves `lastBOS`/`currentStructure` "for a future Structure/Liquidity Engine" — that engine (Structure Engine) now exists and produces exactly this data (`MarketBrain.structure`), but was never wired back into these two fields; they remain permanently `null`. A concrete example of the cross-module wiring gaps to expect after many incremental builds.
10. **Single 1,738-line monolithic `app.js`, no module boundaries.** Still readable today because of consistent conventions, but it is the single largest structural obstacle to V2 — a persistence layer, an event system, and a conversational query interface each want their own boundaries.
11. **No automated tests anywhere.** Nothing regresses safely; every check has been manual and ad-hoc.
12. **Dead UI.** Three of four bottom-nav buttons do nothing.
13. **No error monitoring/diagnostics.** If `loadMarketData()`'s fetch fails or TwelveData changes its response shape, the user only ever sees stale/"OFFLINE DEMO" state, with no diagnostic surfaced anywhere beyond a caught, unlogged exception. Acceptable for a single-user hobby tool today, not for an "always-on personal AI trading brain."

---

## WHAT WE KEEP

- **The Market Brain computation logic** (Premium/Discount, HTF Bias proxy, Liquidity Engine, POI detectors, Structure Engine) — real, hand-verified, honest about its own limits, and exactly the kind of deterministic market math a future AI/query layer should call as tools rather than reinvent.
- **The config-driven registry pattern** (`LIQUIDITY_LEVEL_DEFS`, `POI_TYPE_DEFS`, `CONFIDENCE_CONTRIBUTORS`, `DECISION_INPUT_MODULES`) — genuinely good extensibility, worth carrying into V2's equivalent modules unchanged in spirit.
- **The "detector never sees `MarketBrain`, only its own input slice" modularity discipline** — good engineering practice, keep it as a rule for any new detector/module in V2.
- **`rules/strategy.md`'s chapter structure and governance discipline** (DG OS never invents a rule; only Daniel edits the file) — a principle, not code, foundational to both V1 and V2 and completely unaffected by any of the infrastructure changes below.
- **The "honest by default" pattern** (OFFLINE DEMO fallback, explicit H1-not-Daily labeling, never fabricate a number) — a project-wide discipline that must survive into V2 unchanged, arguably *more* important once the system starts speaking in full sentences instead of just rendering numbers.
- **The GitHub Actions ETL's data-quality heuristics** ("scan forward for a real candle," session-window grouping) — solid, battle-tested logic worth reusing even if it moves to a different runtime.
- **The visual design system** (`styles.css` HUD theme, self-hosted fonts) — a working, deliberately-styled UI; no reason to rebuild it while rebuilding the data/logic layer underneath.
- **GitHub Pages + GitHub Actions as hosting for the static frontend** — can very likely stay, with a proper backend added *alongside* it rather than replacing it.

---

## WHAT WE REPLACE

- **The entire Alpha Simulation subsystem** (`state`, `computeDecision()`, `render()`, the fake hero badge, duplicate Asia card, Market Plan card, Liquidity/Confirmation check cards, fake briefing numbers) — once the real Daniel Decision Engine has actual content to show (post rule-by-rule activation), this legacy demo has no remaining purpose and actively misleads users about what's real.
- **The "no persistence" model.** `data/market.json` as the sole datastore must be replaced/supplemented by a real store that keeps history, not just the current snapshot — required for both the event system and any "what happened" query.
- **The "page reload = amnesia" client architecture.** A conversational assistant needs durable state, not a purely client-recomputed `MarketBrain` that starts from zero on every load.
- **Direct-from-browser third-party API calls with credentials in `localStorage`.** Fine for a single-user demo; not fine once a real backend exists that can hold secrets properly and mediate these calls.
- **The single-file monolithic `app.js`.** Needs real module boundaries once persistence, an event system, and a conversational interface are added — not because 1,738 lines is inherently bad, but because each of those three additions wants its own boundary.
- **The fixed 15-min-cron-or-browser-must-stay-open cadence.** An "always watching" system needs an always-on process to detect and persist events in real time, independent of whether anyone's browser tab is open.

---

## RECOMMENDED V2 ARCHITECTURE

A layered architecture, deliberately **not** committing to a specific tech stack (Node vs. Python, Postgres vs. SQLite, etc.) — that's a decision for a follow-up conversation, not this audit.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Data Ingestion Layer (always-on, new)                        │
│    Continuously polls/streams TwelveData (later: news).         │
│    Reuses today's Market Brain computation logic (ported,       │
│    not rewritten). Diffs each cycle against previous state to   │
│    emit typed Events.                                           │
└─────────────────────────────────────────────────────────────────┘
                              │ writes
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Event Store / Database (new)                                 │
│    Raw OHLC history + Market Brain snapshots over time +        │
│    typed event log (type, timestamp, payload, source module).   │
│    This is what turns DG OS from amnesiac to something with     │
│    memory — prerequisite for the event system AND for any       │
│    "what happened" query.                                       │
└─────────────────────────────────────────────────────────────────┘
                              │ read by
                ┌─────────────┼──────────────────┐
                ▼             ▼                  ▼
┌───────────────────┐ ┌───────────────┐ ┌────────────────────────┐
│ 3. DG Trading      │ │ 4. Query /    │ │ 5. Alert/Notification  │
│    Brain           │ │    Conversa-  │ │    Layer                │
│    (rules layer)   │ │    tion Layer │ │    Subscribes to Event  │
│    Separate,       │ │    "Gomez,    │ │    Store, decides what's│
│    explicit repre- │ │    wie ist    │ │    alert-worthy per the │
│    sentation of    │ │    die Lage?" │ │    rules layer (not     │
│    rules/strategy  │ │    Starts as  │ │    hardcoded), pushes   │
│    .md once filled │ │    a deter-   │ │    via Telegram (later: │
│    in — the ONLY   │ │    ministic   │ │    other channels) —    │
│    source of       │ │    template,  │ │    server-side, so the  │
│    strategic       │ │    like       │ │    bot token lives in   │
│    decisions.       │ │    today's    │ │    one place, not every │
│                     │ │    briefing-  │ │    browser.              │
│                     │ │    Text(), but│ │                          │
│                     │ │    fed real   │ │                          │
│                     │ │    data.      │ │                          │
└───────────────────┘ └───────────────┘ └────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Frontend (mostly kept)                                       │
│    Same visual design + most rendering code, but becomes a thin │
│    client of the new backend's API instead of doing 100% of the │
│    computation itself in the browser. This is what finally lets │
│    the "Market Events" card show real, persisted events and     │
│    removes the "reload = amnesia" problem.                      │
└─────────────────────────────────────────────────────────────────┘
```

**Hosting:** the frontend can very likely stay on GitHub Pages; layers 1–5 need somewhere that can run *continuously* — GitHub Actions cron cannot do this (scheduled batch only, no always-on process, no inbound queries). A small always-on host (a persistent Node/Deno/Python process, or serverless functions backed by a real database) is the concrete infra decision to make in a follow-up conversation, deliberately not decided here.

### Event classification — Market Context vs. Trading Events (Daniel's correction)

Not every detected market change should reach Daniel. He drew an explicit line, and it applies to Layers 1, 2, and 5 above:

> DG OS soll nicht jede Marktveränderung melden. Es soll mich nur informieren, wenn etwas passiert, das für meine Trading-Entscheidung relevant sein könnte.

This is a schema decision, not just a filtering rule tacked onto the Alert Layer: every event the Ingestion Layer (1) emits into the Event Store (2) must carry a **category**, and that category — not a hand-maintained exclusion list — is what the Alert Layer (5) and any "relevant event stream" query use to decide what surfaces to Daniel. Two categories today:

- **Market Context** — a level simply came into existence. Persisted (so the current state, e.g. "Asia High: 4392.50 / Asia Low: 4371.20", is always queryable — this is exactly `MarketBrain.liquidity`/`DG Overview`'s "Levels" block today), but **silent**: no notification, does not appear in the trading event stream, is never treated as a setup signal.
  - `ASIA_HIGH_CREATED`, `ASIA_LOW_CREATED`, `LONDON_HIGH_CREATED`, `LONDON_LOW_CREATED`, `NY_HIGH_CREATED`, `NY_LOW_CREATED`
- **Trading Event** — something happened *to* a level or a zone that could matter for a decision. Persisted **and** notify-worthy (subject to the Alert Layer's own rules-layer-driven filtering — see Layer 5 above — but eligible, unlike Market Context).
  - Session levels: `ASIA_HIGH_TOUCHED`, `ASIA_LOW_TOUCHED`, `ASIA_HIGH_SWEPT`, `ASIA_LOW_SWEPT`, `LONDON_HIGH_TOUCHED`, `LONDON_LOW_TOUCHED`, `LONDON_HIGH_SWEPT`, `LONDON_LOW_SWEPT`, `NY_HIGH_TOUCHED`, `NY_LOW_TOUCHED`, `NY_HIGH_SWEPT`, `NY_LOW_SWEPT`
  - Liquidity/POI/structure: `LIQUIDITY_SWEPT`, `POI_REACHED`, `FVG_REACHED`, `ORDERBLOCK_REACHED`, `REACTION_DETECTED`, `ENGULFING_CONFIRMED`, `DISPLACEMENT_DETECTED`, `BOS_CONFIRMED`, `CHOCH_CONFIRMED`
  - Setup lifecycle: `SETUP_FORMING`, `SETUP_CONFIRMED`, `SETUP_INVALIDATED`, `TARGET_REACHED`

Rule of thumb baked into the schema: **a level being created is market context; something happening *to* that level (touched, swept, reacted to, confirmed) is a trading event.** `*_CREATED` events are allowed to exist technically (useful for persistence/debugging — e.g. reconstructing exactly when a session range was established), but the Event Store's category field is what keeps them out of Daniel's notifications and out of the trading event stream by construction, rather than by remembering to filter them out in every consumer. This also means a *future* event type only needs its category set correctly once, at the point it's emitted, to inherit the right notify/silent behavior everywhere — consistent with the config-driven-registry pattern already used elsewhere in this codebase (see WHAT WE KEEP).

**Why this changes previous parts of this document:** the "Target vision" intro's example event list and Layer 1/2/5's descriptions above were written before this correction and don't yet show the category distinction explicitly — this subsection is the authoritative version; the earlier text is superseded by it, not contradicted by it (the same 17-ish event names are still correct, just now split into the two categories above).

**Why this shape specifically:**
- Layer 1 reuses, rather than replaces, the one part of the current system that's already correct (the Market Brain math) — least risk, fastest path to value.
- Layer 2 is the single missing piece that unlocks *everything* the user asked for: events, history, and a query surface all need memory, and nothing else in this list can be built without it first.
- Layer 3 is kept deliberately thin and separate — exactly matching the explicit instruction that DG OS never invents trading rules and that the strategy lives in its own place. It also means Knowledge Mode's existing gating (no rule-by-rule activation until Daniel defines a chapter) continues to work unchanged.
- Layers 4–5 are both *consumers* of the Event Store, not producers — they can be built and re-built independently of each other and of Layer 1 once Layer 2 exists.
- Layer 6 is the smallest possible change to the frontend that still gets everything above: swap "compute everything locally" for "ask the backend," keep the rendering and the design.

---

## MIGRATION PLAN

Phased, each phase gated behind explicit approval — nothing here is authorized to start unless explicitly greenlit.

> **Naming note:** Daniel greenlit this work as **"Phase 1 – Core Foundation"**
> in his own numbering, distinct from the phase numbers below (which are this
> audit's own draft sequence, written before he gave instructions). His
> "Phase 1" maps onto this list's **Phase 2 (persistence)** plus part of
> **Phase 3 (server-side computation)** — see the status tags below. His
> instruction was explicit that UI cleanup (this list's Phase 1) stays
> deferred, not pulled forward. Future sessions: treat Daniel's own phase
> numbering, wherever he states it, as authoritative over this list's.

- **Phase 0 (this document).** No code changes. ✅ Done.
- **Phase 1 — V1 cleanup (small, safe, high-value).** ⏸️ Deferred — Daniel explicitly asked not to pull this forward when greenlighting Core Foundation. Once approved: retire the Alpha-Simulation-only UI blocks (hero badge wiring, duplicate Asia card, Market Plan card, Liquidity/Confirmation check cards) since they actively mislead; fix the broken icon paths. Touches only the frontend, nothing about data/architecture.
- **Phase 2 — Introduce persistence.** ✅ Done (v0.20.0, "Core Foundation"). `marketBrain.js`/`events.js`/`scripts/ingest.js` — the *existing* Market Brain computations, extracted verbatim (not rewritten) so browser and server share one implementation — now emit a classified (Market Context vs. Trading Event, per Daniel's explicit correction) event stream into a git-committed `state/latest.json` + `state/events.jsonl`. See `docs/MARKET_BRAIN.md`'s "Event Store & Ingest Pipeline" section for the full writeup, including a real bug found and fixed in the process (`detectZoneReaction`'s off-by-one self-touch).
- **Phase 3 — Move computation server-side.** 🟡 Partially done. The computation now genuinely runs server-side too (`scripts/ingest.js`, via `marketBrain.js`, in the same GitHub Actions job that fetches TwelveData) — so events get detected even if no browser tab is open, *at the moment the workflow runs*. What's still open: this runs on the same 15-minute cron as always, not a continuous always-on watcher independent of any schedule. That still needs the always-on host this phase originally described — a separate infrastructure/hosting decision, not made here.
- **Phase 4 — Alert Layer.** Not started. Wire the Event Store to Telegram (and later other channels) server-side, replacing the current client-side/localStorage-token approach.
- **Phase 5 — Query/Conversation Layer.** Not started. Build the "Gomez, wie ist die Lage?" interface on top of the now-durable event history + current Market Brain snapshot — deterministic template first, richer conversation later.
- **Phase 6 — DG Trading Brain integration.** Not started. Once `rules/strategy.md` chapters are actually filled in (unaffected by any of the above — this is Knowledge Mode's own separate gate), wire the rules layer into the Decision Engine for real WATCH/READY states, and only then into the Alert/Query layers as "this matters enough to tell you."

Each phase is independently reviewable and independently reversible — none of them requires committing to the next one in advance.
