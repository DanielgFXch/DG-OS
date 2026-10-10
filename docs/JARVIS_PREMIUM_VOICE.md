# Jarvis Premium Voice — DG OS

## Status (10 October 2026)

- **Browser voice**: free device voices via `speechSynthesis`, optional auto-read and manual test.
- **Cartesia premium**: real Sonic 3.6 TTS, proxied only through the existing DG-OS Supabase Edge Function `jarvis-cartesia`. No Cartesia API key in GitHub Pages, browser localStorage or client requests.
- **ElevenLabs**: reserved alternative, not connected.
- **OpenAI Realtime**: reserved separate conversation mode, **not yet active**.

### Which Supabase project?
The **existing** DG-OS backend (`jzvnmhfhyvmmbontsoej`), because it stores DG OS's Telegram device pairings and the current voice endpoint. Do **not** change the LiveUP Academy backend, the independent new Jarvis Memory project, or the trading engine to enable voice.

### First-time setup

1. Open DG OS on the iPhone and visit **Aufgaben → Telegram verbinden**. Pair this device with the existing personal DG-OS Telegram bot. The browser stores a device session locally; if the session expires, pair again.
2. In **Jarvis** choose **Cartesia · Premium** → **Stimmen laden**.
3. Select Clive, Archie, Skylar or Lindiwe, and tap **Stimme testen**. The choice is saved locally and shared with the Premium Voice Studio.
4. Activate **Antworten vorlesen** only if new Jarvis replies should automatically trigger premium TTS. This uses Cartesia credits for each spoken response.
5. On iOS Safari, if audio is prepared but autoplay is blocked, press **Antwort vorlesen** again. The generated audio is reused without a second premium request.

If the server responds **voice_not_configured**, check whether `CARTESIA_API_KEY` was actually set as an Edge Function secret in the **existing DG-OS backend**. Never paste that key in the browser or GitHub. Don't enable public signup just for voice.

### Security model

`supabase/functions/jarvis-cartesia/index.ts` uses `verify_jwt=false` **only because** it implements a separate fail-closed authorization mechanism: every request supplies the Telegram-paired device token; the Edge Function hashes it with SHA-256 and verifies the hash against `dgos_device_sessions`, its expiry, and the currently paired owner chat in `dgos_telegram_config`. Service keys and Cartesia credentials remain server-only. Browsers from unrelated origins are rejected. Synthesis limits text to 300 characters per request and uses a per-isolate cooldown; this is a basic anti-abuse measure, not a full billing quota.

### Testing checklist

- Node/browser JavaScript syntax checks for `jarvis-voice.js`, `voice-studio.js`, and `cartesia-favorites.js`.
- In an unpaired browser, premium must report **KOPPLUNG** and must not make paid TTS requests.
- In a paired browser, loading voices must show real Cartesia voices. Switching voices should persist across the two UI surfaces.
- On an actual iPhone, test one spoken response, **Stopp**, then **Antwort vorlesen**; confirm Safari playback works.
- Confirm the Edge Function returns HTTP 401 without a device session and does not expose secrets or accept an invalid voice ID.
- Confirm Trading Brain outputs, rule files, webhook paths and notifications are unchanged.

**No real paid/audio end-to-end test can be performed until a browser is paired and the Cartesia secret is configured. Do not label TTS verified before the user tests it.**
