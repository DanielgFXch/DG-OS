// DG Jarvis Vantage Bridge receiver. Strict opt-in: secret gate + private RLS table.
// A TradingView alert is INDICATOR_REPORTED, not a verified market fact or trade.
// Existing dgos-tradingview (sweep alert transport) remains untouched.
const SOURCE = "VANTAGE:XAUUSD";
const VALID_FRAMES = new Set(["1S","5S","10S","15S","30S","45S","1","2","3","5"]);
const VALID_HTF = new Set(["60","240","D"]);
const VALID_SESSION = new Set(["ASIA","LONDON","NY"]);
const VALID_PHASE = new Set(["FORMING","FINAL"]);
const bytes = new TextEncoder();
const reply = (status,body)=>new Response(JSON.stringify(body), {
  status, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
async function fingerprint(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes.encode(value)));
}
const hex = bytes=>Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
async function equalSecret(actual,expected) {
  const a=await fingerprint(actual),b=await fingerprint(expected);
  let diff=0;
  for(let i=0;i<32;i++)diff|=a[i]^b[i];
  return diff===0&&actual.length>0;
}
function number(x) {
  if(typeof x!=="number"||!Number.isFinite(x)||x<=0||x>=1000000)return null;
  return x;
}
function millis(x) {
  return typeof x==="number"&&Number.isSafeInteger(x)&&x>0?x:null;
}
function validDate(x) {
  if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const t=Date.parse(x+"T00:00:00Z");
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;
}
function normalize(body,now) {
  if(!body||typeof body!=="object"||Array.isArray(body)||body.symbol!==SOURCE)return null;
  const type=body.eventType,at=millis(body.eventAtMs);
  if(!at||at>now+300000||at<now-172800000)return null;
  const h=number(body.high),l=number(body.low);
  if(h===null||l===null||h<l)return null;
  const base={
    event_type:type,symbol:SOURCE,timeframe:body.timeframe,
    high_price:h,low_price:l,event_at:new Date(at).toISOString(),
    source_type:"TRADINGVIEW_INDICATOR",evidence_status:"INDICATOR_REPORTED",
    session_timezone:"Europe/Zurich",session_name:null,session_day:null,phase:null,
    open_price:null,close_price:null,candle_start_at:null
  };
  if(type==="SESSION_LEVELS") {
    if(!VALID_FRAMES.has(body.timeframe)||!VALID_SESSION.has(body.session)||
      !VALID_PHASE.has(body.phase)||!validDate(body.sessionDay))return null;
    const sessionAt=Date.parse(body.sessionDay+"T00:00:00Z");
    if(Math.abs(now-sessionAt)>4*86400000)return null;
    base.session_name=body.session;
    base.session_day=body.sessionDay;
    base.phase=body.phase;
    const bucket=body.phase==="FORMING"?Math.floor(at/900000):"FINAL";
    return {row:base,key:[SOURCE,type,body.session,body.sessionDay,bucket].join("|")};
  }
  if(type==="HTF_BAR_CLOSED"){
    if(!VALID_HTF.has(body.timeframe))return null;
    const o=number(body.open),c=number(body.close),start=millis(body.candleStartMs);
    if(o===null||c===null||o<l||o>h||c<l||c>h||!start||
      start>at||start<now-8*86400000)return null;
    base.open_price=o;
    base.close_price=c;
    base.candle_start_at=new Date(start).toISOString();
    return {row:base,key:[SOURCE,type,body.timeframe,start].join("|")};
  }
  return null;
}
Deno.serve(async req=>{
  if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
  const secret=Deno.env.get("DGOS_TRADINGVIEW_WEBHOOK_SECRET")||"";
  if(secret.length<32)return reply(503,{error:"not_configured"});
  if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json")){
    return reply(415,{error:"json_required"});
  }
  if(Number(req.headers.get("content-length")||"0")>4096)return reply(413,{error:"too_large"});
  let body;
  try{
    const raw=await req.text();
    if(raw.length>4096)return reply(413,{error:"too_large"});
    body=JSON.parse(raw);
  }catch{return reply(400,{error:"invalid_json"});}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     !(await equalSecret(typeof body.secret==="string"?body.secret:"",secret))){
    return reply(401,{error:"unauthorized"});
  }
  const event=normalize(body,Date.now());
  if(!event)return reply(422,{error:"invalid_snapshot"});
  const base=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!base.startsWith("https://")||!serviceKey)return reply(503,{error:"persistence_not_configured"});
  const eventKey=hex(await fingerprint(event.key));
  try {
    const res=await fetch(base+"/rest/v1/dgos_vantage_snapshots?on_conflict=event_key", {
      method:"POST",
      headers:{
        apikey:serviceKey,Authorization:"Bearer "+serviceKey,
        "Content-Type":"application/json",
        Prefer:"resolution=ignore-duplicates,return=minimal"
      },
      body:JSON.stringify([{...event.row,event_key:eventKey}]),
      signal:AbortSignal.timeout(1800)
    });
    if(!res.ok)return reply(503,{error:"snapshot_not_saved"});
    return reply(200,{ok:true,status:"INDICATOR_REPORTED",recorded:true});
  }catch{return reply(503,{error:"snapshot_not_saved"});}
});
