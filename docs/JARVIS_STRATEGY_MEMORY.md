# Jarvis Strategy Memory — Phase 1

Trading rules have absolute priority. The canonical source is `rules/strategy.md`, **not** an AI-generated summary or an editable memory record.

## Read-only endpoints (DG OS Node Hub)

- `GET /api/jarvis/strategy`: Chapter metadata and SHA-256 source revision.
- `GET /api/jarvis/strategy/context?chapters=0,1,2`: Complete requested chapters plus source revision, maximum eight chapters.

Both endpoints require the **existing Google Hub authentication** (`gmail.isAuthorized(req)`). Without a configured authenticated Hub session they return HTTP 401. No CORS permission is granted to cross-origin browser callers. Responses use `Cache-Control: no-store`.

This does not require Supabase, and it does **not** implement signal logic. Chapter status DEFINED only means that the written methodology exists. Existing market engine gates and `DG_RULES_DEFINED` must remain untouched until each chapter's logic is individually verified.

## Checks before merging

1. Run `node server/lib/jarvisStrategyMemory.test.js` with Node.js 22+.
2. Verify an unauthenticated `GET /api/jarvis/strategy` returns 401.
3. With a genuinely authenticated Hub session, check that the summary returns 17 chapters.
4. Verify `/api/jarvis/strategy/context?chapters=1,2` returns only chapters 1 and 2 with source metadata.
5. Verify invalid chapter inputs return 400. Confirm browser callers on an unrelated origin cannot read strategy data.
6. Check `/api/brain/XAUUSD` and other integrations still work unchanged.

## Next phase

Build a private, owner-scoped durable memory store for *observations, journal entries, preferences and conversations*, not for altering strategy rules. A Supabase project can power persistence after authentication and row-level security are configured. Never put Supabase service keys into public JavaScript or GitHub source. Do not auto-save trading rules inferred from chat. Only explicitly reviewed rule changes are permitted.
