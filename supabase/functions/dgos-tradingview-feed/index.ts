import { createClient } from "npm:@supabase/supabase-js@2";

// DG OS TradingView Evidence Feed: PRIVATE, owner-paired, observation only.
// Never expose the service-role key or the private event table to browsers.
// An indicator-reported sweep is not confirmed DG analysis or an entry signal.
const ORIGIN = "https://danielgfxch.github.io";
const url = Deno.env.get("SUPABASE_URL") || "";
let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!key) { try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch {} }
const db = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

function headers(origin: string, extra: Record<string, string> = {}) {
  return {
    "cache-control": "no-store",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    ...(origin === ORIGIN ? { "access-control-allow-origin": ORIGIN } : {}),
    ...extra
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(origin, { "content-type": "application/json; charset=utf-8" })
  });
}
function base64url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function authorizedOwner(req: Request): Promise<boolean> {
  if (!db) return false;
  const match = (req.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  if (!match) return false;
  const hash = base64url(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1]))
  ));
  const [session, owner] = await Promise.all([
    db.from("dgos_device_sessions").select("chat_id").eq("token_hash", hash)
      .gt("expires_at", new Date().toISOString()).maybeSingle(),
    db.from("dgos_telegram_config").select("chat_id").eq("id", "primary").maybeSingle()
  ]);
  return !session.error && !owner.error && Boolean(session.data?.chat_id && owner.data?.chat_id) &&
    String(session.data?.chat_id) === String(owner.data?.chat_id);
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== ORIGIN) return json({ error: "origin_not_allowed" }, 403, origin);
  if (req.method === "OPTIONS") return new Response(null, {
    status: origin === ORIGIN ? 204 : 403,
    headers: headers(origin, {
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600"
    })
  });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, origin);
  if (!db) return json({ error: "feed_unavailable" }, 503, origin);
  if (!(await authorizedOwner(req).catch(() => false)))
    return json({ error: "device_pairing_required" }, 401, origin);

  try {
    const requested = Number(new URL(req.url).searchParams.get("limit") || "12");
    const limit = Number.isInteger(requested) ? Math.max(1, Math.min(20, requested)) : 12;
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data, error } = await db.from("dgos_tradingview_events")
      .select("id,symbol,timeframe,event_type,price,level_price,event_at,received_at,origin,evidence_status,detector")
      .eq("symbol", "XAUUSD").eq("origin", "tradingview")
      .gte("received_at", since).order("received_at", { ascending: false }).limit(limit);
    if (error) throw Error("events_read_failed");
    const events = (data || []).filter((row: Record<string, unknown>) =>
      row.evidence_status === "INDICATOR_REPORTED").map((row: Record<string, unknown>) => ({
      id: row.id,
      symbol: "XAUUSD",
      timeframe: row.timeframe,
      eventType: row.event_type,
      price: Number(row.price),
      level: row.level_price == null ? null : Number(row.level_price),
      eventAt: row.event_at,
      receivedAt: row.received_at,
      detector: row.detector,
      evidenceStatus: "INDICATOR_REPORTED"
    }));
    return json({
      symbol: "XAUUSD",
      source: "TradingView Webhook",
      evidenceStatus: "INDICATOR_REPORTED",
      asOf: new Date().toISOString(),
      note: "Von TradingView gemeldet, nicht unabhängig durch den DG Trading Brain bestätigt. Kein Entry-Signal.",
      events
    }, 200, origin);
  } catch {
    return json({ error: "feed_unavailable" }, 503, origin);
  }
});
