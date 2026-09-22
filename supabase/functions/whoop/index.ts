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
async function getAccessToken(clientSecret: string) {
  let row=await loadToken();
  if(!row) throw new Error("not_connected");
  const now=Date.now();
  if(row.access_token_cipher && row.access_token_iv && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime()>now+60000){
    return decrypt(clientSecret,row.access_token_cipher,row.access_token_iv);
  }
  const refresh=await decrypt(clientSecret,row.refresh_token_cipher,row.refresh_token_iv);
  const response=await fetch(WHOOP_TOKEN,{
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({grant_type:"refresh_token",refresh_token:refresh,client_id:CLIENT_ID,client_secret:clientSecret,scope:"offline"})
  });
  if(!response.ok) throw new Error("refresh_failed_"+response.status);
  const token=await response.json();
  if(!token.access_token||!token.refresh_token) throw new Error("refresh_missing_token");
  const [accessEnc,refreshEnc]=await Promise.all([encrypt(clientSecret,token.access_token),encrypt(clientSecret,token.refresh_token)]);
  await saveToken({
    refresh_token_cipher:refreshEnc.cipher,refresh_token_iv:refreshEnc.iv,
    access_token_cipher:accessEnc.cipher,access_token_iv:accessEnc.iv,
    access_token_expires_at:new Date(Date.now()+Math.max(60,Number(token.expires_in||3600)-60)*1000).toISOString(),
    scope:String(token.scope||row.scope||"")
  });
  return token.access_token;
}
async function whoopFetch(path: string, access: string) {
  const r=await fetch(WHOOP_API+path,{headers:{Authorization:"Bearer "+access,Accept:"application/json"}});
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
      await db.from("dgos_whoop_oauth_states").delete().eq("state_hash",hash);
      const [accessEnc,refreshEnc]=await Promise.all([encrypt(clientSecret,token.access_token),encrypt(clientSecret,token.refresh_token)]);
      await saveToken({
        refresh_token_cipher:refreshEnc.cipher,refresh_token_iv:refreshEnc.iv,
        access_token_cipher:accessEnc.cipher,access_token_iv:accessEnc.iv,
        access_token_expires_at:new Date(Date.now()+Math.max(60,Number(token.expires_in||3600)-60)*1000).toISOString(),
        scope:String(token.scope||SCOPES.join(" "))
      });

      const session=await issueWhoopSession();
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

    if(action==="summary"){
      if(!(await validSession(req)) && !(await internalAuthorized(req))) return json({error:"session_required"},401);
      const access=await getAccessToken(clientSecret);
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
