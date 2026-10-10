/* DG OS · deterministic outfit advisor based on live Open-Meteo hourly model.
   Exposes advice only for the existing Oetwil am See location. Not medical advice,
   not a guarantee of rain, not a notification service. Testable without network. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSWeatherOutfit=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const zone='Europe/Zurich';
  const location='Oetwil am See';
  const localDay=milliseconds=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(milliseconds));
  const localHour=milliseconds=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(new Date(milliseconds)));
  const tomorrowDate=date=>{
    const d=new Date(date+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+1);
    return d.toISOString().slice(0,10);
  };
  const safeNumber=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const rounded=v=>Math.round(v);
  const codeRain=c=>Number.isFinite(c)&&((c>=51&&c<=67)||(c>=80&&c<=82)||(c>=95&&c<=99));
  const codeSnow=c=>Number.isFinite(c)&&((c>=71&&c<=77)||(c>=85&&c<=86));
  function periodFor(hour){
    if(hour<6)return 'Nacht';
    if(hour<12)return 'Morgen';
    if(hour<18)return 'Nachmittag';
    return 'Abend';
  }
  function validateForecast(data,now=Date.now()){
    if(data?.timezone!==zone||data?.hourly_units?.time!=='unixtime')
      throw Error('forecast_timezone_or_units');
    if(data?.current_units?.time!=='unixtime'||!Number.isFinite(data?.current?.time)||
        Math.abs(data.current.time*1000-now)>90*60*1000)
      throw Error('forecast_stale');
    const h=data.hourly;
    const fields=['time','temperature_2m','apparent_temperature','precipitation_probability','wind_speed_10m','weather_code','uv_index'];
    if(!fields.every(f=>Array.isArray(h?.[f])&&h[f].length>=24&&h[f].length===h.time.length))
      throw Error('forecast_missing_hourly_data');
    if(h.time.length>200)throw Error('forecast_too_large');
    for(let i=0;i<h.time.length;i++){
      if(!Number.isFinite(h.time[i])||(i&&h.time[i]<=h.time[i-1]))
        throw Error('forecast_invalid_hours');
    }
    return h;
  }
  function windowFor(hour){
    if(hour>=6&&hour<12)return 'Morgen';
    if(hour>=12&&hour<18)return 'Nachmittag';
    if(hour>=18&&hour<24)return 'Abend';
    return 'Nacht';
  }
  function calculate(data,options={}){
    const now=Number.isFinite(options.now)?options.now:Date.now();
    const dateType=options.day==='tomorrow'?'tomorrow':'today';
    const day=localDay(now),target=dateType==='tomorrow'?tomorrowDate(day):day;
    const hourly=validateForecast(data,now);
    const startTime=Math.floor(now/3600000)*3600000;
    const hours=[];
    for(let i=0;i<hourly.time.length;i++){
      const epoch=hourly.time[i]*1000;
      if(localDay(epoch)!==target)continue;
      if(dateType==='today' && epoch<startTime)continue;
      const temp=safeNumber(hourly.temperature_2m[i]);
      const apparent=safeNumber(hourly.apparent_temperature[i]);
      if(temp===null||apparent===null)continue;
      hours.push({
        time:epoch,localHour:localHour(epoch),
        period:windowFor(localHour(epoch)),
        temperature:temp,feels:apparent,
        rain:safeNumber(hourly.precipitation_probability[i]),
        wind:safeNumber(hourly.wind_speed_10m[i]),
        uv:safeNumber(hourly.uv_index[i]),
        weatherCode:safeNumber(hourly.weather_code[i])
      });
    }
    if(hours.length<3)throw Error('forecast_not_enough_hours');
    if(hours.filter(h=>h.rain!==null).length<3)
      throw Error('forecast_precipitation_missing');
    const minFeels=Math.min(...hours.map(h=>h.feels));
    const maxFeels=Math.max(...hours.map(h=>h.feels));
    const maxTemp=Math.max(...hours.map(h=>h.temperature));
    const maxRain=Math.max(0,...hours.map(h=>h.rain??0));
    const maxWind=Math.max(0,...hours.map(h=>h.wind??0));
    const maxUv=Math.max(0,...hours.map(h=>h.uv??0));
    const snow=hours.some(h=>codeSnow(h.weatherCode));
    const rainy=hours.some(h=>codeRain(h.weatherCode))||hours.some(h=>(h.rain??0)>=60);
    const storm=hours.some(h=>Number(h.weatherCode)>=95);
    const rainLikely=hours.filter(h=>(h.rain??0)>=55||codeRain(h.weatherCode)).length>=2;
    const coldSensitive=options.coldSensitive===true;
    const wardrobeFeel=minFeels-(coldSensitive?3:0);
    const periods=['Morgen','Nachmittag','Abend','Nacht']
      .map(label=>{
        const collection=hours.filter(h=>h.period===label);
        if(!collection.length)return null;
        const rain=Math.max(0,...collection.map(h=>h.rain??0));
        return {
          label,
          min:rounded(Math.min(...collection.map(h=>h.feels))),
          max:rounded(Math.max(...collection.map(h=>h.feels))),
          rain:rounded(rain),
          wind:rounded(Math.max(0,...collection.map(h=>h.wind??0))),
          description:collection.some(h=>codeSnow(h.weatherCode))?'Schnee möglich':
            collection.some(h=>codeRain(h.weatherCode))||rain>=55?'Regen möglich':
            collection.some(h=>[45,48].includes(h.weatherCode))?'Neblig':'Wechselhaft'
        };
      }).filter(Boolean);
    let outfit,lead,icon;
    const dayWord=dateType==='tomorrow'?'Morgen':'Heute';
    if(snow||wardrobeFeel<=0){
      outfit='Warme Winterjacke, lange Hose und geschlossene Schuhe';
      lead=dayWord+' lieber richtig warm anziehen';icon='❄';
    }else if(wardrobeFeel<7){
      outfit='Warme Jacke, Pullover und lange Hose';
      lead=dayWord+' warm anziehen';icon='◈';
    }else if(wardrobeFeel<13){
      outfit='Leichte Jacke oder Übergangsjacke mit Pullover';
      lead=dayWord+' am besten mehrere Schichten tragen';icon='◐';
    }else if(wardrobeFeel<18){
      outfit='T-Shirt mit leichter Jacke oder dünnem Pullover';
      lead=dayWord+' reicht eine leichte Schicht zum Drüberziehen';icon='◐';
    }else if(wardrobeFeel<24){
      outfit='Leichtes Oberteil; dünne Jacke für kühlere Stunden';
      lead=dayWord+' eher leicht anziehen, aber eine Schicht mitnehmen';icon='☀';
    }else{
      outfit='Luftige Sommerkleidung und leichte Schuhe';
      lead=dayWord+' eher sommerlich anziehen';icon='☀';
    }
    const extras=[];
    if(storm)extras.push('Bei Gewittern besser Schutz suchen und die Prognose prüfen');
    else if(snow)extras.push('Wegen möglichem Schnee auf rutschige Wege achten');
    if(rainy)extras.push(rainLikely?'Regenschirm oder wasserfeste Jacke mitnehmen':'Vorsichtshalber einen kleinen Regenschirm einpacken');
    else if(maxRain>=35)extras.push('Einzelne Schauer sind möglich');
    if(maxWind>=40)extras.push('Es wird windig; eine winddichte Schicht ist sinnvoll');
    else if(maxWind>=28)extras.push('Etwas Wind einplanen');
    if(maxUv>=6)extras.push('Sonnenschutz mitnehmen');
    const warmLater=maxFeels-minFeels>=8&&maxTemp>=19;
    if(warmLater)extras.unshift('Später wird es deutlich wärmer – die Jacke sollte leicht auszuziehen sein');
    const periodSentence=periods
      .filter(x=>x.label!=='Nacht')
      .map(p=>p.label+': gefühlt '+p.min+(p.max!==p.min?' bis '+p.max:'')+' Grad'+
        (p.description==='Regen möglich'?', Regen möglich':''))
      .join('. ');
    const summary='Gomes, '+lead.charAt(0).toLowerCase()+lead.slice(1)+
      '. Meine Empfehlung: '+outfit+'.'+(extras.length?' '+extras.join('. ')+'.':'');
    return {
      date:target,day:dateType,location,
      headline:lead,
      outfit,icon,
      summary,
      extras,periods,
      short:'Kleidung: '+outfit+'.'+(rainy?' Regenschutz mitnehmen.':'')+(maxWind>=40?' Windige Abschnitte.':''),
      details:periodSentence,
      metrics:{
        feelsMin:rounded(minFeels),feelsMax:rounded(maxFeels),
        rainMax:rounded(maxRain),windMax:rounded(maxWind),uvMax:rounded(maxUv),
        rainPossible:rainy,snowPossible:snow
      },
      lastWeatherUpdate:data.current.time*1000
    };
  }
  function isWeatherQuestion(raw){
    if(typeof raw!=='string'||!raw.trim())return false;
    const q=raw.toLocaleLowerCase('de').replace(/^(?:hey|hallo|hi)\s*(?:jarvis)?[,\s:]*/,'').trim();
    return /\b(?:wetter|temperatur|anziehen|anzieh|angezogen|sommerlich|warmanziehen|jacke|pullover|outfit|kleidung|regenjacke|regenschirm|schirm|regnen|kalt|warm\s+heute|frieren|einkleiden)\b/u.test(q);
  }
  return {calculate,validateForecast,localDay,periodFor,isWeatherQuestion};
});