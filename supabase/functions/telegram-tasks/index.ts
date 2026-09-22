import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN="https://danielgfxch.github.io";
const FUNCTION_URL="https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/telegram-tasks";
const SNAPSHOT_URL="https://danielgfxch.github.io/DG-OS/state/latest.json";
const DEVICE_TTL_MS=180*24*60*60*1000;

const cors={
  "Access-Control-Allow-Origin":ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Vary":"Origin"
};

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
}
function b64url(bytes:Uint8Array){
  let s="";bytes.forEach(b=>s+=String.fromCharCode(b));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function sha256(v:string){
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))));
}
function randomToken(bytes=32){return b64url(crypto.getRandomValues(new Uint8Array(bytes)));}
function clean(v:any,max=4000){return String(v??"").trim().slice(0,max);}
function botToken(){return Deno.env.get("TELEGRAM_BOT_TOKEN")||"";}
const WEATHER_URL="https://api.open-meteo.com/v1/forecast?latitude=47.27&longitude=8.72&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=Europe%2FZurich&forecast_days=1";
const WHOOP_SUMMARY_URL="https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop/summary";

const supabaseUrl=Deno.env.get("SUPABASE_URL")!;
let serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
if(!serviceKey){try{serviceKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";}catch{}}
const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

async function deviceSession(req:Request){
  const h=req.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer "))return null;
  const token=h.slice(7).trim();if(!token)return null;
  const hash=await sha256(token);
  const now=new Date().toISOString();
  const {data}=await db.from("dgos_device_sessions")
    .select("token_hash,chat_id,expires_at")
    .eq("token_hash",hash)
    .gt("expires_at",now)
    .maybeSingle();
  if(data) await db.from("dgos_device_sessions").update({last_seen_at:now}).eq("token_hash",hash);
  return data||null;
}

async function tg(method:string,body:any){
  const token=botToken();
  if(!token)throw new Error("telegram_not_configured");
  const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.ok)throw new Error("telegram_"+method+"_failed");
  return data.result;
}

async function webhookSecret(){
  const token=botToken();
  if(!token)return"";
  return await sha256("dgos-telegram-webhook:"+token);
}

async function ensureWebhook(){
  const secret=await webhookSecret();
  if(!secret)throw new Error("telegram_not_configured");
  await tg("setWebhook",{
    url:FUNCTION_URL+"/webhook",
    secret_token:secret,
    allowed_updates:["message","edited_message","callback_query"],
    drop_pending_updates:false
  });
}

async function send(chatId:string,text:string,extra:any={}){
  return tg("sendMessage",{chat_id:chatId,text,...extra});
}

function keyboard(){
  return {
    keyboard:[
      [{text:"🗒 Heute"},{text:"☀️ Briefing"}],
      [{text:"✅ Aufgaben"},{text:"↗ Wochenreview"}],
      [{text:"🛒 Einkauf"},{text:"📝 Notizen"}],
      [{text:"📅 Termine"},{text:"💳 Rechnungen"}]
    ],
    resize_keyboard:true,
    is_persistent:true
  };
}

function dateZurich(offset=0){
  const base=new Date(Date.now()+offset*86400000);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(base);
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return m.year+"-"+m.month+"-"+m.day;
}

function addDays(date:string,days:number){
  const d=new Date(date+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function startOfWeek(date:string){
  const d=new Date(date+"T12:00:00Z");
  const day=d.getUTCDay();
  d.setUTCDate(d.getUTCDate()+(day===0?-6:1-day));
  return d.toISOString().slice(0,10);
}
async function jarvisInternalSecret(){
  return sha256("jarvis-ai:"+botToken());
}
async function triggerAI(id:string,chatId:string){
  const secret=await jarvisInternalSecret();
  try{
    const r=await fetch("https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-ai/process",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Jarvis-Internal":secret},
      body:JSON.stringify({id})
    });
    if(r.status===503){
      await send(chatId,"📥 JARVIS · Sicher gespeichert.\nDie automatische Bild-/Voice-Analyse ist vorbereitet, aber der KI-Schlüssel ist noch nicht aktiviert.",{reply_markup:keyboard()});
    }else if(!r.ok){
      await send(chatId,"📥 JARVIS · Sicher gespeichert.\nDie automatische Analyse konnte gerade nicht abgeschlossen werden.",{reply_markup:keyboard()});
    }
  }catch{
    await send(chatId,"📥 JARVIS · Sicher gespeichert.\nDie automatische Analyse ist gerade nicht erreichbar.",{reply_markup:keyboard()});
  }
}

function parseTaskText(input:string){
  let t=clean(input,240);
  if(/^\/todo\s+/i.test(t))t=t.replace(/^\/todo\s+/i,"");

  let due=dateZurich(0);
  if(/\bübermorgen\b/i.test(t)){
    due=dateZurich(2);
    t=t.replace(/\bübermorgen\b/ig," ");
  }else if(/\bmorgen\b/i.test(t)){
    due=dateZurich(1);
    t=t.replace(/\bmorgen\b/ig," ");
  }else if(/\bheute\b/i.test(t)){
    t=t.replace(/\bheute\b/ig," ");
  }

  let priority="normal";
  if(/^!+\s*/.test(t)){
    priority="high";
    t=t.replace(/^!+\s*/,"");
  }

  t=t.replace(/\s{2,}/g," ").replace(/\s+([,.;!?])/g,"$1").trim();
  return {title:t.slice(0,240),dueDate:due,priority};
}

function looksLikeTrading(text:string){
  const t=text.toLowerCase();
  const cues=[
    "xau","xauusd","gold","eurusd","gbpusd","gbpjpy","eurjpy","us30","btc","bitcoin","dxy",
    "asia high","asia low","london high","london low","new york","ny high","ny low",
    "liquidity","inducement","order block","orderblock","fvg","ifvg","breaker","bos","choch",
    "premium","discount","ote","poi","bias","bullish","bearish","sweep","entry","stop loss","sl","tp",
    "daily high","daily low","weekly high","weekly low","monthly high","monthly low",
    "market","price","preis","chart","struktur","structure"
  ];
  return cues.some(cue=>t.includes(cue));
}

function looksLikeTask(text:string){
  const t=text.toLowerCase().trim();
  if(!t)return false;
  if(/^\/todo\b/i.test(t))return true;

  const dateCue=/\b(heute|morgen|übermorgen)\b/i.test(t);
  const actionCue=/\b(zahlen|bezahlen|anrufen|schreiben|senden|mailen|kaufen|holen|bringen|machen|erledigen|buchen|bestellen|tanken|putzen|aufräumen|prüfen|checken|überweisen|kündigen|verlängern|abholen|vorbereiten|rechnungen?|rechnung|termin|einkaufen)\b/i.test(t);

  if(dateCue && !looksLikeTrading(t))return true;
  if(actionCue && !looksLikeTrading(t))return true;
  return false;
}

function fileFromMessage(m:any){
  if(m.voice?.file_id)return{kind:"voice",fileId:m.voice.file_id,mimeType:m.voice.mime_type||"audio/ogg",filename:"voice.ogg"};
  if(m.audio?.file_id)return{kind:"voice",fileId:m.audio.file_id,mimeType:m.audio.mime_type||"audio/mpeg",filename:m.audio.file_name||"audio"};
  if(Array.isArray(m.photo)&&m.photo.length)return{kind:"image",fileId:m.photo[m.photo.length-1].file_id,mimeType:"image/jpeg",filename:"photo.jpg"};
  if(m.document?.file_id){
    const mime=String(m.document.mime_type||"application/octet-stream");
    const kind=mime.startsWith("image/")?"image":"document";
    return{kind,fileId:m.document.file_id,mimeType:mime,filename:m.document.file_name||"document"};
  }
  return null;
}

async function getConfig(){
  const {data}=await db.from("dgos_telegram_config").select("*").eq("id","primary").maybeSingle();
  return data||null;
}
async function setMode(mode:"private"|"trading"){
  const {error}=await db.from("dgos_telegram_config").update({mode,updated_at:new Date().toISOString()}).eq("id","primary");
  if(error)throw error;
}
async function createTask(title:string,dueDate:string,priority:string,sourceRef:string){
  const {error}=await db.from("dgos_tasks").insert({
    title,due_date:dueDate,priority,source:"telegram",source_ref:sourceRef
  });
  if(error)throw error;
}

function extractPrivateDateTime(input:string){
  let text=clean(input,500);
  let dueDate:string|null=null;
  let dueTime:string|null=null;

  if(/\bübermorgen\b/i.test(text)) dueDate=dateZurich(2);
  else if(/\bmorgen\b/i.test(text)) dueDate=dateZurich(1);
  else if(/\bheute\b/i.test(text)) dueDate=dateZurich(0);

  const explicit=text.match(/\b(\d{1,2})\.{1,2}(\d{1,2})(?:\.{1,2}(\d{2,4}))?\b/);
  if(explicit){
    const now=new Date();
    const year=explicit[3]
      ? (explicit[3].length===2 ? 2000+Number(explicit[3]) : Number(explicit[3]))
      : Number(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich",year:"numeric"}).format(now));
    const month=String(Number(explicit[2])).padStart(2,"0");
    const day=String(Number(explicit[1])).padStart(2,"0");
    dueDate=year+"-"+month+"-"+day;
  }

  const weekdayMap:any={montag:1,dienstag:2,mittwoch:3,donnerstag:4,freitag:5,samstag:6,sonntag:0};
  const weekdayMatch=text.toLowerCase().match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
  if(!dueDate && weekdayMatch){
    const target=weekdayMap[weekdayMatch[1]];
    const todayName=new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Zurich",weekday:"short"}).format(new Date());
    const map:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
    const current=map[todayName];
    let delta=(target-current+7)%7;
    if(delta===0)delta=7;
    dueDate=dateZurich(delta);
  }

  const colonTime=text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/i);
  const dotTime=text.match(/\bum\s*([01]?\d|2[0-3])\.([0-5]\d)\b/i);
  const time=colonTime||dotTime;
  if(time) dueTime=String(Number(time[1])).padStart(2,"0")+":"+time[2]+":00";

  return {dueDate,dueTime};
}

function extractAmount(input:string){
  const m=String(input||"").match(/(?:CHF|Fr\.?|€|EUR|\$|USD)?\s*(\d+(?:[.,]\d{1,2})?)\s*(CHF|Fr\.?|€|EUR|\$|USD)?/i);
  if(!m)return{amount:null,currency:null};
  const hasCurrency=Boolean(m[1]&&/CHF|Fr\.?|€|EUR|\$|USD/i.test(m[1])||m[3]);
  if(!hasCurrency)return{amount:null,currency:null};
  const amount=Number(String(m[2]||"").replace(",","."));
  let currency=String(m[1]||m[3]||"CHF").toUpperCase();
  if(currency==="FR."||currency==="FR")currency="CHF";
  if(currency==="€")currency="EUR";
  if(currency==="$")currency="USD";
  return{amount:Number.isFinite(amount)?amount:null,currency};
}


function splitPrivateEntries(input:string){
  return String(input||"")
    .split(/\n+/)
    .map(x=>x.trim())
    .filter(Boolean)
    .slice(0,12);
}

function weekdayConflict(input:string,dueDate:string|null){
  if(!dueDate)return null;
  const match=String(input||"").toLowerCase().match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
  if(!match)return null;
  const expected=match[1];
  const actual=new Intl.DateTimeFormat("de-CH",{timeZone:"UTC",weekday:"long"}).format(new Date(dueDate+"T12:00:00Z")).toLowerCase();
  return expected===actual?null:{expected,actual,dueDate};
}

function classifyPrivate(input:string){
  const text=clean(input,500);
  const t=text.toLowerCase();
  const dt=extractPrivateDateTime(text);

  const bill=/\b(rechnung|invoice|zahlen|bezahlen|überweisen|mahnung|fällig|sunrise|sanitas|innova|group mutuel)\b/i.test(t);
  const shopping=/\b(einkauf|einkaufen|einkaufsliste|kaufen|supermarkt|migros|coop|aldi|lidl|lebensmittel|milch|eier|brot|gemüse|fleisch)\b/i.test(t);
  const appointment=/\b(termin|zahnarzt|arzt|meeting|call|session|appointment|reservation|reservierung|zivilschutz|schicht|kurs|training|geburtstag|veranstaltung|event|flug|reise|ferien)\b/i.test(t) || Boolean(dt.dueTime);
  const note=/\b(notiz|merk dir|merken|idee|gedanke|aufschreiben|speichern)\b/i.test(t);

  if(bill){
    const money=extractAmount(text);
    return{kind:"bill",...dt,...money,title:text.slice(0,240)};
  }
  if(appointment)return{kind:"appointment",...dt,amount:null,currency:null,title:text.slice(0,240)};
  if(shopping)return{kind:"shopping",...dt,amount:null,currency:null,title:text.slice(0,240)};
  if(note)return{kind:"note",dueDate:null,dueTime:null,amount:null,currency:null,title:text.slice(0,240)};

  const taskIntent=/\b(heute|morgen|übermorgen|anrufen|schreiben|senden|mailen|machen|erledigen|buchen|bestellen|tanken|putzen|aufräumen|prüfen|checken|kündigen|verlängern|abholen|vorbereiten)\b/i.test(t);
  if(taskIntent)return{kind:"task",...dt,amount:null,currency:null,title:text.slice(0,240)};

  return{kind:"note",dueDate:null,dueTime:null,amount:null,currency:null,title:text.slice(0,240)};
}

async function createPrivateItem(item:any,sourceRef:string){
  const {error}=await db.from("dgos_private_items").insert({
    kind:item.kind,
    title:item.title,
    due_date:item.dueDate||null,
    due_time:item.dueTime||null,
    amount:item.amount??null,
    currency:item.currency||null,
    source:"telegram",
    source_ref:sourceRef
  });
  if(error)throw error;
}

async function privateListText(kind:string,label:string){
  const {data,error}=await db.from("dgos_private_items")
    .select("title,due_date,due_time,amount,currency,status")
    .eq("kind",kind)
    .eq("status","open")
    .order("due_date",{ascending:true,nullsFirst:false})
    .order("created_at",{ascending:false})
    .limit(20);
  if(error)throw error;
  const rows=data||[];
  const lines=["✅ JARVIS · "+label];
  if(!rows.length){
    lines.push("Keine offenen Einträge.");
    return lines.join("\n");
  }
  rows.forEach((row:any,i:number)=>{
    const meta=[];
    if(row.due_date)meta.push(row.due_date);
    if(row.due_time)meta.push(String(row.due_time).slice(0,5));
    if(row.amount!=null)meta.push(String(row.amount)+" "+String(row.currency||""));
    lines.push((i+1)+". "+row.title+(meta.length?" · "+meta.join(" · "):""));
  });
  return lines.join("\n");
}


function prettyToday(){
  return new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
}
function clockFromIso(value:any){
  const m=String(value||"").match(/T(\d{2}:\d{2})/);
  return m?m[1]:"—";
}
function round1(v:any){const n=Number(v);return Number.isFinite(n)?Math.round(n*10)/10:null;}
function weatherLabel(code:any){
  const n=Number(code);
  if(n===0)return"Klar";
  if(n>=1&&n<=3)return"Bewölkt";
  if(n===45||n===48)return"Nebel";
  if(n>=51&&n<=57)return"Nieselregen";
  if(n>=61&&n<=67)return"Regen";
  if(n>=71&&n<=77)return"Schnee";
  if(n>=80&&n<=82)return"Regenschauer";
  if(n>=85&&n<=86)return"Schneeschauer";
  if(n>=95)return"Gewitter";
  return"Wetter";
}
async function fetchMorningWeather(){
  try{
    const r=await fetch(WEATHER_URL,{headers:{Accept:"application/json"}});
    if(!r.ok)return null;
    const data=await r.json(),daily=data?.daily||{};
    return{
      current:round1(data?.current?.temperature_2m),
      label:weatherLabel(daily?.weather_code?.[0]??data?.current?.weather_code),
      min:round1(daily?.temperature_2m_min?.[0]),
      max:round1(daily?.temperature_2m_max?.[0]),
      rain:Number.isFinite(Number(daily?.precipitation_probability_max?.[0]))?Number(daily.precipitation_probability_max[0]):null,
      sunrise:clockFromIso(daily?.sunrise?.[0]),
      sunset:clockFromIso(daily?.sunset?.[0])
    };
  }catch{return null;}
}
async function whoopInternalSecret(){return sha256("dgos-whoop-internal:"+botToken());}
async function fetchMorningWhoop(){
  if(!botToken())return null;
  try{
    const secret=await whoopInternalSecret();
    const r=await fetch(WHOOP_SUMMARY_URL,{headers:{"X-DGOS-Internal":secret,Accept:"application/json"}});
    if(!r.ok)return null;
    return await r.json();
  }catch{return null;}
}
function hoursText(value:any){
  const n=Number(value);if(!Number.isFinite(n))return"";
  const total=Math.max(0,Math.round(n*60));
  return Math.floor(total/60)+"h "+String(total%60).padStart(2,"0")+"m";
}
async function getMorningConfig(){
  const {data}=await db.from("dgos_morning_briefing_config").select("*").eq("id","primary").maybeSingle();
  return data||null;
}
function localMinutes(){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Zurich",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const m:any=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return Number(m.hour)*60+Number(m.minute);
}
function configMinutes(value:any){
  const m=String(value||"07:00").match(/^(\d{2}):(\d{2})/);
  return m?Number(m[1])*60+Number(m[2]):420;
}
async function cronAuthorized(req:Request,cfg:any){
  const got=req.headers.get("X-DGOS-Cron")||"";
  return Boolean(cfg?.cron_secret)&&got===String(cfg.cron_secret);
}
function focusCandidates(taskRows:any[],appointments:any[],bills:any[],today:string){
  const out:any[]=[];
  taskRows.filter(x=>x.due_date<today).forEach(x=>out.push({score:100,title:x.title,meta:"überfällige Aufgabe"}));
  bills.filter(x=>x.due_date&&x.due_date<today).forEach(x=>out.push({score:98,title:x.title,meta:"überfällige Rechnung"}));
  bills.filter(x=>x.due_date===today).forEach(x=>out.push({score:94,title:x.title,meta:"Rechnung heute fällig"}));
  taskRows.filter(x=>x.due_date===today&&x.priority==="high").forEach(x=>out.push({score:92,title:x.title,meta:"wichtige Aufgabe"}));
  appointments.filter(x=>x.due_date===today).forEach(x=>out.push({score:90,title:x.title,meta:"Termin heute"+(x.due_time?" · "+String(x.due_time).slice(0,5):"")}));
  taskRows.filter(x=>x.due_date===today&&x.priority!=="high").forEach(x=>out.push({score:80,title:x.title,meta:"Aufgabe heute"}));
  return out.sort((a,b)=>b.score-a.score);
}

async function briefingText(){
  const today=dateZurich(0),next7=addDays(today,7);
  const [tasks,appointments,bills,shopping,inbox,weather,whoop]=await Promise.all([
    db.from("dgos_tasks").select("title,due_date,priority,due_time").lte("due_date",today).eq("status","open").order("due_date",{ascending:true}).limit(20),
    db.from("dgos_private_items").select("title,due_date,due_time").eq("kind","appointment").gte("due_date",today).lte("due_date",next7).eq("status","open").order("due_date",{ascending:true}).limit(10),
    db.from("dgos_private_items").select("title,due_date,amount,currency").eq("kind","bill").lte("due_date",next7).eq("status","open").order("due_date",{ascending:true,nullsFirst:false}).limit(10),
    db.from("dgos_private_items").select("id",{count:"exact",head:true}).eq("kind","shopping").eq("status","open"),
    db.from("dgos_task_inbox").select("id",{count:"exact",head:true}).eq("status","pending"),
    fetchMorningWeather(),
    fetchMorningWhoop()
  ]);

  const taskRows=tasks.data||[],apRows=appointments.data||[],billRows=bills.data||[];
  const overdue=taskRows.filter((x:any)=>x.due_date<today);
  const todayRows=taskRows.filter((x:any)=>x.due_date===today);
  const todayAppointments=apRows.filter((x:any)=>x.due_date===today);
  const dueBills=billRows.filter((x:any)=>x.due_date&&x.due_date<=today);
  const focus=focusCandidates(taskRows,apRows,billRows,today);
  const lines=["☀️ Guten Morgen, Daniel.",prettyToday(),""];

  lines.push("🌤 Wetter · Oetwil am See");
  if(weather){
    const temps=(weather.min!=null&&weather.max!=null)?weather.min+"–"+weather.max+" °C":(weather.current!=null?weather.current+" °C":"");
    lines.push([weather.label,temps].filter(Boolean).join(" · "));
    if(weather.rain!=null)lines.push("Regenrisiko: "+weather.rain+" %");
    lines.push("Sonne: "+weather.sunrise+" ↑ · "+weather.sunset+" ↓");
  }else lines.push("Wetterdaten gerade nicht erreichbar.");

  if(whoop?.recovery||whoop?.sleep||whoop?.cycle){
    lines.push("","⚡ Dein Zustand");
    const parts=[];
    if(whoop?.recovery?.score!=null)parts.push("Recovery "+Math.round(Number(whoop.recovery.score))+" %");
    if(whoop?.sleep?.performance!=null)parts.push("Schlaf "+Math.round(Number(whoop.sleep.performance))+" %");
    if(whoop?.sleep?.durationHours!=null)parts.push(hoursText(whoop.sleep.durationHours));
    if(parts.length)lines.push(parts.join(" · "));
    if(whoop?.cycle?.strain!=null)lines.push("Strain: "+round1(whoop.cycle.strain));
  }

  lines.push("","🧭 Dein Tag");
  lines.push("✅ "+todayRows.length+" "+(todayRows.length===1?"Aufgabe":"Aufgaben")+" heute"+(overdue.length?" · ⚠️ "+overdue.length+" überfällig":""));
  lines.push("📅 "+todayAppointments.length+" "+(todayAppointments.length===1?"Termin":"Termine")+" heute");
  lines.push("💳 "+dueBills.length+" "+(dueBills.length===1?"fällige Rechnung":"fällige Rechnungen"));
  if(shopping.count)lines.push("🛒 "+shopping.count+" offene Einkaufs-"+(shopping.count===1?"Position":"Positionen"));
  if(inbox.count)lines.push("📥 "+inbox.count+" Inbox-"+(inbox.count===1?"Eingang":"Eingänge"));

  if(focus.length){
    lines.push("","🎯 Jarvis Fokus");
    focus.slice(0,3).forEach((x:any,i:number)=>lines.push((i+1)+". "+x.title+" · "+x.meta));
  }else{
    const nextAp=apRows.find((x:any)=>x.due_date>today);
    if(nextAp){
      lines.push("","🔭 Als Nächstes");
      lines.push(nextAp.due_date+(nextAp.due_time?" · "+String(nextAp.due_time).slice(0,5):"")+" · "+nextAp.title);
    }else lines.push("","✨ Alles ruhig – aktuell nichts Dringendes.");
  }
  lines.push("","Jarvis hält den Rest im Blick.");
  return lines.join("\n");
}

async function weeklyReviewText(){
  const today=dateZurich(0);
  const start=startOfWeek(today);
  const end=addDays(start,6);
  const nextStart=addDays(end,1);
  const nextEnd=addDays(end,7);
  const startIso=start+"T00:00:00Z";
  const endIso=addDays(end,1)+"T00:00:00Z";
  const [doneTasks,openTasks,donePrivate,nextAppointments,nextBills]=await Promise.all([
    db.from("dgos_tasks").select("id",{count:"exact",head:true}).gte("completed_at",startIso).lt("completed_at",endIso).eq("status","done"),
    db.from("dgos_tasks").select("title,due_date").gte("due_date",start).lte("due_date",end).eq("status","open").order("due_date",{ascending:true}).limit(10),
    db.from("dgos_private_items").select("id",{count:"exact",head:true}).gte("completed_at",startIso).lt("completed_at",endIso).eq("status","done"),
    db.from("dgos_private_items").select("title,due_date,due_time").eq("kind","appointment").gte("due_date",nextStart).lte("due_date",nextEnd).eq("status","open").order("due_date",{ascending:true}).limit(10),
    db.from("dgos_private_items").select("title,due_date,amount,currency").eq("kind","bill").gte("due_date",nextStart).lte("due_date",nextEnd).eq("status","open").order("due_date",{ascending:true}).limit(10)
  ]);
  const lines=["↗ JARVIS · Wochenreview"];
  lines.push("Erledigt: "+String(doneTasks.count||0)+" Aufgaben · "+String(donePrivate.count||0)+" private Punkte");
  if((openTasks.data||[]).length)lines.push("Offen aus dieser Woche: "+(openTasks.data||[]).length);
  if((nextAppointments.data||[]).length)lines.push("Nächste Woche: "+(nextAppointments.data||[]).length+" Termine");
  if((nextBills.data||[]).length)lines.push("Nächste Woche: "+(nextBills.data||[]).length+" Rechnungen");
  if((nextAppointments.data||[]).length){
    lines.push("\nTermine:");
    (nextAppointments.data||[]).slice(0,5).forEach((x:any)=>lines.push("• "+x.due_date+(x.due_time?" "+String(x.due_time).slice(0,5):"")+" · "+x.title));
  }
  return lines.join("\n");
}

async function confirmAIProposal(id:string,chatId:string){
  const {data:row,error}=await db.from("dgos_task_inbox").select("*").eq("id",id).maybeSingle();
  if(error)throw error;
  if(!row||row.analysis_status!=="proposed"||!row.proposal)throw new Error("proposal_not_ready");
  const p=row.proposal as any;
  const source=row.kind==="voice"?"voice":row.kind==="image"?"image":"telegram";

  if(p.kind==="task"){
    const {error:e}=await db.from("dgos_tasks").insert({
      title:String(p.title||"Aufgabe").slice(0,240),
      notes:p.details||null,
      due_date:p.due_date||dateZurich(0),
      due_time:p.due_time||null,
      priority:"normal",
      source,
      source_ref:row.telegram_message_id||null
    });
    if(e)throw e;
  }else if(p.kind==="shopping"&&Array.isArray(p.shopping_items)&&p.shopping_items.length){
    const rows=p.shopping_items.slice(0,30).map((title:any)=>({
      kind:"shopping",
      title:String(title).slice(0,240),
      details:p.details||null,
      source,
      source_ref:row.telegram_message_id||null
    }));
    const {error:e}=await db.from("dgos_private_items").insert(rows);
    if(e)throw e;
  }else{
    const kind=["appointment","bill","shopping","note"].includes(p.kind)?p.kind:"note";
    const {error:e}=await db.from("dgos_private_items").insert({
      kind,
      title:String(p.title||"Eintrag").slice(0,240),
      details:p.details||null,
      due_date:p.due_date||null,
      due_time:p.due_time||null,
      amount:p.amount??null,
      currency:p.currency||null,
      source,
      source_ref:row.telegram_message_id||null
    });
    if(e)throw e;
  }

  await db.from("dgos_task_inbox").update({
    status:"processed",
    analysis_status:"confirmed",
    processed_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }).eq("id",id);
}
async function todayText(){
  const today=dateZurich(0);
  const {data,error}=await db.from("dgos_tasks")
    .select("title,priority,status,due_date")
    .lte("due_date",today)
    .eq("status","open")
    .order("due_date",{ascending:true})
    .order("created_at",{ascending:true})
    .limit(20);
  if(error)throw error;
  const rows=data||[];
  if(!rows.length)return"✅ JARVIS · Heute\nKeine offenen Aufgaben.";
  const lines=["✅ JARVIS · Heute"];
  rows.forEach((t:any,i:number)=>{
    const overdue=t.due_date<today?" · überfällig":"";
    const important=t.priority==="high"?" ⚠️":"";
    lines.push((i+1)+". "+t.title+important+overdue);
  });
  return lines.join("\n");
}

function p(v:any,d=2){
  const n=Number(v);return Number.isFinite(n)?n.toFixed(d):"—";
}

async function tradingSnapshot(query:string){
  const r=await fetch(SNAPSHOT_URL+"?t="+Date.now(),{headers:{"Accept":"application/json"}});
  if(!r.ok)throw new Error("trading_snapshot_unavailable");
  const s=await r.json();
  const q=query.toLowerCase();
  const levels=Array.isArray(s?.overview?.quickLevels)?s.overview.quickLevels:[];
  const lines=["📈 TRADING · XAUUSD"];

  function addLevel(prefix:string){
    const hi=levels.find((x:any)=>String(x.id||"").toLowerCase()===prefix+"high");
    const lo=levels.find((x:any)=>String(x.id||"").toLowerCase()===prefix+"low");
    if(hi)lines.push((hi.label||"High")+": "+p(hi.price,2)+" · "+(hi.status||"—"));
    if(lo)lines.push((lo.label||"Low")+": "+p(lo.price,2)+" · "+(lo.status||"—"));
  }

  if(q.includes("asia"))addLevel("asia");
  else if(q.includes("london"))addLevel("london");
  else if(q.includes("new york")||/\bny\b/.test(q))addLevel("ny");
  else if(q.includes("daily"))addLevel("daily");
  else if(q.includes("weekly"))addLevel("weekly");
  else if(q.includes("monthly"))addLevel("monthly");
  else{
    if(Number.isFinite(Number(s?.liveData?.price)))lines.push("Preis: "+p(s.liveData.price,2));
    const d=s?.decision;
    if(d)lines.push("Decision: "+String(d.state||"—")+" · "+String(d.confidence??"—")+"%");
    if(d?.reason)lines.push(String(d.reason));
    const m=d?.moduleSnapshot||{};
    if(m.htfBias?.summary)lines.push("HTF: "+m.htfBias.summary);
    if(m.structure?.summary)lines.push("Structure: "+m.structure.summary);
    if(m.liquidity?.summary)lines.push("Liquidity: "+m.liquidity.summary);
    if(m.pois?.summary)lines.push("POI: "+m.pois.summary);
    if(m.premiumDiscount?.summary)lines.push("P/D: "+m.premiumDiscount.summary);
  }

  if(s?.updatedAt){
    const dt=new Date(s.updatedAt);
    if(Number.isFinite(dt.getTime())){
      lines.push("Stand: "+new Intl.DateTimeFormat("de-CH",{timeZone:"Europe/Zurich",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(dt));
    }
  }
  lines.push("DG OS · unveränderte Brain-Daten");
  return lines.join("\n");
}

async function approveDevicePair(code:string,chatId:string){
  const codeHash=await sha256(code);
  const now=new Date().toISOString();
  const {data:pair}=await db.from("dgos_device_pairings")
    .select("code_hash")
    .eq("code_hash",codeHash)
    .gt("expires_at",now)
    .maybeSingle();
  if(!pair)return false;

  const cfg=await getConfig();
  if(cfg?.chat_id && String(cfg.chat_id)!==String(chatId))return false;

  let username="";
  try{const me=await tg("getMe",{});username=String(me?.username||"");}catch{}

  if(!cfg){
    const {error}=await db.from("dgos_telegram_config").upsert({
      id:"primary",
      chat_id:String(chatId),
      bot_username:username||null,
      mode:"trading",
      paired_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    });
    if(error)throw error;
  }

  const {error:updateError}=await db.from("dgos_device_pairings")
    .update({approved:true,chat_id:String(chatId)})
    .eq("code_hash",codeHash);
  if(updateError)throw updateError;
  return true;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const url=new URL(req.url);
  const action=url.pathname.split("/").filter(Boolean).pop()||"";

  try{
    if(action==="morning"&&req.method==="POST"){
      const cfg=await getMorningConfig();
      if(!(await cronAuthorized(req,cfg)))return json({error:"forbidden"},403);
      if(!cfg?.enabled)return json({ok:true,sent:false,reason:"disabled"});
      const today=dateZurich(0);
      if(String(cfg.last_sent_date||"")===today)return json({ok:true,sent:false,reason:"already_sent"});
      const nowMin=localMinutes(),dueMin=configMinutes(cfg.send_time);
      if(nowMin<dueMin||nowMin>12*60)return json({ok:true,sent:false,reason:"not_due"});
      const tgCfg=await getConfig();
      if(!tgCfg?.chat_id)return json({ok:true,sent:false,reason:"telegram_not_paired"});
      await send(String(tgCfg.chat_id),await briefingText(),{reply_markup:keyboard()});
      const {error}=await db.from("dgos_morning_briefing_config").update({last_sent_date:today,updated_at:new Date().toISOString()}).eq("id","primary");
      if(error)throw error;
      return json({ok:true,sent:true,date:today});
    }

    if(action==="webhook"){
      const expected=await webhookSecret();
      const got=req.headers.get("X-Telegram-Bot-Api-Secret-Token")||"";
      if(!expected||got!==expected)return json({ok:false},403);

      const update=await req.json().catch(()=>null);
      const callback=update?.callback_query;

      if(callback){
        const callbackId=String(callback.id||"");
        const chatId=String(callback.message?.chat?.id||"");
        const data=String(callback.data||"");
        const cfg=await getConfig();
        if(!cfg||String(cfg.chat_id)!==chatId){
          if(callbackId)await tg("answerCallbackQuery",{callback_query_id:callbackId,text:"Nicht autorisiert."});
          return json({ok:true});
        }

        const match=data.match(/^ai:(confirm|ignore):([0-9a-f-]{36})$/i);
        if(match){
          const actionName=match[1].toLowerCase();
          const id=match[2];
          if(actionName==="confirm"){
            await confirmAIProposal(id,chatId);
            if(callbackId)await tg("answerCallbackQuery",{callback_query_id:callbackId,text:"In Jarvis übernommen ✅"});
            if(callback.message?.message_id){
              await tg("editMessageText",{
                chat_id:chatId,
                message_id:callback.message.message_id,
                text:String(callback.message.text||"🤖 JARVIS · Vorschlag")+"\n\n✅ Übernommen"
              });
            }
          }else{
            await db.from("dgos_task_inbox").update({
              status:"ignored",analysis_status:"ignored",processed_at:new Date().toISOString(),updated_at:new Date().toISOString()
            }).eq("id",id);
            if(callbackId)await tg("answerCallbackQuery",{callback_query_id:callbackId,text:"Ignoriert"});
            if(callback.message?.message_id){
              await tg("editMessageText",{
                chat_id:chatId,
                message_id:callback.message.message_id,
                text:String(callback.message.text||"🤖 JARVIS · Vorschlag")+"\n\n✕ Ignoriert"
              });
            }
          }
        }
        return json({ok:true});
      }

      const m=update?.message||update?.edited_message;
      if(!m)return json({ok:true});
      const chatId=String(m.chat?.id||"");
      if(!chatId)return json({ok:true});

      const text=clean(m.text||m.caption||"",4000);
      const pairMatch=
        text.match(/^\/start\s+device_(\d{6})$/i)||
        text.match(/^\/pair\s+(\d{6})$/i);

      if(pairMatch){
        const ok=await approveDevicePair(pairMatch[1],chatId);
        if(ok){
          await send(chatId,
            "✅ JARVIS · Gerät bestätigt.\n\nWechsle zurück zu DG OS. Die Aufgabenliste wird gleich freigeschaltet.\n\nDieser Chat ist dein privater Jarvis-Eingang. Trading-Meldungen kommen weiterhin automatisch mit 📈 TRADING-Überschrift.",
            {reply_markup:keyboard()}
          );
        }else{
          await send(chatId,"Pairing-Code ungültig, abgelaufen oder dieser Bot ist bereits mit einem anderen Chat gekoppelt.");
        }
        return json({ok:true});
      }

      const cfg=await getConfig();
      if(!cfg||String(cfg.chat_id)!==chatId)return json({ok:true});
      if(text==="/today"||text==="🗒 Heute"){
        await send(chatId,await todayText(),{reply_markup:keyboard()});
        return json({ok:true});
      }
      if(/^\/todo\b/i.test(text)){
        const task=parseTaskText(text);
        if(task.title){
          await createTask(task.title,task.dueDate,task.priority,String(m.message_id||""));
          await send(chatId,"✅ JARVIS · Aufgabe gespeichert\n"+task.title+(task.dueDate===dateZurich(1)?" · morgen":" · heute"),{reply_markup:keyboard()});
        }
        return json({ok:true});
      }
      if(/^\/trade\b/i.test(text)){
        await send(chatId,"📈 TRADING · Trading-Abfragen sind im privaten Jarvis-Chat deaktiviert. Trading-Meldungen kommen weiterhin automatisch mit eigener Überschrift.",{reply_markup:keyboard()});
        return json({ok:true});
      }
      const media=fileFromMessage(m);

      if(media){
        const {data:inbox,error}=await db.from("dgos_task_inbox").insert({
          kind:media.kind,
          raw_text:text||null,
          telegram_file_id:media.fileId,
          caption:text||null,
          analysis_status:"waiting",
          telegram_chat_id:chatId,
          telegram_message_id:String(m.message_id||""),
          source_filename:media.filename||null,
          mime_type:media.mimeType||null
        }).select("id").single();
        if(error)throw error;

        const label=media.kind==="voice"?"Voice":media.kind==="image"?"Bild":"Dokument";
        await send(chatId,"🤖 JARVIS · "+label+" erhalten\nIch speichere es sicher und prüfe, ob ich daraus Termin, Rechnung, Einkauf, Notiz oder Aufgabe erkenne.",{reply_markup:keyboard()});

        const promise=triggerAI(String(inbox.id),chatId);
        const runtime=(globalThis as any).EdgeRuntime;
        if(runtime?.waitUntil)runtime.waitUntil(promise);
        else await promise;
        return json({ok:true});
      }

      if(text){
        if(text==="✅ Aufgaben" || text==="🗒 Heute"){
          await send(chatId,await todayText(),{reply_markup:keyboard()});
          return json({ok:true});
        }

        if(text==="☀️ Briefing" || text==="/briefing"){
          await send(chatId,await briefingText(),{reply_markup:keyboard()});
          return json({ok:true});
        }
        if(/^\/morning(?:\s+.*)?$/i.test(text)){
          const arg=text.replace(/^\/morning\s*/i,"").trim().toLowerCase();
          const cfg=await getMorningConfig();
          if(arg==="off"){
            await db.from("dgos_morning_briefing_config").update({enabled:false,updated_at:new Date().toISOString()}).eq("id","primary");
            await send(chatId,"🌅 JARVIS · Morgenbriefing deaktiviert.",{reply_markup:keyboard()});
            return json({ok:true});
          }
          const m=arg.match(/^([0-1]?\d|2[0-3]):([0-5]\d)$/);
          if(m){
            const hh=String(Number(m[1])).padStart(2,"0"),mm=m[2],mins=Number(hh)*60+Number(mm);
            if(mins<5*60||mins>11*60){
              await send(chatId,"🌅 Bitte wähle eine Zeit zwischen 05:00 und 11:00.",{reply_markup:keyboard()});
              return json({ok:true});
            }
            const value=hh+":"+mm;
            await db.from("dgos_morning_briefing_config").update({enabled:true,send_time:value,updated_at:new Date().toISOString()}).eq("id","primary");
            await send(chatId,"🌅 JARVIS · Morgenbriefing aktiv · täglich ab "+value+" · Europe/Zurich.",{reply_markup:keyboard()});
            return json({ok:true});
          }
          const display=String(cfg?.send_time||"07:00").slice(0,5);
          await send(chatId,"🌅 JARVIS · Morgenbriefing "+(cfg?.enabled?"aktiv":"aus")+" · "+display+" · Europe/Zurich\n\nÄndern: /morning 07:30\nAusschalten: /morning off",{reply_markup:keyboard()});
          return json({ok:true});
        }
        if(text==="↗ Wochenreview" || text==="/week"){
          await send(chatId,await weeklyReviewText(),{reply_markup:keyboard()});
          return json({ok:true});
        }

        if(text==="🛒 Einkauf"){
          await send(chatId,await privateListText("shopping","Einkauf"),{reply_markup:keyboard()});
          return json({ok:true});
        }
        if(text==="📝 Notizen"){
          await send(chatId,await privateListText("note","Notizen"),{reply_markup:keyboard()});
          return json({ok:true});
        }
        if(text==="📅 Termine"){
          await send(chatId,await privateListText("appointment","Termine"),{reply_markup:keyboard()});
          return json({ok:true});
        }
        if(text==="💳 Rechnungen"){
          await send(chatId,await privateListText("bill","Rechnungen"),{reply_markup:keyboard()});
          return json({ok:true});
        }

        const entries=splitPrivateEntries(text);
        const confirmations:string[]=[];
        const clarifications:string[]=[];

        for(const entry of entries){
          const item=classifyPrivate(entry);
          const conflict=weekdayConflict(entry,item.dueDate||null);
          if(conflict){
            const cap=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
            clarifications.push(
              "⚠️ "+entry+"\n"+conflict.dueDate+" ist "+cap(conflict.actual)+", nicht "+cap(conflict.expected)+"."
            );
            continue;
          }

          if(item.kind==="task"){
            const task=parseTaskText(entry);
            await createTask(task.title,task.dueDate,task.priority,String(m.message_id||""));
            const when=task.dueDate===dateZurich(2)?"übermorgen":task.dueDate===dateZurich(1)?"morgen":"heute";
            confirmations.push("✅ Aufgabe · "+task.title+" · "+when);
            continue;
          }

          await createPrivateItem(item,String(m.message_id||""));
          const labels:any={appointment:"📅 Termin",note:"📝 Notiz",shopping:"🛒 Einkauf",bill:"💳 Rechnung"};
          const meta=[];
          if(item.dueDate)meta.push(item.dueDate);
          if(item.dueTime)meta.push(String(item.dueTime).slice(0,5));
          if(item.amount!=null)meta.push(String(item.amount)+" "+String(item.currency||""));
          confirmations.push((labels[item.kind]||"📝 Eintrag")+" · "+item.title+(meta.length?" · "+meta.join(" · "):""));
        }

        if(confirmations.length){
          await send(chatId,"✅ JARVIS · gespeichert\n"+confirmations.join("\n"),{reply_markup:keyboard()});
        }
        if(clarifications.length){
          await send(chatId,"🤔 JARVIS · kurz prüfen\n"+clarifications.join("\n\n")+"\n\nBitte sende den korrekten Termin noch einmal mit eindeutigem Datum.",{reply_markup:keyboard()});
        }
      }
      return json({ok:true});
    }

    const origin=req.headers.get("Origin");
    if(origin&&origin!==ALLOWED_ORIGIN)return json({error:"origin_not_allowed"},403);

    if(action==="status"){
      const configured=Boolean(botToken());
      let username="";
      let webhookActive=false;
      if(configured){
        try{
          const [me,info]=await Promise.all([tg("getMe",{}),tg("getWebhookInfo",{})]);
          username=String(me?.username||"");
          webhookActive=String(info?.url||"")===FUNCTION_URL+"/webhook";
        }catch{}
      }
      const cfg=await getConfig();
      const device=await deviceSession(req);
      return json({
        configured,
        paired:Boolean(cfg?.chat_id),
        deviceAuthenticated:Boolean(device),
        mode:cfg?.mode||"trading",
        botUsername:username||cfg?.bot_username||"",
        webhookActive
      });
    }

    if(action==="pair-start"&&req.method==="POST"){
      if(!botToken())return json({error:"telegram_not_configured"},503);
      const me=await tg("getMe",{});
      const username=String(me?.username||"");
      if(!username)return json({error:"telegram_username_missing"},502);

      const cfg=await getConfig();
      const currentDevice=await deviceSession(req);
      if(cfg?.chat_id && currentDevice){
        return json({
          alreadyAuthenticated:true,
          botUsername:username,
          mode:cfg.mode||"trading"
        });
      }

      const bytes=crypto.getRandomValues(new Uint32Array(1));
      const pairCode=String(100000+(bytes[0]%900000));
      const claimSecret=randomToken(24);
      const codeHash=await sha256(pairCode);
      const claimHash=await sha256(claimSecret);

      await db.from("dgos_device_pairings").delete().lt("expires_at",new Date().toISOString());
      const {error}=await db.from("dgos_device_pairings").insert({
        code_hash:codeHash,
        claim_hash:claimHash,
        expires_at:new Date(Date.now()+10*60*1000).toISOString()
      });
      if(error)throw error;

      await ensureWebhook();
      try{
        await tg("setMyCommands",{commands:[
          {command:"todo",description:"Aufgabe speichern"},
          {command:"today",description:"Heutige Aufgaben"},
          {command:"briefing",description:"Tagesbriefing"},
          {command:"morning",description:"Morgenbriefing Zeit einstellen"},
          {command:"week",description:"Wochenreview"}
        ]});
      }catch{}

      return json({
        code:pairCode,
        claimSecret,
        botUsername:username,
        deepLink:"https://t.me/"+username+"?start=device_"+pairCode,
        expiresInSeconds:600
      });
    }

    if(action==="pair-claim"&&req.method==="POST"){
      const body=await req.json().catch(()=>({}));
      const code=clean(body.code,6);
      const claimSecret=clean(body.claimSecret,200);
      if(!/^\d{6}$/.test(code)||!claimSecret)return json({error:"invalid_pair_claim"},400);

      const codeHash=await sha256(code);
      const claimHash=await sha256(claimSecret);
      const now=new Date().toISOString();

      const {data:pair}=await db.from("dgos_device_pairings")
        .select("*")
        .eq("code_hash",codeHash)
        .eq("claim_hash",claimHash)
        .gt("expires_at",now)
        .maybeSingle();

      if(!pair)return json({approved:false});
      if(!pair.approved||!pair.chat_id)return json({approved:false});

      const cfg=await getConfig();
      if(!cfg||String(cfg.chat_id)!==String(pair.chat_id))return json({error:"pair_chat_mismatch"},403);

      const deviceToken=randomToken(32);
      const tokenHash=await sha256(deviceToken);
      const {error:sessionError}=await db.from("dgos_device_sessions").insert({
        token_hash:tokenHash,
        chat_id:String(pair.chat_id),
        label:"telegram-paired-browser",
        expires_at:new Date(Date.now()+DEVICE_TTL_MS).toISOString()
      });
      if(sessionError)throw sessionError;

      await db.from("dgos_device_pairings").delete().eq("code_hash",codeHash);

      return json({
        approved:true,
        deviceToken,
        expiresInSeconds:Math.floor(DEVICE_TTL_MS/1000),
        mode:cfg.mode||"trading",
        botUsername:cfg.bot_username||""
      });
    }

    return json({error:"not_found"},404);
  }catch(e){
    console.error("telegram router error",e instanceof Error?e.message:String(e));
    return json({error:"internal_error"},500);
  }
});