# Always-On Hosting — Comparison & Recommendation

**Status:** comparison only. Nothing has been booked, no account has been
created, no secret has been transferred anywhere. This document exists so
that decision can be made deliberately, with real trade-offs in front of
Daniel, instead of picking whatever's fastest to set up. Per explicit
instruction: **STOP before any hosting action** — this file is the stop.

## What's being hosted

`server/index.js` — a single, small, long-running Node.js process
(`server/`, see [`docs/ALWAYS_ON_SERVER.md`](ALWAYS_ON_SERVER.md) for the
full architecture). No database, no build step beyond Node itself, zero npm
dependencies (uses Node 22's built-in `fetch`/`WebSocket`). It needs to:

- Run continuously, 24/7 — it holds an open WebSocket connection to
  TwelveData and a set of candle-close-aligned refresh timers; restarting
  it loses the live-price connection until it reconnects.
- Accept inbound HTTPS requests — the frontend's `/api/health`,
  `/api/market/XAUUSD`, `/api/events/XAUUSD`, and later (once actually
  built — see `docs/TRADINGVIEW_INTEGRATION_PLAN.md`) TradingView's webhook
  POSTs to `/api/tradingview/webhook`.
- Hold one secret (`TWELVEDATA_API_KEY`) as an environment variable — never
  in a file, never in a repo.

That's the whole requirement list. It does not need a database, a queue, a
GPU, or multiple regions.

## Evaluation criteria

Per Daniel's explicit list:

- **24/7 Verfügbarkeit** — does the process stay running, or does a free
  tier sleep it after inactivity? (Sleeping is disqualifying here — a
  sleeping process drops the WebSocket and would need to "wake up" before
  answering a TradingView webhook, defeating the purpose.)
- **WebSocket-Unterstützung** — can the platform hold a long-lived outbound
  WebSocket connection (to TwelveData) without killing it?
- **HTTPS** — automatic TLS for the public API/webhook URL.
- **Environment Secrets** — a real secrets mechanism, not "paste it into a
  committed file."
- **Kosten** — approximate, not a quote. Pricing on all three platforms
  below changes over time; **Daniel should check each platform's current
  pricing page himself before deciding** — nothing here should be treated
  as a firm number.
- **Einfachheit** — how much DevOps knowledge is required to get this
  running and keep it running.
- **GitHub Deployment** — can it deploy automatically from this repo on
  push, matching how `deploy-pages.yml`/`market-data.yml` already work?
- **TradingView Webhook Eignung** — a stable, always-reachable HTTPS URL
  (TradingView needs somewhere to actually deliver the alert to, reliably).

## Comparison

| | **Railway** | **Fly.io** | **Render** |
|---|---|---|---|
| 24/7 Verfügbarkeit | Yes, always-on by default on paid plans | Yes, runs as an always-on VM (can also scale-to-zero, but that's the wrong mode for this use case — must be configured always-on) | Yes on the paid "Web Service" tier — **but the free tier sleeps after ~15 min of inactivity**, which would break both the WebSocket and webhook responsiveness. Free tier is not usable for this. |
| WebSocket-Unterstützung | Yes | Yes | Yes (paid tier) |
| HTTPS | Automatic | Automatic | Automatic |
| Environment Secrets | Yes — project settings UI | Yes — `fly secrets set`, encrypted | Yes — dashboard |
| GitHub Deployment | Native — connect the repo, deploys automatically on push | Supported, typically via a GitHub Actions step calling `flyctl deploy` | Native — connect the repo, deploys automatically on push |
| Einfachheit | **Highest** — connect repo, it detects Node, deploys with close to zero config | Moderate — needs a `fly.toml`, more CLI-driven, more control but more to learn | High — similar simplicity to Railway |
| TradingView Webhook Eignung | Good — stable URL, no cold starts once deployed always-on | Good — same | Good on paid tier only; **not usable on free tier** (sleep) |
| Kosten (grobe Einordnung, bitte selbst aktuell prüfen) | Usage-based; for a single small always-on Node service this tends to land in the low single-digit-dollars/month range once any free allowance is used up | Similar order of magnitude; historically had a meaningful free allowance for small workloads, but Fly.io's pricing structure has changed more than once — verify current terms | Paid "Web Service" tier needed (free tier disqualified above) — check current starting price |

*(Deliberately not stating exact numbers as fact — all three platforms have
changed pricing/free-tier terms multiple times; a number written here today
could be wrong by the time this is read.)*

## Recommendation

**Railway**, as the primary pick — for one reason above the others:
**einfachheit**. This is a single, small, dependency-free Node process with
no database and no complex build. Daniel does not need `fly.toml`-level
infrastructure control for that — the fastest path to "it's just running,
reliably, with GitHub auto-deploy" matters more here than fine-grained
control. Railway's GitHub-connect-and-deploy flow matches how this project
already deploys everything else (`deploy-pages.yml`, `market-data.yml`) —
push to a branch, it deploys.

**Fly.io** is a solid second choice if Daniel wants more control over the
deployment (region pinning, VM sizing, etc.) or if Railway's actual current
pricing turns out to be less attractive once checked — functionally
equivalent for this workload, just a steeper (still modest) learning curve.

**Render** is viable but only on its paid tier — ruled out as the *first*
choice only because its free tier's sleep-on-idle behavior is an easy trap
to fall into by accident (e.g. if a future collaborator spins up a second
Render service without knowing this constraint) — worth keeping in mind as
a fallback if the other two don't work out for some reason, not as the
first pick.

## What Daniel needs to do manually (not automated, not done by DG OS)

1. Check current pricing on the recommended platform(s) — this document
   deliberately doesn't commit to a number.
2. Create the account himself (DG OS/Claude does not create accounts on
   his behalf).
3. Connect the `DanielgFXch/DG-OS` GitHub repository.
4. Set `TWELVEDATA_API_KEY` as an environment variable/secret on the
   chosen platform — the same value already used as the
   `TWELVEDATA_API_KEY` GitHub Actions secret, entered directly into the
   hosting platform's own secret store, never pasted into a chat, a file,
   or a commit.
5. Point the deploy at `server/index.js` as the start command (`node
   server/index.js`), with `PORT` typically supplied automatically by the
   platform (`server/index.js` already reads `process.env.PORT`).
6. Once deployed, take the resulting public URL and paste it into the
   dashboard's "Always-On Market Server URL" field (see
   [`docs/ALWAYS_ON_SERVER.md`](ALWAYS_ON_SERVER.md)) — that's the only
   wiring step needed on the frontend side; it already falls back
   gracefully to today's behavior when this isn't set.

None of the above is done by this build. This document is the comparison
and the recommendation only.
