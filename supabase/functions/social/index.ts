import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://danielgfxch.github.io";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
}
function b64url(bytes: Uint8Array){
  let s=""; bytes.forEach(b=>s+=String.fromCharCode(b));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256(value:string){
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));
}
function cleanText(v:any,max:number){ return String(v??"").trim().slice(0,max); }
function cleanAccount(v:any){ const s=cleanText(v,20); return s==="business"||s==="private"?s:""; }
function cleanUsername(v:any){
  const s=String(v??"").trim().replace(/^@+/,"").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s)?s:"";
}
function cleanUsers(v:any){
  if(!Array.isArray(v)) return [];
  return [...new Set(v.map(cleanUsername).filter(Boolean))].slice(0,100000);
}
function cleanDecision(v:any){ return ["keep","removed","later"].includes(v)?v:null; }

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!serviceKey){ try{ serviceKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||""; }catch{} }
const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

async function authorized(req:Request){
  const h=req.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer ")) return false;
  const token=h.slice(7).trim(); if(!token) return false;
  const hash=await sha256(token);
  const now=new Date().toISOString();

  const {data:device}=await db.from("dgos_device_sessions")
    .select("token_hash").eq("token_hash",hash).gt("expires_at",now).maybeSingle();
  if(device){
    await db.from("dgos_device_sessions").update({last_seen_at:now}).eq("token_hash",hash);
    return true;
  }
  const {data:legacy}=await db.from("dgos_whoop_sessions")
    .select("token_hash").eq("token_hash",hash).gt("expires_at",now).maybeSingle();
  return Boolean(legacy);
}
async function readBody(req:Request){ try{return await req.json();}catch{return{};} }

async function allRelationships(accountKey:string){
  const rows:any[]=[];
  for(let from=0;;from+=1000){
    const {data,error}=await db.from("dgos_social_relationships")
      .select("*").eq("account_key",accountKey).range(from,from+999);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data||data.length<1000)break;
    if(rows.length>=100000)break;
  }
  return rows;
}
async function batchUpsert(rows:any[]){
  for(let i=0;i<rows.length;i+=500){
    const {error}=await db.from("dgos_social_relationships")
      .upsert(rows.slice(i,i+500),{onConflict:"account_key,username"});
    if(error)throw error;
  }
}
async function batchInsertEvents(rows:any[]){
  for(let i=0;i<rows.length;i+=500){
    const {error}=await db.from("dgos_social_events").insert(rows.slice(i,i+500));
    if(error)throw error;
  }
}
async function snapshotAtOrBefore(accountKey:string, iso:string){
  const {data,error}=await db.from("dgos_social_snapshots")
    .select("followers_count,following_count,captured_at")
    .eq("account_key",accountKey).lte("captured_at",iso)
    .order("captured_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return data||null;
}
function delta(current:number, previous:any){
  if(!previous)return null;
  return current-Number(previous.followers_count||0);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const origin=req.headers.get("Origin");
  if(origin && origin!==ALLOWED_ORIGIN) return json({error:"origin_not_allowed"},403);
  if(!(await authorized(req))) return json({error:"session_required"},401);

  const url=new URL(req.url);
  const action=url.pathname.split("/").filter(Boolean).pop()||"";

  try{
    if(req.method==="GET" && action==="dashboard"){
      const accountKey=cleanAccount(url.searchParams.get("accountKey"));
      if(!accountKey)return json({error:"invalid_account"},400);

      const {data:account,error:accountError}=await db.from("dgos_social_accounts")
        .select("*").eq("account_key",accountKey).maybeSingle();
      if(accountError)throw accountError;
      if(!account)return json({account:null,history:[],metrics:null,recentEvents:[]});

      const {data:history,error:historyError}=await db.from("dgos_social_snapshots")
        .select("id,captured_at,followers_count,following_count,source")
        .eq("account_key",accountKey).order("captured_at",{ascending:false}).limit(90);
      if(historyError)throw historyError;
      const latest=(history||[])[0]||null;
      if(!latest)return json({account,history:[],metrics:null,recentEvents:[]});

      const now=new Date(latest.captured_at).getTime();
      const [day,week,month,cleanupRes,eventRes]=await Promise.all([
        snapshotAtOrBefore(accountKey,new Date(now-24*60*60*1000).toISOString()),
        snapshotAtOrBefore(accountKey,new Date(now-7*24*60*60*1000).toISOString()),
        snapshotAtOrBefore(accountKey,new Date(now-30*24*60*60*1000).toISOString()),
        db.from("dgos_social_relationships").select("username",{count:"exact",head:true})
          .eq("account_key",accountKey).eq("is_following",true).eq("is_follower",false).eq("whitelisted",false)
          .or("decision.is.null,decision.eq.later"),
        db.from("dgos_social_events").select("event_type,username,occurred_at")
          .eq("account_key",accountKey).order("occurred_at",{ascending:false}).limit(20)
      ]);
      if(cleanupRes.error)throw cleanupRes.error;
      if(eventRes.error)throw eventRes.error;

      return json({
        account,
        history:(history||[]).slice().reverse(),
        metrics:{
          followers:Number(latest.followers_count||0),
          following:Number(latest.following_count||0),
          delta1d:delta(Number(latest.followers_count||0),day),
          delta7d:delta(Number(latest.followers_count||0),week),
          delta30d:delta(Number(latest.followers_count||0),month),
          cleanup:cleanupRes.count||0,
          capturedAt:latest.captured_at,
          source:latest.source
        },
        recentEvents:eventRes.data||[]
      });
    }

    if(req.method==="GET" && action==="cleanup"){
      const accountKey=cleanAccount(url.searchParams.get("accountKey"));
      if(!accountKey)return json({error:"invalid_account"},400);
      const {data,error}=await db.from("dgos_social_relationships")
        .select("username,decision,whitelisted,state_changed_at")
        .eq("account_key",accountKey).eq("is_following",true).eq("is_follower",false).eq("whitelisted",false)
        .or("decision.is.null,decision.eq.later")
        .order("state_changed_at",{ascending:false}).limit(250);
      if(error)throw error;
      return json({items:data||[]});
    }

    if(req.method==="POST" && action==="decision"){
      const body=await readBody(req);
      const accountKey=cleanAccount(body.accountKey);
      const username=cleanUsername(body.username);
      if(!accountKey||!username)return json({error:"invalid_request"},400);
      const patch:any={last_seen_at:new Date().toISOString()};
      if("decision" in body)patch.decision=cleanDecision(body.decision);
      if("whitelisted" in body)patch.whitelisted=Boolean(body.whitelisted);
      const {data,error}=await db.from("dgos_social_relationships").update(patch)
        .eq("account_key",accountKey).eq("username",username).select("*").maybeSingle();
      if(error)throw error;
      if(!data)return json({error:"not_found"},404);
      return json({relationship:data});
    }

    if(req.method==="POST" && action==="import-snapshot"){
      const body=await readBody(req);
      const accountKey=cleanAccount(body.accountKey);
      const handle=cleanUsername(body.handle);
      const followers=cleanUsers(body.followers);
      const following=cleanUsers(body.following);
      if(!accountKey)return json({error:"invalid_account"},400);
      if(!followers.length && !following.length)return json({error:"empty_import"},400);

      const now=new Date().toISOString();
      const accountType=accountKey==="private"?"private":"unknown";
      const {error:accountError}=await db.from("dgos_social_accounts").upsert({
        account_key:accountKey,
        platform:"instagram",
        handle:handle||null,
        account_type:accountType,
        source_mode:"export",
        last_import_at:now,
        updated_at:now
      },{onConflict:"account_key"});
      if(accountError)throw accountError;

      const previous=await allRelationships(accountKey);
      const previousMap=new Map(previous.map((r:any)=>[String(r.username),r]));
      const followerSet=new Set(followers);
      const followingSet=new Set(following);
      const union=new Set([...previousMap.keys(),...followers,...following]);

      const {data:snapshot,error:snapshotError}=await db.from("dgos_social_snapshots").insert({
        account_key:accountKey,
        captured_at:now,
        followers_count:followers.length,
        following_count:following.length,
        source:"export",
        source_ref:cleanText(body.sourceRef,240)||null
      }).select("id,captured_at").single();
      if(snapshotError)throw snapshotError;

      const initial=previous.length===0;
      const relationshipRows:any[]=[];
      const eventRows:any[]=[];
      const counters={newFollowers:0,lostFollowers:0,startedFollowing:0,stoppedFollowing:0};

      for(const username of union){
        const old:any=previousMap.get(username)||null;
        const nextFollower=followerSet.has(username);
        const nextFollowing=followingSet.has(username);
        const changed=!old || Boolean(old.is_follower)!==nextFollower || Boolean(old.is_following)!==nextFollowing;
        relationshipRows.push({
          account_key:accountKey,
          username,
          is_follower:nextFollower,
          is_following:nextFollowing,
          whitelisted:Boolean(old?.whitelisted),
          decision:old?.decision||null,
          first_seen_at:old?.first_seen_at||now,
          last_seen_at:now,
          state_changed_at:changed?now:(old?.state_changed_at||now)
        });
        if(!initial && old){
          if(!old.is_follower && nextFollower){ counters.newFollowers++; eventRows.push({account_key:accountKey,event_type:"new_follower",username,occurred_at:now,snapshot_id:snapshot.id}); }
          if(old.is_follower && !nextFollower){ counters.lostFollowers++; eventRows.push({account_key:accountKey,event_type:"lost_follower",username,occurred_at:now,snapshot_id:snapshot.id}); }
          if(!old.is_following && nextFollowing){ counters.startedFollowing++; eventRows.push({account_key:accountKey,event_type:"started_following",username,occurred_at:now,snapshot_id:snapshot.id}); }
          if(old.is_following && !nextFollowing){ counters.stoppedFollowing++; eventRows.push({account_key:accountKey,event_type:"stopped_following",username,occurred_at:now,snapshot_id:snapshot.id}); }
        }
      }

      await batchUpsert(relationshipRows);
      if(eventRows.length)await batchInsertEvents(eventRows);

      return json({
        ok:true,
        snapshot:{id:snapshot.id,capturedAt:snapshot.captured_at,followers:followers.length,following:following.length},
        changes:initial?null:counters,
        cleanupCandidates:following.filter(u=>!followerSet.has(u)).length
      },201);
    }

    return json({error:"not_found"},404);
  }catch(e){
    console.error("social error",e instanceof Error?e.message:String(e));
    return json({error:"internal_error"},500);
  }
});
