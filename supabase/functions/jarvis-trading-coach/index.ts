import { createClient } from "npm:@supabase/supabase-js@2";

/* DG OS · private owner-only SMC setup coaching journal.
 * Stores only owner-entered ratings, context, notes and optional self-reported R.
 * No chart screenshots, wallet credentials, order placement or background learning.
 * All access requires SHA-256 verified Jarvis Telegram paired-device session.
 */
const ORIGIN="https://danielgfxch.github.io";
const url=Deno.env.get("SUPABASE_URL")||"";
let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!key){try{key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{}}
const db=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const categories={
  label:["good","avoid","missed"],
  side:["buy","sell","watch"],
  session:["asia","london","new_york","zvieri","other"],
  timeframe:["m1","m5","m15","h1","h4","d1"],
  liquidity:["sweep","touch","none","unknown"],
  zone:["fvg","order_block","ote","breaker","none","unknown"],
  confirmation:["m5_engulfing","m1_structure","bos_choch","rejection","none","unknown"]
} as const;
const requestRate=new Map<string,number>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function headers(origin:string,extra:Record<string,string>={}){
  return {"cache-control":"no-store","vary":"Origin","x-content-type-options":"nosniff",
    ...(origin===ORIGIN?{"access-control-allow-origin":ORIGIN}:{}),...extra};
}
function json(value:unknown,status:number,origin:string){
  return new Response(JSON.stringify(value),{status,headers:headers(origin,{"content-type":"application/json; charset=utf-8"})});
}
function b64url(bytes:Uint8Array){
  let out="";for(const b of bytes)out+=String.fromCharCode(b);
  return btoa(out).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function ownerId(req:Request):Promise<string|null>{
  if(!db)return null;
  const token=(req.headers.get("authorization")||"").match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  if(!token)return null;
  const hash=b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token[1]))));
  const [session,owner]=await Promise.all([
    db.from("dgos_device_sessions").select("chat_id").eq("token_hash",hash)
      .gt("expires_at",new Date().toISOString()).maybeSingle(),
    db.from("dgos_telegram_config").select("chat_id").eq("id","primary").maybeSingle()
  ]);
  if(session.error||owner.error||!session.data?.chat_id||!owner.data?.chat_id)return null;
  return String(session.data.chat_id)===String(owner.data.chat_id)?String(owner.data.chat_id):null;
}
function toPublic(row:any){
  return {id:row.id,label:row.label,side:row.side,session:row.session,
    timeframe:row.timeframe,liquidity:row.liquidity,zone:row.zone,
    confirmation:row.confirmation,note:row.note||"",
    resultR:row.result_r==null?null:Number(row.result_r),createdAt:row.created_at};
}
const isEnum=(field:keyof typeof categories,value:unknown)=>typeof value==="string" &&
  (categories[field] as readonly string[]).includes(value);
function validate(data:any){
  if(!data||typeof data!=="object"||Array.isArray(data))return null;
  const entries=Object.keys(categories) as (keyof typeof categories)[];
  if(entries.some(k=>!isEnum(k,data[k])))return null;
  const note=typeof data.note==="string"?data.note.trim():"";
  if(note.length<8||note.length>800)return null;
  const num=data.resultR==null||data.resultR===""?null:Number(data.resultR);
  if(data.label==='missed'&&num!==null)return null;
  if(num!==null&&(!Number.isFinite(num)||num < -20||num > 100||
     Math.abs(Math.round(num*100)-num*100)>0.0000001))return null;
  return {label:data.label,side:data.side,session:data.session,timeframe:data.timeframe,
    liquidity:data.liquidity,zone:data.zone,confirmation:data.confirmation,
    note,result_r:num};
}
function throttled(owner:string,delay:number){
  const now=Date.now(),prev=requestRate.get(owner)||0;
  if(now-prev<delay)return true;
  requestRate.set(owner,now);
  if(requestRate.size>500)requestRate.clear();
  return false;
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(origin&&origin!==ORIGIN)return json({error:"origin_not_allowed"},403,origin);
  if(req.method==="OPTIONS")return new Response(null,{
    status:origin===ORIGIN?204:403,
    headers:headers(origin,{"access-control-allow-methods":"GET, POST, OPTIONS",
      "access-control-allow-headers":"authorization, content-type","access-control-max-age":"600"})});
  if(!["GET","POST"].includes(req.method))return json({error:"method_not_allowed"},405,origin);
  if(!db)return json({error:"backend_unavailable"},503,origin);
  const owner=await ownerId(req).catch(()=>null);
  if(!owner)return json({error:"device_pairing_required"},401,origin);
  try{
    const action=new URL(req.url).searchParams.get("action")||(req.method==="GET"?"list":"");
    if(req.method==="GET" && action==="list"){
      const {data,error}=await db.from("dgos_trading_coach_examples")
        .select("id,label,side,session,timeframe,liquidity,zone,confirmation,note,result_r,created_at")
        .eq("owner_chat_id",owner).order("created_at",{ascending:false}).limit(250);
      if(error)throw Error("read_error");
      return json({items:(data||[]).map(toPublic),source:"owner_manual",
        note:"Persönliche Setup-Bewertungen, keine verifizierte Broker-Performance."},200,origin);
    }
    if(req.method!=="POST")return json({error:"invalid_action"},400,origin);
    if(Number(req.headers.get("content-length")||0)>5000)return json({error:"payload_too_large"},413,origin);
    const raw=await req.text();
    if(raw.length>5000)return json({error:"payload_too_large"},413,origin);
    let data:any;try{data=JSON.parse(raw);}catch{return json({error:"invalid_json"},400,origin);}
    if(action==="create"){
      if(throttled(owner,850))return json({error:"slow_down"},429,origin);
      const row=validate(data);
      if(!row)return json({error:"invalid_example"},400,origin);
      const {count,error:countError}=await db.from("dgos_trading_coach_examples")
        .select("id",{head:true,count:"exact"}).eq("owner_chat_id",owner);
      if(countError)throw Error("count_error");
      if((count||0)>=250)return json({error:"example_limit_reached"},409,origin);
      const {data:inserted,error}=await db.from("dgos_trading_coach_examples")
        .insert({...row,owner_chat_id:owner,symbol:"XAUUSD",source:"owner_manual"})
        .select("id,label,side,session,timeframe,liquidity,zone,confirmation,note,result_r,created_at").single();
      if(error)throw Error("write_error");
      return json({item:toPublic(inserted),stored:true},201,origin);
    }
    if(action==="delete"){
      const uid=typeof data?.id==="string"?data.id:"";
      if(!UUID.test(uid))return json({error:"invalid_id"},400,origin);
      const {data:deleted,error}=await db.from("dgos_trading_coach_examples")
        .delete().eq("id",uid).eq("owner_chat_id",owner).select("id").maybeSingle();
      if(error)throw Error("delete_error");
      return json({deleted:Boolean(deleted)},200,origin);
    }
    return json({error:"invalid_action"},400,origin);
  }catch{
    return json({error:"temporary_failure"},503,origin);
  }
});
