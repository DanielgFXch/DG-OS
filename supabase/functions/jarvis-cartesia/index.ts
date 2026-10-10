import { createClient } from "npm:@supabase/supabase-js@2";

// DG OS Cartesia Voice Bridge. Device auth is the existing Telegram-paired DG OS session.
// No Cartesia secret or Supabase admin key ever reaches the browser.
const originAllowed = "https://danielgfxch.github.io";
const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const cartesiaKey = Deno.env.get("CARTESIA_API_KEY") || "";
const version = "2026-08-14";
let serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!serviceKey) {
  try { serviceKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { /* fail closed */ }
}
const db = projectUrl && serviceKey ? createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const allowedNames = ["Clive", "Archie", "Skylar", "Lindiwe"];
type Voice = { id: string; name: string; language: string };
let cached: { timestamp: number; voices: Voice[] } | null = null;
const cooldown = new Map<string, number>();

function headers(origin: string, extra: Record<string, string> = {}) {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    ...(origin === originAllowed ? { "access-control-allow-origin": origin } : {}),
    ...extra
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin, { "content-type": "application/json; charset=utf-8" }) });
}
function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function session(req: Request) {
  if (!db) return null;
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  if (!match) return null;
  const hash = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1]))));
  const now = new Date().toISOString();
  const [sessionResult, configResult] = await Promise.all([
    db.from("dgos_device_sessions").select("chat_id").eq("token_hash", hash).gt("expires_at", now).maybeSingle(),
    db.from("dgos_telegram_config").select("chat_id").eq("id", "primary").maybeSingle()
  ]);
  if (sessionResult.error || configResult.error || !sessionResult.data?.chat_id || !configResult.data?.chat_id) return null;
  if (String(sessionResult.data.chat_id) !== String(configResult.data.chat_id)) return null;
  return hash;
}
async function voices() {
  if (cached && Date.now() - cached.timestamp < 10 * 60_000) return cached.voices;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const batches = await Promise.all(allowedNames.map(async name => {
      const url = new URL("https://api.cartesia.ai/voices");
      url.searchParams.set("q", name);
      url.searchParams.set("limit", "50");
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Authorization: "Bearer " + cartesiaKey, "Cartesia-Version": version }
      });
      if (!res.ok) throw new Error("upstream_voice_status_" + res.status);
      const payload = await res.json();
      const arr = Array.isArray(payload?.data) ? payload.data : [];
      return arr
        .filter((x: any) => x && typeof x.name === "string" && x.name.toLowerCase().startsWith(name.toLowerCase()))
        .map((x: any) => ({ id: String(x.id || ""), name: x.name.slice(0, 90), language: String(x.language || "en") }))
        .filter((x: Voice) => /^[0-9a-f-]{36}$/i.test(x.id))
        .slice(0, 4);
    }));
    const unique = [...new Map(batches.flat().map(item => [item.id, item])).values()];
    cached = { timestamp: Date.now(), voices: unique };
    return unique;
  } finally { clearTimeout(timer); }
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== originAllowed) return json({ error: "origin_not_allowed" }, 403, origin);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: origin === originAllowed ? 204 : 403,
      headers: headers(origin, {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600"
      })
    });
  }
  if (!["GET", "POST"].includes(req.method)) return json({ error: "method_not_allowed" }, 405, origin);
  // This route has verify_jwt=false because it authenticates Telegram-linked device tokens itself.
  // Tokens are checked against hashed database sessions AND the owner's paired Telegram chat.
  if (!db) return json({ error: "secure_voice_bridge_unavailable" }, 503, origin);
  let owner = "";
  try { owner = await session(req) || ""; }
  catch { return json({ error: "login_required" }, 401, origin); }
  if (!owner) return json({ error: "device_pairing_required" }, 401, origin);
  if (!cartesiaKey) return json({ error: "voice_not_configured" }, 503, origin);
  if (req.method === "GET") {
    try {
      const list = await voices();
      return json({ voices: list, provider: "cartesia", connected: true }, 200, origin);
    } catch (e) {
      console.warn("jarvis_cartesia_voice_lookup_failed", e instanceof Error ? e.message : "unknown");
      return json({ error: "voice_catalog_unavailable" }, 502, origin);
    }
  }
  let input: any;
  try { input = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400, origin); }
  const transcript = typeof input?.text === "string" ? input.text.trim() : "";
  const id = typeof input?.voice_id === "string" ? input.voice_id : "";
  const language = input?.language;
  const speed = input?.pace === undefined ? 0.95 : Number(input.pace);
  if (!transcript || transcript.length > 300 || !/^[0-9a-f-]{36}$/i.test(id) ||
      !["en", "de", "pt"].includes(language) ||
      !Number.isFinite(speed) || speed < 0.7 || speed > 1.3) {
    return json({ error: "invalid_voice_request" }, 400, origin);
  }
  const last = cooldown.get(owner) || 0;
  if (Date.now() - last < 2500) return json({ error: "slow_down" }, 429, origin);
  cooldown.set(owner, Date.now());
  if (cooldown.size > 100) cooldown.clear();
  try {
    const allowed = await voices();
    if (!allowed.some(v => v.id === id)) return json({ error: "voice_not_available" }, 400, origin);
  } catch { return json({ error: "voice_catalog_unavailable" }, 502, origin); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 17000);
  try {
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + cartesiaKey,
        "Cartesia-Version": version,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: "sonic-3.6",
        transcript,
        voice: id,
        language,
        generation_config: { speed },
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 }
      })
    });
    if (!res.ok) {
      console.warn("jarvis_cartesia_tts_failed", res.status);
      return json({ error: "voice_generation_failed", upstream_status: res.status }, 502, origin);
    }
    const audio = await res.arrayBuffer();
    if (audio.byteLength < 44 || audio.byteLength > 3_000_000) return json({ error: "invalid_audio_response" }, 502, origin);
    return new Response(audio, { status: 200, headers: headers(origin, { "content-type": "audio/wav" }) });
  } catch (error) {
    console.warn("jarvis_cartesia_tts_unavailable", error instanceof Error ? error.name : "unknown");
    return json({ error: "voice_service_unavailable" }, 502, origin);
  } finally { clearTimeout(timer); }
});
