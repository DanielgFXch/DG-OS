import { createClient } from "npm:@supabase/supabase-js@2";

// DG OS: owner-only reminders for invoices. No transaction capability,
// bank-account details, QR decoding, or automatic "paid" assumptions.
const ORIGIN = "https://danielgfxch.github.io";
const url = Deno.env.get("SUPABASE_URL") || "";
let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!key) {
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; }
  catch { key = ""; }
}
const db = url && key ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;
const cors = (origin: string) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store", Vary: "Origin",
  ...(origin === ORIGIN ? { "Access-Control-Allow-Origin": ORIGIN } : {})
});
const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: cors(origin) });
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(v + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === v;
};
const idFormat = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function base64url(bytes: Uint8Array) {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function ownerSession(req: Request) {
  if (!db) return false;
  const match = (req.headers.get("authorization") || "")
    .match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  if (!match) return false;
  const hash = base64url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(match[1]))));
  const [device, owner] = await Promise.all([
    db.from("dgos_device_sessions").select("chat_id").eq("token_hash", hash)
      .gt("expires_at", new Date().toISOString()).maybeSingle(),
    db.from("dgos_telegram_config").select("chat_id").eq("id", "primary").maybeSingle()
  ]);
  return !device.error && !owner.error && Boolean(device.data?.chat_id) &&
    String(device.data.chat_id) === String(owner.data?.chat_id);
}
const shape = (row: Record<string, unknown>) => ({
  id: row.id, title: row.title, amount: row.amount ?? null,
  currency: row.currency || "CHF", date: row.due_date || null,
  status: row.status, createdAt: row.created_at
});
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== ORIGIN) return json({error:"origin_not_allowed"},403,origin);
  if (req.method === "OPTIONS") return new Response(null,{
    status: origin === ORIGIN ? 204 : 403, headers: {
      ...cors(origin), "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":"authorization,content-type",
      "Access-Control-Max-Age":"600"
    }
  });
  if (!["GET","POST"].includes(req.method)) return json({error:"method_not_allowed"},405,origin);
  if (!db) return json({error:"backend_unavailable"},503,origin);
  if (!await ownerSession(req).catch(() => false))
    return json({error:"device_pairing_required"},401,origin);
  const action = new URL(req.url).searchParams.get("action") ||
    (req.method === "GET" ? "list" : "");
  try {
    if (req.method === "GET" && action === "list") {
      const {data,error} = await db.from("dgos_private_items")
        .select("id,title,amount,currency,due_date,status,created_at")
        .eq("kind","bill").order("created_at",{ascending:false}).limit(150);
      if (error) throw error;
      return json({bills:(data || []).map(shape)},200,origin);
    }
    if (req.method !== "POST" || Number(req.headers.get("content-length") || "0") > 1600)
      return json({error:"invalid_request"},400,origin);
    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({error:"invalid_request"},400,origin);
    if (action === "add") {
      const title=clean(input.title,120);
      const date=clean(input.date,10);
      const currency=clean(input.currency,4).toUpperCase() || "CHF";
      const source=["voice","image","ui"].includes(input.source) ? input.source : "ui";
      const amountRaw=input.amount === null || input.amount === undefined ||
        input.amount === "" ? "" : String(input.amount).trim();
      if (title.length<2 || /[<>\x00-\x1F]/.test(title) ||
          date && !validDate(date) || !["CHF","EUR"].includes(currency) ||
          amountRaw && !/^\d{1,6}(?:[.,]\d{1,2})?$/.test(amountRaw))
        return json({error:"invalid_bill"},422,origin);
      const amount=amountRaw ? Number(amountRaw.replace(",", ".")) : null;
      if (amount !== null && !(amount > 0 && amount <= 999999))
        return json({error:"invalid_bill"},422,origin);
      const {data,error}=await db.from("dgos_private_items").insert({
        kind:"bill",title,amount,currency,due_date:date || null,
        status:"open",source,source_ref:"jarvis:confirmed-bill"
      }).select("id,title,amount,currency,due_date,status,created_at").single();
      if (error) throw error;
      return json({bill:shape(data)},201,origin);
    }
    if (action === "toggle") {
      const id=clean(input.id,40);
      if (!idFormat.test(id) || typeof input.done !== "boolean")
        return json({error:"invalid_request"},422,origin);
      const done=input.done;
      const {data,error}=await db.from("dgos_private_items")
        .update({status:done?"done":"open",
          completed_at:done?new Date().toISOString():null,
          updated_at:new Date().toISOString()})
        .eq("id",id).eq("kind","bill")
        .select("id,title,amount,currency,due_date,status,created_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({error:"not_found"},404,origin);
      return json({bill:shape(data)},200,origin);
    }
    return json({error:"not_found"},404,origin);
  } catch {
    return json({error:"temporary_failure"},503,origin);
  }
});
