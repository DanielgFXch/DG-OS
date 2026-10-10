# DG OS · Jarvis Brain + Daily Planner

## Version 1 scope

This adds a real, owner-authenticated, persistent Jarvis memory and on-demand daily planner under **Jarvis → Mein Tag / Mein Gedächtnis**. It uses the existing production project `jzvnmhfhyvmmbontsoej` and the existing `dgos.deviceSession` Telegram pairing. No Lovable credits and no modifications to trading strategy.

### Brain
- Entries have category (profile, preference, goal, project, routine, note), title and content.
- Everything is **owner-confirmed** and can be edited and **permanently deleted**.
- Memories are stored encrypted at rest by the Supabase-hosted database; only the custom verified edge function can access the table. **Never** store provider keys or device tokens in memories.
- Account uses Telegram chat id from the server-side config; browser sends only hashed-session-verifiable bearer, the chat id never needs to be entered.
- No automatic ingestion of older ChatGPT chats. Doing that safely needs a separate transparent confirmation workflow.
- A small set of already explicitly agreed DG OS goals has been seeded; the owner can edit or remove them.

### Daily Planner
- On-demand today/tomorrow view, date interpreted in **Europe/Zurich**.
- Includes open tasks, appointments, bills, and shopping from **existing** DG OS tables.
- Shows overdue tasks as open, does not mark anything done, auto-create tasks, move appointments, send messages or bills.
- Reads existing **local-only** calendar events from `dgos.personal.events.v1` on the current device, labels them device-local, does **not** upload them.
- Other external calendars are not yet fetched in this panel; connect them separately or use existing Calendar tab.
- There are **no background notifications or automated check-ins** in this version. Add scheduling with explicit opt-in and a confirmed schedule in the next phase.

### Personal Q&A
- Owner submits a question explicitly. Edge function uses at most 18 selected and truncated confirmed memory items, and small portions of open tasks/appointments, to avoid excessive cost/data exposure.
- Uses existing server-side `OPENAI_API_KEY`, never browser API keys.
- If no key or provider error, display a transparent error; memory CRUD/planner still work.
- Answers can flow to the existing Jarvis voice UI when the owner enabled 'Antworten vorlesen'.
- This is text Q&A, **not** full duplex low-latency OpenAI Realtime.
- Context cannot instruct Jarvis to alter trading rules or perform any side-effect actions.

### Security
The database table `dgos_jarvis_brain` enables RLS, revokes public/anon/authenticated access and grants only `service_role`. The Edge Function checks expiry of the token hash in `dgos_device_sessions` **and** that the session chat id equals the registered owner `dgos_telegram_config.primary.chat_id`. All queries to memory table constrain to owner chat id. CORS origin restricted to `https://danielgfxch.github.io`; inputs, AI requests and memory counts bounded.

The older `dgos_memory_items` preparation tables remain unchanged. They reference `auth.users`; the DG OS production project presently has no Supabase Auth users. Their data model is not an active source for this Telegram-paired assistant.

### Test
`node scripts/test-jarvis-brain.js` verifies essential contracts and JS syntax. GitHub CI also runs existing app, voice, private and Social tests. Tests do not prove end-to-end sound/browser functionality or real AI account billing; use an owner-paired Mac/iPhone for the final smoke test.
