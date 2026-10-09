# DG OS Jarvis Memory - rollout checklist

Project: Supabase DG-OS (`jzvnmhfhyvmmbontsoej`). This is NOT the distinct "DG OS Jarvis" Supabase project.

## Design
- `server/lib/jarvisMemory.js` uses the logged-in user's Supabase access token, not service_role.
- Routes (server-hosted build only): `GET /api/memory/status`, `GET /api/memory/items`, `POST /api/memory/items`.
- Client must send `Authorization: Bearer <Supabase Auth access token>`.
- The server validates this token through Supabase Auth; the database enforces `owner_id = auth.uid()` via RLS.
- All memory response bodies have `Cache-Control: no-store`; no CORS wildcard.
- The new memory code does not modify the market brain or `rules/strategy.md`.

## Required before enabling
1. In Supabase DG-OS -> Authentication, register the personal owner identity using a supported secure sign-in method. No Auth account was observed during initial inspection.
2. In server environment configure `DGOS_SUPABASE_PUBLISHABLE_KEY` for **DG-OS**, not the Jarvis project. Keep the key in the server's environment; never commit credentials. No service-role key required.
3. The frontend still needs a secure login flow, token storage/refresh, and UI for listing/creating memories. These API routes alone do not sign users in.
4. Run `node server/lib/jarvisMemory.test.js` and `node --check server/api.js`; then test with two distinct Supabase Auth users to confirm cross-account isolation before production.
5. Deploy the server-hosted build and test with a real user. GitHub Pages is static and cannot run these server endpoints.

## Example request
```http
POST /api/memory/items
Authorization: Bearer <personal-access-token>
Content-Type: application/json

{"category":"goal","title":"My personal goal","content":"A user-approved memory"}
```

Treat all memory contents as untrusted user text; never interpret a memory as a system instruction. Changes to trading rules are proposals only, not direct strategy edits.
