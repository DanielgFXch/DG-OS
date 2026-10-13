// DG OS · TradingView -> Supabase secure event transport.
// Public entry point, PRIVATE persistence. No auth bearer from TradingView;
// a separate, strong DGOS_TRADINGVIEW_WEBHOOK_SECRET must be configured in
// Supabase Edge Function Secrets BEFORE any event will be accepted.
// Never store or return the token. Alerts are NOT verified market facts,
// cannot place an order, and never imply a DG BUY/SELL confirmation.
const VALID_EVENTS = new Set([
  "ASIA_HIGH_TOUCHED", "ASIA_LOW_TOUCHED", "ASIA_HIGH_SWEPT", "ASIA_LOW_SWEPT",
  "LONDON_HIGH_TOUCHED", "LONDON_LOW_TOUCHED", "LONDON_HIGH_SWEPT", "LONDON_LOW_SWEPT",
  "NY_HIGH_TOUCHED", "NY_LOW_TOUCHED", "NY_HIGH_SWEPT", "NY_LOW_SWEPT",
]);
const ALLOWED_FRAMES = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W",
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"]);
const bytes = new TextEncoder();
const response = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const digest = async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.encode(value)));
async function constantTimeTokenCheck(actual, expected) {
  // SHA-256 standardizes input lengths before the constant-work comparison.
  const a = await digest(actual), b = await digest(expected);
  let different = 0;
  for (let i = 0; i < 32; i++) different |= a[i] ^ b[i];
  return different === 0 && actual.length > 0;
}
const cleanNumber = value => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 && result < 1000000000 ? result : null;
};
const cleanShort = (value, maxLen) =>
  typeof value === "string" && value.length <= maxLen ? value.trim() : null;
const normalizeSymbol = input => {
  const s = cleanShort(input, 65)?.toUpperCase() || "";
  return /^(?:[A-Z0-9_-]{2,25}:)?XAU\/?USD$/.test(s) ? "XAUUSD" : null;
};
function normalizeAlert(body, now) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const event = cleanShort(body.eventType, 50);
  const symbol = normalizeSymbol(body.symbol);
  const timeframe = cleanShort(body.timeframe, 6);
  const price = cleanNumber(body.price);
  const level = body.level === undefined ? null : cleanNumber(body.level);
  const rawTime = cleanShort(body.timestamp, 48);
  const time = rawTime ? Date.parse(rawTime) : NaN;
  if (!VALID_EVENTS.has(event) || !symbol || !ALLOWED_FRAMES.has(timeframe) ||
      price === null || (body.level !== undefined && level === null) ||
      !Number.isFinite(time) || time > now + 300000 || time < now - 172800000) return null;
  // This field must not contain arbitrary metadata or raw Pine alert bodies.
  // Keep only a benign detector label. Never persist a secret.
  const detector = cleanShort(body.detector, 80);
  return {
    symbol, timeframe, event_type: event, price, level_price: level,
    event_at: new Date(time).toISOString(), detector,
    origin: "tradingview", evidence_status: "INDICATOR_REPORTED",
    meta: {},
  };
}
const hex = input => [...input].map(b => b.toString(16).padStart(2, "0")).join("");
Deno.serve(async req => {
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("DGOS_TRADINGVIEW_WEBHOOK_SECRET") || "";
  // Failure closed: the endpoint may be deployed safely before setup.
  if (secret.length < 32) return response(503, { error: "not_configured" });
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return response(415, { error: "json_required" });
  }
  if (Number(req.headers.get("content-length") || "0") > 4096) {
    return response(413, { error: "payload_too_large" });
  }
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return response(413, { error: "payload_too_large" });
    body = JSON.parse(raw);
  } catch { return response(400, { error: "invalid_json" }); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !(await constantTimeTokenCheck(typeof body.secret === "string" ? body.secret : "", secret))) {
    return response(401, { error: "unauthorized" });
  }
  const normalized = normalizeAlert(body, Date.now());
  if (!normalized) return response(422, { error: "invalid_event" });

  const key = [normalized.origin, normalized.symbol, normalized.timeframe,
    normalized.event_type, normalized.event_at].join("|");
  const event_key = hex(await digest(key));
  const supabase = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabase.startsWith("https://") || !serviceKey)
    return response(503, { error: "persistence_not_configured" });
  try {
    const saved = await fetch(supabase + "/rest/v1/dgos_tradingview_events?on_conflict=event_key", {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: "Bearer " + serviceKey,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify([{ ...normalized, event_key }]),
      signal: AbortSignal.timeout(1800),
    });
    if (!saved.ok) return response(503, { error: "event_not_saved" });
    return response(200, { ok: true, recorded: true, status: "INDICATOR_REPORTED" });
  } catch { return response(503, { error: "event_not_saved" }); }
});
