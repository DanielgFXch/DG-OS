/* Public weather model data. No account or GPS access required. */
(function(root){
  'use strict';
  const zone='Europe/Zurich';
  const endpoint='https://api.open-meteo.com/v1/forecast?latitude=47.27&longitude=8.72&current=temperature_2m,apparent_temperature,is_day,weather_code&daily=sunrise,sunset&timezone=Europe%2FZurich&timeformat=unixtime&forecast_days=1';
  const day=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
  const clock=seconds=>new Intl.DateTimeFormat('de-CH',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(seconds*1000));
  function describe(code){
    if(code===0)return 'Klar';if(code<=3&&code>=1)return 'Bewölkt';if([45,48].includes(code))return 'Nebel';
    if(code>=51&&code<=57)return 'Nieselregen';if(code>=61&&code<=67)return 'Regen';if(code>=71&&code<=77)return 'Schnee';
    if(code>=80&&code<=82)return 'Regenschauer';if([85,86].includes(code))return 'Schneeschauer';if(code>=95&&code<=99)return 'Gewitter';return 'Wetter';
  }
  function normalize(data,now=Date.now()){
    const c=data?.current,d=data?.daily,rise=d?.sunrise?.[0],set=d?.sunset?.[0];
    if(data?.timezone!==zone||data?.current_units?.time!=='unixtime'||data?.current_units?.temperature_2m!=='°C'||!Number.isFinite(c?.temperature_2m)||!Number.isFinite(c?.time)||Math.abs(now-c.time*1000)>90*60000)throw Error('Temperature data unavailable or stale');
    if(!Number.isFinite(rise)||!Number.isFinite(set)||set<=rise||day(rise*1000)!==day(now)||day(set*1000)!==day(now))throw Error('Sun times missing or out of date');
    const minutes=Math.round((set-rise)/60);
    return {temperature:Math.round(c.temperature_2m)+' °C',feels:Number.isFinite(c.apparent_temperature)?'Gefühlt '+Math.round(c.apparent_temperature)+' °C':'Gefühlte Temperatur nicht verfügbar',description:describe(c.weather_code)+(c.is_day===1?' · Tag':c.is_day===0?' · Nacht':''),sunrise:clock(rise),sunset:clock(set),daylight:'Tageslicht '+Math.floor(minutes/60)+' h '+minutes%60+' min',status:'Modellwerte · Stand '+clock(c.time)+' Uhr · Oetwil am See'};
  }
  if(typeof module==='object'&&module.exports){module.exports={normalize,endpoint};return;}
  const $=id=>root.document.getElementById(id);
  function tick(){ $('personalClock').textContent=new Intl.DateTimeFormat('de-CH',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()); }
  let busy=false,lastAttempt=0;
  async function refresh(){
    if(busy)return;busy=true;lastAttempt=Date.now();$('weatherRefresh').disabled=true;$('weatherStatus').textContent='Wetterdaten werden aktualisiert …';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(endpoint,{signal:controller.signal,cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('Weather request failed');
      const values=normalize(await response.json());
      for(const [key,id] of Object.entries({temperature:'weatherTemperature',feels:'weatherFeels',description:'weatherDescription',sunrise:'weatherSunrise',sunset:'weatherSunset',daylight:'weatherDaylight',status:'weatherStatus'}))$(id).textContent=values[key];
    }catch(_){
      $('weatherTemperature').textContent='— °C';$('weatherFeels').textContent='Gefühlt — °C';$('weatherDescription').textContent='Wetter nicht verfügbar';$('weatherSunrise').textContent='—:—';$('weatherSunset').textContent='—:—';$('weatherDaylight').textContent='Tageslicht —';$('weatherStatus').textContent='Abruf fehlgeschlagen. Bitte erneut versuchen.';
    }finally{clearTimeout(timeout);busy=false;$('weatherRefresh').disabled=false;}
  }
  $('weatherRefresh').addEventListener('click',refresh);
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden){tick();if(Date.now()-lastAttempt>60000)refresh();}});
  tick();refresh();setInterval(tick,1000);setInterval(()=>{if(!root.document.hidden)refresh();},600000);
})(typeof window!=='undefined'?window:globalThis);
