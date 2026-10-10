import { createClient } from "npm:@supabase/supabase-js@2";

// Real OpenAI text-to-speech for DG OS. This never issues browser API keys.
// All traffic requires an unexpired Telegram-paired DG-OS device token.
const ORIGIN = "https://danielgfxch.github.io";
const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!serviceKey) {
  try { serviceKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { /* deny all requests */ }
}
const db = PROJECT_URL && serviceKey
  ? createClient(PROJECT_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const VOICES = ["onyx", "echo", "cedar", "sage", "verse", "alloy", "coral", "marin", "ballad", "ash", "fable", "nova", "shimmer"];
const lastSynthesis = new Map<string, number>();
function headers(origin: string, extra: Record<string, string> = {}) {
  return {
    "cache-control": "no-store",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    ...(origin === ORIGIN ? { "access-control-allow-origin": ORIGIN } : {}),
    ...extra
  };
}
function json(data: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(data), { status, headers: headers(origin, { "content-type": "application/json; charset=utf-8" }) });
}
function b64url(bytes: Uint8Array) {
  let value = "";
  for (const b of bytes) value += String.fromCharCode(b);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function ownerSession(req: Request) {
  if (!db) return null;
  const bearer = (req.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  if (!bearer) return null;
  const hash = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer[1]))));
  const now = new Date().toISOString();
  const [ses, cfg] = await Promise.all([
    db.from("dgos_device_sessions").select("chat_id").eq("token_hash", hash).gt("expires_at", now).maybeSingle(),
    db.from("dgos_telegram_config").select("chat_id").eq("id", "primary").maybeSingle()
  ]);
  if (ses.error || cfg.error || !ses.data?.chat_id || !cfg.data?.chat_id) return null;
  return String(ses.data.chat_id) === String(cfg.data.chat_id) ? hash : null;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== ORIGIN) return json({ error: "origin_not_allowed" }, 403, origin);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: origin === ORIGIN ? 204 : 403,
      headers: headers(origin, {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600"
      })
    });
  }
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (!db) return json({ error: "voice_backend_unavailable" }, 503, origin);
  const owner = await ownerSession(req).catch(() => null);
  if (!owner) return json({ error: "device_pairing_required" }, 401, origin);
  if (!OPENAI_KEY) return json({ error: "voice_not_configured", provider: "openai" }, 503, origin);
  if (req.method === "GET") {
    return json({
      provider: "openai", ready: true, model: "gpt-4o-mini-tts",
      voices: VOICES.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), language: "multi" }))
    }, 200, origin);
  }
  let input: unknown;
  try { input = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400, origin); }
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voice = typeof body.voice_id === "string" ? body.voice_id : "";
  const language = typeof body.language === "string" ? body.language : "";
  const speed = body.pace === undefined ? 0.95 : Number(body.pace);
  if (!text || text.length > 300 || !VOICES.includes(voice) ||
      !["de", "en", "pt"].includes(language) ||
      !Number.isFinite(speed) || speed < 0.7 || speed > 1.3) {
    return json({ error: "invalid_voice_request" }, 400, origin);
  }
  const now = Date.now();
  if (now - (lastSynthesis.get(owner) || 0) < 3500) return json({ error: "slow_down" }, 429, origin);
  lastSynthesis.set(owner, now);
  if (lastSynthesis.size > 100) lastSynthesis.clear();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 19000);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: abort.signal,
      headers: { Authorization: "Bearer " + OPENAI_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        response_format: "mp3",
        speed,
        instructions: language === "de"
          ? "Speak naturally in German with a warm, calm, confident personal-assistant tone."
          : language === "pt"
            ? "Speak clearly in European Portuguese, with a calm, warm and professional personal-assistant tone."
            : "Speak naturally with a confident, warm and calm personal-assistant tone."
      })
    });
    if (!response.ok) {
      console.warn("jarvis_openai_tts_error", { status: response.status });
      return json({ error: response.status === 401 ? "voice_invalid_api_key" :
        response.status === 429 ? "voice_provider_rate_limit" : "voice_generation_failed",
        upstream_status: response.status }, 502, origin);
    }
    const audio = await response.arrayBuffer();
    if (audio.byteLength < 100 || audio.byteLength > 3_000_000)
      return json({ error: "invalid_audio_response" }, 502, origin);
    return new Response(audio, { status: 200, headers: headers(origin, { "content-type": "audio/mpeg" }) });
  } catch (error) {
    console.warn("jarvis_openai_tts_unavailable", error instanceof Error ? error.name : "unknown");
    return json({ error: "voice_service_unavailable" }, 502, origin);
  } finally { clearTimeout(timer); }
});
