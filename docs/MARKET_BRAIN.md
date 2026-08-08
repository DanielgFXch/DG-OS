# DG OS Market Brain — Architecture

The Market Brain is the **data layer** of DG OS. It knows real, live facts
about XAUUSD — price, session, ranges, opens — and makes **no trading
decisions**. The Daniel Decision Engine (built later, once
[`rules/strategy.md`](../rules/strategy.md) is filled in with Daniel's actual
rules) will consume Market Brain output. It never talks to the data provider
directly, and the Market Brain never invents a trading opinion.

Full vision context: [`VISION.md`](VISION.md).

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

## `data/market.json` schema (grows module by module)

| Module | Status | Fields added |
|---|---|---|
| 1 — Live price + daily range | done | `price`, `dailyOpen`, `dailyHigh`, `dailyLow`, `barDate`, `previousClose`, `changePercent`, `isMarketOpen` |
| 2 — Weekly/monthly range | done | `weeklyOpen`, `weeklyHigh`, `weeklyLow`, `weekBarDate`, `monthlyOpen`, `monthlyHigh`, `monthlyLow`, `monthBarDate` |
| 3 — Session ranges (Asia/London/NY) | done | `sessions.{asia,london,ny}.{high,low,date}` |
| 4 — Premium/Discount | planned | derived client-side from existing ranges, no new API call |
| 5 — HTF Bias (structural, not Daniel's rules yet) | planned | derived client-side from existing opens, no new API call |

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
