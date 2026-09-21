'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API = 'https://api.prod.whoop.com/developer/v2';
const DEFAULT_CLIENT_ID = '2bac96a0-3e70-4d31-b319-cd19b73f30bc';
const DEFAULT_REDIRECT_URI = 'https://danielgfxch.github.io/DG-OS/whoop-callback.html';
const SCOPES = Object.freeze([
  'offline',
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement'
]);

function parseKey(value) {
  if (!value || typeof value !== 'string') return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch (_) { return null; }
}

function b64url(value) {
  return (Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')).toString('base64url');
}
function fromB64url(value) { return Buffer.from(String(value), 'base64url'); }

class EncryptedStore {
  constructor(filePath, key) { this.filePath=filePath; this.key=key; }
  read() {
    if (!this.key || !this.filePath || !fs.existsSync(this.filePath)) return {};
    try {
      const stored=JSON.parse(fs.readFileSync(this.filePath,'utf8'));
      if(!stored||stored.v!==1||!stored.iv||!stored.tag||!stored.data)return{};
      const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,fromB64url(stored.iv));
      decipher.setAuthTag(fromB64url(stored.tag));
      const clear=Buffer.concat([decipher.update(fromB64url(stored.data)),decipher.final()]).toString('utf8');
      const parsed=JSON.parse(clear);
      return parsed&&typeof parsed==='object'?parsed:{};
    } catch (_) { return {}; }
  }
  write(value) {
    if(!this.key||!this.filePath)throw new Error('whoop_store_not_configured');
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    const payload=JSON.stringify({v:1,iv:b64url(iv),tag:b64url(cipher.getAuthTag()),data:b64url(encrypted)});
    fs.mkdirSync(path.dirname(this.filePath),{recursive:true,mode:0o700});
    const temp=this.filePath+'.tmp';
    fs.writeFileSync(temp,payload,{encoding:'utf8',mode:0o600});
    fs.renameSync(temp,this.filePath);
  }
}

function sleepMs(stageSummary) {
  const s=stageSummary||{};
  return Number(s.total_light_sleep_time_milli||0)+Number(s.total_slow_wave_sleep_time_milli||0)+Number(s.total_rem_sleep_time_milli||0);
}
function sleepNeedMs(sleepNeeded) {
  const s=sleepNeeded||{};
  return Math.max(0,
    Number(s.baseline_milli||0)+
    Number(s.need_from_sleep_debt_milli||0)+
    Number(s.need_from_recent_strain_milli||0)+
    Number(s.need_from_recent_nap_milli||0)
  );
}
function hours(ms){return Number.isFinite(Number(ms))?Number(ms)/3600000:null;}
function kcal(kj){return Number.isFinite(Number(kj))?Number(kj)/4.184:null;}
function scored(records){return (Array.isArray(records)?records:[]).find(r=>r&&r.score_state==='SCORED'&&r.score)||null;}

class WhoopIntegration {
  constructor(env) {
    env=env||process.env;
    this.clientId=env.WHOOP_CLIENT_ID||DEFAULT_CLIENT_ID;
    this.clientSecret=env.WHOOP_CLIENT_SECRET||'';
    this.redirectUri=env.WHOOP_REDIRECT_URI||DEFAULT_REDIRECT_URI;
    this.appUrl=String(env.DGOS_APP_URL||env.DGOS_PUBLIC_BASE_URL||'').replace(/\/+$/,'');
    this.publicBaseUrl=String(env.DGOS_PUBLIC_BASE_URL||'').replace(/\/+$/,'');
    this.key=parseKey(env.DGOS_INTEGRATION_ENCRYPTION_KEY||env.DGOS_GMAIL_ENCRYPTION_KEY||'');
    const privateDir=env.DGOS_PRIVATE_DATA_DIR||path.resolve(process.cwd(),'private');
    this.store=new EncryptedStore(path.join(privateDir,'whoop-tokens.enc.json'),this.key);
    const saved=this.store.read();
    this.token=saved.token||null;
    this.pending=saved.pending&&typeof saved.pending==='object'?saved.pending:{};
    this.accessCache=null;
    this.refreshPromise=null;
  }

  get configured(){return Boolean(this.clientId&&this.clientSecret&&this.redirectUri&&this.appUrl&&this.key);}
  get connected(){return Boolean(this.token&&this.token.refreshToken);}

  _save(){
    const now=Date.now();
    Object.keys(this.pending).forEach(k=>{if(!this.pending[k]||this.pending[k].expiresAt<now)delete this.pending[k];});
    this.store.write({token:this.token,pending:this.pending});
  }

  _sessionSignature(value){return b64url(crypto.createHmac('sha256',this.key).update(value).digest());}
  sessionCookie(){
    const payload=b64url(JSON.stringify({kind:'whoop-owner',exp:Date.now()+30*24*60*60*1000}));
    return 'dgos_whoop_session='+payload+'.'+this._sessionSignature(payload)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000'+(this.publicBaseUrl.startsWith('https://')?'; Secure':'');
  }
  clearSessionCookie(){
    return 'dgos_whoop_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(this.publicBaseUrl.startsWith('https://')?'; Secure':'');
  }
  isAuthorized(req){
    const cookie=String(req&&req.headers&&req.headers.cookie||'');
    const match=cookie.match(/(?:^|;\s*)dgos_whoop_session=([^;]+)/);
    if(!match)return false;
    const parts=match[1].split('.');
    if(parts.length!==2)return false;
    const expected=this._sessionSignature(parts[0]);
    const a=Buffer.from(expected),b=Buffer.from(parts[1]);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return false;
    try{
      const payload=JSON.parse(fromB64url(parts[0]).toString('utf8'));
      return payload&&payload.kind==='whoop-owner'&&payload.exp>Date.now();
    }catch(_){return false;}
  }

  status(req){
    return {
      configured:this.configured,
      connected:this.connected,
      authenticated:this.configured&&this.connected&&this.isAuthorized(req),
      redirectUri:this.redirectUri,
      scopes:SCOPES.slice()
    };
  }

  authorizationUrl(){
    if(!this.configured)throw new Error('whoop_not_configured');
    // WHOOP requires an 8-character state when generated by the client.
    const state=crypto.randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g,'').slice(0,8).padEnd(8,'0');
    this.pending[state]={expiresAt:Date.now()+10*60*1000};
    this._save();
    const params=new URLSearchParams({
      client_id:this.clientId,
      redirect_uri:this.redirectUri,
      response_type:'code',
      scope:SCOPES.join(' '),
      state
    });
    return WHOOP_AUTH_URL+'?'+params.toString();
  }

  async handleCallback(code,state,redirectUri){
    if(!this.configured)throw new Error('whoop_not_configured');
    if(!code||!state||!this.pending[state]||this.pending[state].expiresAt<Date.now())throw new Error('invalid_whoop_state');
    if(String(redirectUri||'')!==this.redirectUri)throw new Error('invalid_whoop_redirect');
    delete this.pending[state];

    const response=await fetch(WHOOP_TOKEN_URL,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
      body:new URLSearchParams({
        grant_type:'authorization_code',
        code:String(code),
        client_id:this.clientId,
        client_secret:this.clientSecret,
        redirect_uri:this.redirectUri
      })
    });
    if(!response.ok)throw new Error('whoop_token_exchange_failed_'+response.status);
    const data=await response.json();
    if(!data.access_token||!data.refresh_token)throw new Error('whoop_token_missing');
    this.token={
      refreshToken:data.refresh_token,
      scope:String(data.scope||SCOPES.join(' ')),
      connectedAt:new Date().toISOString()
    };
    this.accessCache={
      token:data.access_token,
      expiresAt:Date.now()+Math.max(60,Number(data.expires_in||3600)-60)*1000
    };
    this._save();
    return true;
  }

  async _refresh(){
    if(this.refreshPromise)return this.refreshPromise;
    this.refreshPromise=(async()=>{
      if(!this.connected)throw new Error('whoop_not_connected');
      const response=await fetch(WHOOP_TOKEN_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({
          grant_type:'refresh_token',
          refresh_token:this.token.refreshToken,
          client_id:this.clientId,
          client_secret:this.clientSecret,
          scope:'offline'
        })
      });
      if(!response.ok)throw new Error('whoop_refresh_failed_'+response.status);
      const data=await response.json();
      if(!data.access_token||!data.refresh_token)throw new Error('whoop_refresh_token_missing');
      // WHOOP rotates refresh tokens: always persist the newest token.
      this.token.refreshToken=data.refresh_token;
      this.token.scope=String(data.scope||this.token.scope||'');
      this.accessCache={token:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||3600)-60)*1000};
      this._save();
      return this.accessCache.token;
    })();
    try{return await this.refreshPromise;}finally{this.refreshPromise=null;}
  }

  async _accessToken(force){
    if(!force&&this.accessCache&&this.accessCache.expiresAt>Date.now())return this.accessCache.token;
    return this._refresh();
  }

  async _fetch(resource,options,retried){
    const token=await this._accessToken(Boolean(retried));
    const request=Object.assign({},options||{});
    request.headers=Object.assign({},request.headers||{},{Authorization:'Bearer '+token,Accept:'application/json'});
    const response=await fetch(WHOOP_API+resource,request);
    if(response.status===401&&!retried)return this._fetch(resource,options,true);
    if(!response.ok)throw new Error('whoop_api_failed_'+response.status);
    if(response.status===204)return{};
    return response.json();
  }

  async summary(){
    if(!this.connected)throw new Error('whoop_not_connected');
    const [recoveries,sleeps,cycles,workouts,profile,body]=await Promise.all([
      this._fetch('/recovery?limit=5'),
      this._fetch('/activity/sleep?limit=10'),
      this._fetch('/cycle?limit=5'),
      this._fetch('/activity/workout?limit=5'),
      this._fetch('/user/profile/basic'),
      this._fetch('/user/measurement/body')
    ]);
    const recovery=scored(recoveries.records);
    const sleep=(Array.isArray(sleeps.records)?sleeps.records:[]).find(r=>r&&!r.nap&&r.score_state==='SCORED'&&r.score)||null;
    const cycle=scored(cycles.records);
    const sleepScore=sleep&&sleep.score||null;
    const stages=sleepScore&&sleepScore.stage_summary||null;
    const need=sleepScore&&sleepScore.sleep_needed||null;

    return {
      updatedAt:new Date().toISOString(),
      recovery: recovery ? {
        score:recovery.score.recovery_score??null,
        restingHeartRate:recovery.score.resting_heart_rate??null,
        hrvMs:recovery.score.hrv_rmssd_milli??null,
        spo2:recovery.score.spo2_percentage??null,
        skinTempC:recovery.score.skin_temp_celsius??null,
        userCalibrating:Boolean(recovery.score.user_calibrating)
      } : null,
      sleep: sleep ? {
        id:sleep.id,
        start:sleep.start,
        end:sleep.end,
        durationHours:hours(sleepMs(stages)),
        timeInBedHours:hours(stages&&stages.total_in_bed_time_milli),
        awakeHours:hours(stages&&stages.total_awake_time_milli),
        lightHours:hours(stages&&stages.total_light_sleep_time_milli),
        deepHours:hours(stages&&stages.total_slow_wave_sleep_time_milli),
        remHours:hours(stages&&stages.total_rem_sleep_time_milli),
        neededHours:hours(sleepNeedMs(need)),
        performance:sleepScore.sleep_performance_percentage??null,
        consistency:sleepScore.sleep_consistency_percentage??null,
        efficiency:sleepScore.sleep_efficiency_percentage??null,
        respiratoryRate:sleepScore.respiratory_rate??null,
        disturbances:stages&&stages.disturbance_count??null,
        cycles:stages&&stages.sleep_cycle_count??null
      } : null,
      cycle: cycle ? {
        start:cycle.start,
        end:cycle.end,
        strain:cycle.score.strain??null,
        kilojoule:cycle.score.kilojoule??null,
        calories:kcal(cycle.score.kilojoule),
        averageHeartRate:cycle.score.average_heart_rate??null,
        maxHeartRate:cycle.score.max_heart_rate??null
      } : null,
      workouts:(Array.isArray(workouts.records)?workouts.records:[]).filter(w=>w&&w.score_state==='SCORED'&&w.score).slice(0,5).map(w=>({
        id:w.id,
        name:w.sport_name||'Workout',
        start:w.start,
        end:w.end,
        strain:w.score.strain??null,
        averageHeartRate:w.score.average_heart_rate??null,
        maxHeartRate:w.score.max_heart_rate??null,
        calories:kcal(w.score.kilojoule),
        distanceMeter:w.score.distance_meter??null
      })),
      profile:profile?{
        firstName:profile.first_name||'',
        lastName:profile.last_name||'',
        email:profile.email||''
      }:null,
      body:body?{
        heightMeter:body.height_meter??null,
        weightKg:body.weight_kilogram??null,
        maxHeartRate:body.max_heart_rate??null
      }:null
    };
  }

  async disconnect(){
    if(this.connected){
      try{await this._fetch('/user/access',{method:'DELETE'});}catch(_){}
    }
    this.token=null;this.accessCache=null;this.pending={};this._save();
  }
}

module.exports={WhoopIntegration,SCOPES,DEFAULT_REDIRECT_URI,sleepMs,sleepNeedMs,hours,kcal};
