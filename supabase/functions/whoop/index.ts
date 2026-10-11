import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = "2bac96a0-3e70-4d31-b319-cd19b73f30bc";
const REDIRECT_URI = "https://danielgfxch.github.io/DG-OS/whoop-callback.html";
const APP_URL = "https://danielgfxch.github.io/DG-OS/";
const WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const SCOPES = ["offline","read:recovery","read:cycles","read:sleep","read:workout","read:profile","read:body_measurement"];
const ALLOWED_ORIGIN = "https://danielgfxch.github.io";
const WHOOP_SESSION_TTL_MS = 180*24*60*60*1000;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control":"no-store" }});
}
function redirect(location: string) {
  return new Response(null, { status:302, headers:{ Location: location, "Cache-Control":"no-store", "Referrer-Policy":"no-referrer" }});
}
function b64url(bytes: Uint8Array) {
  let s=""; bytes.forEach(b=>s+=String.fromCharCode(b));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(value: string) {
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);
  const raw=atob(padded); return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function sha256(value: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
async function aesKey(secret: string) {
  const digest=await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dgos-whoop:"+secret));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function encrypt(secret: string, value: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await aesKey(secret);
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value));
  return { cipher:b64url(new Uint8Array(cipher)), iv:b64url(iv) };
}
async function decrypt(secret: string, cipher: string, iv: string) {
  const key=await aesKey(secret);
  const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64url(iv)},key,fromB64url(cipher));
  return new TextDecoder().decode(clear);
}
function randomState() {
  const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const b=crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b,x=>chars[x%chars.length]).join("");
}
function randomToken() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
function validClaimSecret(value: unknown) {
  const v=String(value||"").trim();
  return /^[A-Za-z0-9_-]{40,120}$/.test(v) ? v : "";
}
async function readJson(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!serviceKey){
  try{ serviceKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||""; }catch{}
}
const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

function secret() { return Deno.env.get("WHOOP_CLIENT_SECRET")||""; }
function botToken() { return Deno.env.get("TELEGRAM_BOT_TOKEN")||""; }
async function internalAuthorized(req: Request) {
  const supplied=req.headers.get("X-DGOS-Internal")||"";
  const token=botToken();
  if(!supplied||!token)return false;
  const expected=await sha256("dgos-whoop-internal:"+token);
  return supplied===expected;
}

async function bearerHash(req: Request) {
  const header=req.headers.get("Authorization")||"";
  if(!header.startsWith("Bearer ")) return "";
  const token=header.slice(7).trim(); if(!token) return "";
  return sha256(token);
}
async function validSession(req: Request) {
  const hash=await bearerHash(req); if(!hash) return false;
  const now=new Date().toISOString();
  const {data}=await db.from("dgos_whoop_sessions").select("token_hash").eq("token_hash",hash).gt("expires_at",now).maybeSingle();
  if(!data) return false;
  await db.from("dgos_whoop_sessions").update({expires_at:new Date(Date.now()+WHOOP_SESSION_TTL_MS).toISOString()}).eq("token_hash",hash);
  return true;
}
async function validMaintenanceRequest(req: Request) {
  // This key lives ONLY in Supabase Vault; the database stores its SHA-256.
  // Never allow an owner session, browser origin or public anon key to invoke it.
  const supplied=req.headers.get("X-DGOS-Keepalive")||"";
  if(!/^[a-f0-9]{64}$/.test(supplied))return false;
  const {data,error}=await db.from("dgos_whoop_keepalive").select("secret_hash").eq("id","primary").maybeSingle();
  if(error||!data||typeof data.secret_hash!=="string")return false;
  const actual=await sha256("dgos-whoop-keepalive:"+supplied);
  const expected=data.secret_hash;
  // Constant-time comparison of equal-length base64url hashes.
  if(actual.length!==expected.length)return false;
  let mismatch=0;
  for(let i=0;i<actual.length;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return mismatch===0;
}
async function keepaliveResult(status: "ok"|"reauthorize_required"|"temporarily_unavailable") {
  const now=new Date().toISOString();
  const values=status==="ok"
    ? {last_attempt_at:now,last_success_at:now,last_result:status}
    : {last_attempt_at:now,last_result:status};
  const {error}=await db.from("dgos_whoop_keepalive").update(values).eq("id","primary");
  if(error)console.warn("whoop_keepalive_status_write_failed");
}
async function validDeviceSession(req: Request) {
  const hash=await bearerHash(req); if(!hash) return false;
  const now=new Date().toISOString();
  const {data}=await db.from("dgos_device_sessions").select("token_hash").eq("token_hash",hash).gt("expires_at",now).maybeSingle();
  if(!data) return false;
  await db.from("dgos_device_sessions").update({last_seen_at:now}).eq("token_hash",hash);
  return true;
}
async function issueWhoopSession() {
  const session=randomToken();
  const sessionHash=await sha256(session);
  await db.from("dgos_whoop_sessions").delete().lt("expires_at",new Date().toISOString());
  const {error}=await db.from("dgos_whoop_sessions").insert({
    token_hash:sessionHash,
    expires_at:new Date(Date.now()+WHOOP_SESSION_TTL_MS).toISOString()
  });
  if(error) throw error;
  return session;
}

async function loadToken() {
  const {data,error}=await db.from("dgos_whoop_tokens").select("*").eq("id","primary").maybeSingle();
  if(error) throw error;
  return data;
}
async function saveToken(data: any) {
  const {error}=await db.from("dgos_whoop_tokens").upsert({id:"primary",...data,updated_at:new Date().toISOString()});
  if(error) throw error;
}

async function diagnostic(stage: string, httpStatus?: number, errorCode?: string, errorDescription?: string) {
  const safe=(value?: string)=>String(value||"").slice(0,300);
  await db.from("dgos_whoop_diagnostics").insert({
    stage,
    http_status:httpStatus||null,
    error_code:safe(errorCode)||null,
    error_description:safe(errorDescription)||null
  });
}
// WHOOP invalidates the previous refresh token immediately after exchange.
// Supabase Edge Functions may run in parallel isolates; therefore a local
// Promise alone is not safe. This short lease is claimed atomically in Postgres
// before an external refresh request and always released.
async function getAccessToken(clientSecret: string, refreshAheadMs=60000) {
  const started=Date.now();
  for(let attempt=0;attempt<20;attempt++){
    const row=await loadToken();
    if(!row) throw new Error("not_connected");
    const now=Date.now();
    if(row.access_token_cipher && row.access_token_iv && row.access_token_expires_at &&
       new Date(row.access_token_expires_at).getTime()>now+refreshAheadMs){
      return decrypt(clientSecret,row.access_token_cipher,row.access_token_iv);
    }
    const leaseId=randomToken();
    const {data:locked,error:lockError}=await db.from("dgos_whoop_tokens")
      .update({refresh_lock_id:leaseId,refresh_lock_until:new Date(now+26000).toISOString()})
      .eq("id","primary")
      .or("refresh_lock_until.is.null,refresh_lock_until.lt."+new Date(now).toISOString())
      .select("id")
      .maybeSingle();
    if(lockError)throw new Error("whoop_refresh_lock_error");
    if(!locked){
      if(Date.now()-started>24000)throw new Error("whoop_refresh_busy");
      await new Promise(resolve=>setTimeout(resolve,550));
      continue;
    }
    try{
      // Reload under the lease. Another worker could have rotated tokens just
      // before this worker acquired the lock.
      const current=await loadToken();
      if(!current)throw new Error("not_connected");
      if(current.access_token_cipher && current.access_token_iv && current.access_token_expires_at &&
         new Date(current.access_token_expires_at).getTime()>Date.now()+refreshAheadMs){
        return await decrypt(clientSecret,current.access_token_cipher,current.access_token_iv);
      }
      const refresh=await decrypt(clientSecret,current.refresh_token_cipher,current.refresh_token_iv);
      const response=await fetch(WHOOP_TOKEN,{
        method:"POST",
        // WHOOP's OAuth refresh endpoint requires form data, NOT JSON.
        // A JSON body caused HTTP 400 and unnecessary reauthorization prompts.
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
        body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:CLIENT_ID,
          client_secret:clientSecret,scope:"offline"}),
        signal:AbortSignal.timeout(20000)
      });
      if(!response.ok){
        console.warn("whoop_refresh_failed_status",response.status);
        // Only an actual invalid/consumed refresh grant requires consent.
        // Bad request, WHOOP downtime and invalid_client must NOT prompt OAuth.
        const detail=await response.json().catch(()=>({}));
        const error=String(detail?.error||"").toLowerCase();
        if((response.status===400||response.status===401)&&error==="invalid_grant")
          throw new Error("whoop_reauthorize_required");
        throw new Error("whoop_refresh_unavailable");
      }
      const token=await response.json();
      if(!token.access_token||!token.refresh_token)throw new Error("whoop_refresh_invalid_response");
      const [accessEnc,refreshEnc]=await Promise.all([
        encrypt(clientSecret,token.access_token),encrypt(clientSecret,token.refresh_token)
      ]);
      const {data:saved,error:saveError}=await db.from("dgos_whoop_tokens")
        .update({
          refresh_token_cipher:refreshEnc.cipher,refresh_token_iv:refreshEnc.iv,
          access_token_cipher:accessEnc.cipher,access_token_iv:accessEnc.iv,
          access_token_expires_at:new Date(Date.now()+Math.max(60,Number(token.expires_in||3600)-60)*1000).toISOString(),
          scope:String(token.scope||current.scope||""),
          updated_at:new Date().toISOString(),
          refresh_lock_id:null,refresh_lock_until:null
        })
        .eq("id","primary").eq("refresh_lock_id",leaseId)
        .select("id").maybeSingle();
      if(saveError||!saved)throw new Error("whoop_refresh_persistence_failed");
      return token.access_token;
    }finally{
      // No-op when success already released the lease. If a network call
      // fails, release it promptly without exposing any credentials.
      await db.from("dgos_whoop_tokens")
        .update({refresh_lock_id:null,refresh_lock_until:null})
        .eq("id","primary").eq("refresh_lock_id",leaseId);
    }
  }
  throw new Error("whoop_refresh_busy");
}
async function whoopFetch(path: string, access: string) {
  const request=(token:string)=>fetch(WHOOP_API+path,{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
  let r=await request(access);
  if(r.status===401){
    // A scheduled refresh can rotate a token between summary() and fetch().
    // Retry once with the latest token saved by the lease holder.
    const fresh=await getAccessToken(secret());
    if(fresh!==access)r=await request(fresh);
  }
  if(!r.ok) throw new Error("whoop_"+r.status);
  if(r.status===204) return {};
  return r.json();
}
function scored(records: any[]) { return (Array.isArray(records)?records:[]).find(x=>x&&x.score_state==="SCORED"&&x.score)||null; }
function hours(ms: any) { const n=Number(ms); return Number.isFinite(n)?n/3600000:null; }
function sleepMs(s: any) { s=s||{}; return Number(s.total_light_sleep_time_milli||0)+Number(s.total_slow_wave_sleep_time_milli||0)+Number(s.total_rem_sleep_time_milli||0); }
function neededMs(s: any) { s=s||{}; return Math.max(0,Number(s.baseline_milli||0)+Number(s.need_from_sleep_debt_milli||0)+Number(s.need_from_recent_strain_milli||0)+Number(s.need_from_recent_nap_milli||0)); }
function kcal(kj:any){ const n=Number(kj); return Number.isFinite(n)?n/4.184:null; }

Deno.serve(async (req: Request) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const origin=req.headers.get("Origin");
  if(origin && origin!==ALLOWED_ORIGIN) return json({error:"origin_not_allowed"},403);

  const url=new URL(req.url);
  const action=url.pathname.split("/").filter(Boolean).pop()||"";
  const clientSecret=secret();

  try{
    if(action==="status"){
      const row=await loadToken();
      return json({configured:Boolean(clientSecret),connected:Boolean(row),authenticated:await validSession(req)});
    }

    if(!clientSecret) return json({error:"whoop_not_configured"},503);

    if(action==="maintenance"){
      if(req.method!=="POST")return json({error:"method_not_allowed"},405);
      if(!(await validMaintenanceRequest(req)))return json({error:"not_authorized"},401);
      const row=await loadToken();
      if(!row)return json({error:"not_connected"},409);
      try{
        // 30-minute cron keeps credentials rotated without an open iPhone app.
        // Refresh early; uses the SAME exclusive database lease as summary().
        await getAccessToken(clientSecret,31*60*1000);
        await keepaliveResult("ok");
        return json({ok:true});
      }catch(e){
        if(e instanceof Error&&e.message==="whoop_reauthorize_required"){
          await keepaliveResult("reauthorize_required");
          return json({error:"whoop_reauthorize_required"},409);
        }
        await keepaliveResult("temporarily_unavailable");
        return json({error:"whoop_temporarily_unavailable"},503);
      }
    }

    if(action==="device-auth-start"){
      if(req.method!=="POST") return json({error:"method_not_allowed"},405);
      if(origin!==ALLOWED_ORIGIN) return json({error:"origin_required"},403);
      const body=await readJson(req);
      const claimSecret=validClaimSecret(body.claimSecret);
      if(!claimSecret) return json({error:"invalid_claim"},400);

      const now=new Date().toISOString();
      await Promise.all([
        db.from("dgos_whoop_oauth_states").delete().lt("expires_at",now),
        db.from("dgos_whoop_device_claims").delete().lt("expires_at",now)
      ]);

      const state=randomState();
      const stateHash=await sha256(state);
      const claimHash=await sha256(claimSecret);
      const expiresAt=new Date(Date.now()+10*60*1000).toISOString();

      const {error:stateError}=await db.from("dgos_whoop_oauth_states").insert({state_hash:stateHash,expires_at:expiresAt});
      if(stateError) throw stateError;
      const {error:claimError}=await db.from("dgos_whoop_device_claims").insert({
        state_hash:stateHash,
        claim_hash:claimHash,
        expires_at:expiresAt
      });
      if(claimError){
        await db.from("dgos_whoop_oauth_states").delete().eq("state_hash",stateHash);
        throw claimError;
      }

      const p=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:"code",scope:SCOPES.join(" "),state});
      return json({authorizationUrl:WHOOP_AUTH+"?"+p.toString(),expiresInSeconds:600});
    }

    if(action==="device-auth-claim"){
      if(req.method!=="POST") return json({error:"method_not_allowed"},405);
      if(origin!==ALLOWED_ORIGIN) return json({error:"origin_required"},403);
      const body=await readJson(req);
      const claimSecret=validClaimSecret(body.claimSecret);
      if(!claimSecret) return json({error:"invalid_claim"},400);

      const claimHash=await sha256(claimSecret);
      const now=new Date().toISOString();
      const {data:claim,error:claimError}=await db.from("dgos_whoop_device_claims")
        .select("state_hash,session_cipher,session_iv,completed_at,expires_at")
        .eq("claim_hash",claimHash)
        .gt("expires_at",now)
        .maybeSingle();
      if(claimError) throw claimError;
      if(!claim) return json({error:"claim_expired"},410);
      if(!claim.completed_at||!claim.session_cipher||!claim.session_iv) return json({error:"claim_pending"},409);

      const session=await decrypt(clientSecret,claim.session_cipher,claim.session_iv);
      await db.from("dgos_whoop_device_claims").delete().eq("claim_hash",claimHash);
      return json({session,expiresInDays:180});
    }

    if(action==="start"){
      const state=randomState();
      const hash=await sha256(state);
      await db.from("dgos_whoop_oauth_states").delete().lt("expires_at",new Date().toISOString());
      const {error}=await db.from("dgos_whoop_oauth_states").insert({state_hash:hash,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
      if(error) throw error;
      const p=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:"code",scope:SCOPES.join(" "),state});
      return redirect(WHOOP_AUTH+"?"+p.toString());
    }

    if(action==="callback"){
      const code=url.searchParams.get("code")||"";
      const state=url.searchParams.get("state")||"";
      if(!code||!state) return redirect(REDIRECT_URI+"#error=missing_oauth_response");
      const hash=await sha256(state);
      const {data}=await db.from("dgos_whoop_oauth_states").select("state_hash").eq("state_hash",hash).gt("expires_at",new Date().toISOString()).maybeSingle();
      if(!data) return redirect(REDIRECT_URI+"#error=invalid_state");
      const tokenResponse=await fetch(WHOOP_TOKEN,{
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
        body:new URLSearchParams({grant_type:"authorization_code",code,client_id:CLIENT_ID,client_secret:clientSecret,redirect_uri:REDIRECT_URI})
      });
      const tokenText=await tokenResponse.text();
      let token:any={};
      try{ token=tokenText?JSON.parse(tokenText):{}; }catch{}
      if(!tokenResponse.ok){
        await diagnostic("token_exchange",tokenResponse.status,token.error||"token_exchange_failed",token.error_description||token.message||"");
        return redirect(REDIRECT_URI+"#error=token_exchange_failed");
      }
      if(!token.access_token||!token.refresh_token){
        await diagnostic("token_payload",tokenResponse.status,!token.access_token?"missing_access_token":"missing_refresh_token","offline scope or token payload incomplete");
        return redirect(REDIRECT_URI+"#error=missing_token");
      }
      const [accessEnc,refreshEnc]=await Promise.all([encrypt(clientSecret,token.access_token),encrypt(clientSecret,token.refresh_token)]);
      await saveToken({
        refresh_token_cipher:refreshEnc.cipher,refresh_token_iv:refreshEnc.iv,
        access_token_cipher:accessEnc.cipher,access_token_iv:accessEnc.iv,
        access_token_expires_at:new Date(Date.now()+Math.max(60,Number(token.expires_in||3600)-60)*1000).toISOString(),
        scope:String(token.scope||SCOPES.join(" "))
      });

      const session=await issueWhoopSession();
      const {data:handoff}=await db.from("dgos_whoop_device_claims")
        .select("claim_hash")
        .eq("state_hash",hash)
        .gt("expires_at",new Date().toISOString())
        .maybeSingle();

      await db.from("dgos_whoop_oauth_states").delete().eq("state_hash",hash);

      if(handoff){
        const sessionEnc=await encrypt(clientSecret,session);
        const {error:handoffError}=await db.from("dgos_whoop_device_claims").update({
          session_cipher:sessionEnc.cipher,
          session_iv:sessionEnc.iv,
          completed_at:new Date().toISOString(),
          expires_at:new Date(Date.now()+15*60*1000).toISOString()
        }).eq("state_hash",hash);
        if(handoffError) throw handoffError;
        return redirect(REDIRECT_URI+"#handoff=complete");
      }

      return redirect(REDIRECT_URI+"#session="+encodeURIComponent(session));
    }

    if(action==="device-session"){
      if(req.method!=="POST") return json({error:"method_not_allowed"},405);
      if(!(await validDeviceSession(req))) return json({error:"device_session_required"},401);
      const row=await loadToken();
      if(!row) return json({error:"whoop_not_connected"},409);
      const session=await issueWhoopSession();
      return json({session,expiresInDays:180});
    }

    // WHOOP history is exclusively available to the already-authorized
    // DG OS owner device. No anon PostgREST access to health data.
    if(action==="history"){
      if(req.method!=="GET")return json({error:"method_not_allowed"},405);
      if(!(await validSession(req)))return json({error:"session_required"},401);
      const {data,error}=await db.from("dgos_whoop_sleep_history")
        .select("sleep_date,sleep_start,wake_time,duration_min,in_bed_min,deep_min,rem_min,light_min,awake_min,needed_min,performance,efficiency,consistency,respiratory_rate,source")
        .order("sleep_date",{ascending:false}).limit(650);
      if(error)throw new Error("whoop_history_read_failed");
      return json({records:data||[],count:(data||[]).length});
    }

    if(action==="history-import"){
      if(req.method!=="POST")return json({error:"method_not_allowed"},405);
      if(origin!==ALLOWED_ORIGIN)return json({error:"origin_required"},403);
      if(!(await validSession(req)))return json({error:"session_required"},401);
      const length=Number(req.headers.get("content-length")||0);
      if(length>340000)return json({error:"import_too_large"},413);
      const body=await readJson(req);
      if(!Array.isArray(body?.records)||!body.records.length||body.records.length>650)
        return json({error:"invalid_history_rows"},400);
      const intField=(value:any,max:number)=>{
        if(value===undefined||value===null||value==="")return null;
        if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>max)return null;
        return Math.round(value);
      };
      const timestamp=(value:any)=>{
        if(value===null||value===undefined||value==="")return null;
        if(typeof value!=="string"||value.length>45)return null;
        const date=new Date(value);
        return Number.isFinite(date.getTime())?date.toISOString():null;
      };
      const cleaned:any[]=[];
      for(const record of body.records){
        if(!record||typeof record!=="object"||!/^20[12][0-9]-[01][0-9]-[0-3][0-9]$/.test(record.sleep_date||""))
          return json({error:"invalid_sleep_date"},400);
        const duration=intField(record.duration_min,1500);
        const day=Date.parse(record.sleep_date+"T12:00:00Z");
        if(duration===null||duration===0||!Number.isFinite(day)||
          day<Date.parse("2020-01-01")||day>Date.now()+86400000)
          return json({error:"invalid_sleep_duration"},400);
        cleaned.push({
          sleep_date:record.sleep_date, sleep_start:timestamp(record.sleep_start),
          wake_time:timestamp(record.wake_time),duration_min:duration,
          in_bed_min:intField(record.in_bed_min,1800),
          deep_min:intField(record.deep_min,1500),
          rem_min:intField(record.rem_min,1500),
          light_min:intField(record.light_min,1500),
          awake_min:intField(record.awake_min,1500),
          needed_min:intField(record.needed_min,1800),
          performance:intField(record.performance,100),
          efficiency:intField(record.efficiency,100),
          consistency:intField(record.consistency,100),
          respiratory_rate:intField(record.respiratory_rate,100),
          source:"export",updated_at:new Date().toISOString()
        });
      }
      // A repeated export import updates existing dates instead of duplicating
      // them. Preserve already-fetched live WHOOP values on conflicts.
      const unique=[...new Map(cleaned.map(record=>[record.sleep_date,record])).values()];
      let saved=0;
      for(let i=0;i<unique.length;i+=70){
        const chunk=unique.slice(i,i+70);
        const dates=chunk.map(row=>row.sleep_date);
        const {data:live,error:readError}=await db.from("dgos_whoop_sleep_history")
          .select("sleep_date").in("sleep_date",dates).eq("source","whoop_live");
        if(readError)throw new Error("whoop_history_import_lookup_failed");
        const keepLive=new Set((live||[]).map(row=>row.sleep_date));
        const rows=chunk.filter(row=>!keepLive.has(row.sleep_date));
        if(!rows.length)continue;
        const {error}=await db.from("dgos_whoop_sleep_history").upsert(rows,{onConflict:"sleep_date"});
        if(error)throw new Error("whoop_history_import_failed");
        saved+=rows.length;
      }
      return json({ok:true,imported:saved,total:unique.length});
    }

    if(action==="summary"){
      if(!(await validSession(req)) && !(await internalAuthorized(req))) return json({error:"session_required"},401);
      let access: string;
      try {
        access=await getAccessToken(clientSecret);
      }catch(e) {
        if(e instanceof Error && e.message==="whoop_reauthorize_required")
          return json({error:"whoop_reauthorize_required"},409);
        return json({error:"whoop_temporarily_unavailable"},503);
      }
      const [recoveries,sleeps,cycles,workouts,profile,body]=await Promise.all([
        whoopFetch("/recovery?limit=5",access),
        whoopFetch("/activity/sleep?limit=10",access),
        whoopFetch("/cycle?limit=5",access),
        whoopFetch("/activity/workout?limit=5",access),
        whoopFetch("/user/profile/basic",access),
        whoopFetch("/user/measurement/body",access)
      ]);
      const recovery=scored(recoveries.records);
      const sleep=(Array.isArray(sleeps.records)?sleeps.records:[]).find((x:any)=>x&&!x.nap&&x.score_state==="SCORED"&&x.score)||null;
      const cycle=scored(cycles.records);
      const ss=sleep?.score||null, stages=ss?.stage_summary||null, need=ss?.sleep_needed||null;
      // Keep the most recent real WHOOP sleep in history, so future days
      // automatically extend the imported export without manual action.
      if(sleep?.end && stages){
        const localDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(sleep.end));
        const record={
          sleep_date:localDate,sleep_start:sleep.start,wake_time:sleep.end,
          duration_min:Math.round(sleepMs(stages)/60000),
          in_bed_min:Math.round(Number(stages.total_in_bed_time_milli||0)/60000),
          deep_min:Math.round(Number(stages.total_slow_wave_sleep_time_milli||0)/60000),
          rem_min:Math.round(Number(stages.total_rem_sleep_time_milli||0)/60000),
          light_min:Math.round(Number(stages.total_light_sleep_time_milli||0)/60000),
          awake_min:Math.round(Number(stages.total_awake_time_milli||0)/60000),
          needed_min:Math.round(neededMs(need)/60000),
          performance:ss.sleep_performance_percentage??null,
          efficiency:ss.sleep_efficiency_percentage??null,
          consistency:ss.sleep_consistency_percentage??null,
          respiratory_rate:ss.respiratory_rate??null,source:"whoop_live",
          updated_at:new Date().toISOString()
        };
        if(record.duration_min>0&&record.duration_min<=1500){
          const {error:historyError}=await db.from("dgos_whoop_sleep_history").upsert(record,{onConflict:"sleep_date"});
          if(historyError)console.warn("whoop_sleep_history_sync_failed");
        }
      }
      return json({
        updatedAt:new Date().toISOString(),
        recovery: recovery ? {
          score:recovery.score.recovery_score??null, restingHeartRate:recovery.score.resting_heart_rate??null,
          hrvMs:recovery.score.hrv_rmssd_milli??null, spo2:recovery.score.spo2_percentage??null,
          skinTempC:recovery.score.skin_temp_celsius??null, userCalibrating:Boolean(recovery.score.user_calibrating)
        }:null,
        sleep: sleep ? {
          id:sleep.id,start:sleep.start,end:sleep.end,durationHours:hours(sleepMs(stages)),
          timeInBedHours:hours(stages?.total_in_bed_time_milli),awakeHours:hours(stages?.total_awake_time_milli),
          lightHours:hours(stages?.total_light_sleep_time_milli),deepHours:hours(stages?.total_slow_wave_sleep_time_milli),
          remHours:hours(stages?.total_rem_sleep_time_milli),neededHours:hours(neededMs(need)),
          performance:ss.sleep_performance_percentage??null,consistency:ss.sleep_consistency_percentage??null,
          efficiency:ss.sleep_efficiency_percentage??null,respiratoryRate:ss.respiratory_rate??null,
          disturbances:stages?.disturbance_count??null,cycles:stages?.sleep_cycle_count??null
        }:null,
        cycle: cycle ? {
          start:cycle.start,end:cycle.end,strain:cycle.score.strain??null,kilojoule:cycle.score.kilojoule??null,
          calories:kcal(cycle.score.kilojoule),averageHeartRate:cycle.score.average_heart_rate??null,maxHeartRate:cycle.score.max_heart_rate??null
        }:null,
        workouts:(Array.isArray(workouts.records)?workouts.records:[]).filter((w:any)=>w&&w.score_state==="SCORED"&&w.score).slice(0,5).map((w:any)=>({
          id:w.id,name:w.sport_name||"Workout",start:w.start,end:w.end,strain:w.score.strain??null,
          averageHeartRate:w.score.average_heart_rate??null,maxHeartRate:w.score.max_heart_rate??null,
          calories:kcal(w.score.kilojoule),distanceMeter:w.score.distance_meter??null
        })),
        profile:profile?{firstName:profile.first_name||"",lastName:profile.last_name||"",email:profile.email||""}:null,
        body:body?{heightMeter:body.height_meter??null,weightKg:body.weight_kilogram??null,maxHeartRate:body.max_heart_rate??null}:null
      });
    }

    if(action==="disconnect"){
      if(req.method!=="POST") return json({error:"method_not_allowed"},405);
      if(!(await validSession(req))) return json({error:"session_required"},401);
      try{
        const access=await getAccessToken(clientSecret);
        await fetch(WHOOP_API+"/user/access",{method:"DELETE",headers:{Authorization:"Bearer "+access}});
      }catch{}
      await db.from("dgos_whoop_tokens").delete().eq("id","primary");
      await db.from("dgos_whoop_sessions").delete().neq("token_hash","");
      return json({ok:true});
    }

    return json({error:"not_found"},404);
  }catch(e){
    console.error("WHOOP connector error", e instanceof Error ? e.message : String(e));
    return json({error:"internal_error"},500);
  }
});
