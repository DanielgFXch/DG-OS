# Jarvis Voice: one production backend, two premium providers

## Which Supabase project is required?

Only the existing **DG-OS** project `jzvnmhfhyvmmbontsoej`, which already contains Telegram device sessions and private Jarvis memory tables. The separate October 2026 `DG OS Jarvis` project was not used by DG OS and has been **paused**, not permanently deleted. It must never be required to play voice.

## Providers

- Browser voices: free, native Web Speech API; on some iPhones Web Speech may fail.
- Cartesia Premium: `jarvis-cartesia` checks server-only `CARTESIA_API_KEY`. Its credential is missing from the active DG OS server as evidenced by the user's `voice_not_configured` screen. New API keys must be saved via the Dashboard of the **existing DG-OS** project, not a separate Supabase project.
- OpenAI Premium: `jarvis-openai-voice` uses the same paired-device authorization and server-only `OPENAI_API_KEY` as the existing DG OS Jarvis AI integration. Voices: Onyx, Echo, Cedar, Sage, Verse, Alloy, Coral, Marin, Ballad, Ash, Fable, Nova, Shimmer. Generation calls `POST /v1/audio/speech` with `gpt-4o-mini-tts`, generating MP3 playback.
- OpenAI Realtime: separate two-way live conversation feature; **not yet active**. Do not conflate TTS playback with a realtime conversation.

If the current provider is Cartesia but its API key is missing, Jarvis automatically offers the OpenAI premium voice provider instead, provided an OpenAI API key is configured. If neither key is configured, fail visibly; never fake TTS or print secrets.

## Minimal owner action if neither provider works

1. Open [the correct project's Dashboard](https://supabase.com/dashboard/project/jzvnmhfhyvmmbontsoej).
2. Go to Edge Functions → Secrets.
3. Add one provider secret under the exact name `CARTESIA_API_KEY` **or** `OPENAI_API_KEY`. Paste the key only in Supabase Dashboard, not in GitHub code, front-end, Telegram or ChatGPT.
4. Save; Supabase functions read the new secrets without a redeploy.
5. Return to Jarvis and press **Stimmen laden**, then **Stimme testen**. If Safari blocks asynchronous playback, press ▶ on the native audio player shown immediately below the buttons.

Each device must be paired once with Telegram, then keeps its device token for the configured expiry (currently 180 days).

## Security and user experience

The voice bridge checks the hashed `dgos.deviceSession` token and requires the chat ID to match the registered owner in `dgos_telegram_config`. No bearer secret is copied into memory records or console logs. CORS is limited to the existing GitHub Pages origin. Synthesis input is bounded at 300 characters, voice identifiers are validated against the allowlist, and a modest cooldown reduces accidental excessive paid requests. Do not modify trading strategy files, backtesting logic, or Academy apps.

The protected backend function is deployed to production, but true audio end-to-end testing needs a paired user's browser and a configured provider key. Tests alone cannot prove actual iPhone sound output.
