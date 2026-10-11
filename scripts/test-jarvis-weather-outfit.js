#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const advisor=require('../jarvis-weather-outfit.js');
const now=Date.parse('2026-10-10T05:05:00Z'); // Saturday 07:05 in Zürich
function model(make=()=>({})){
 const start=Date.parse('2026-10-09T22:00:00Z')/1000;
 const hours=Array.from({length:48},(_,i)=>start+i*3600);
 const data={timezone:'Europe/Zurich',current_units:{time:'unixtime',temperature_2m:'°C'},
 current:{time:now/1000,temperature_2m:8,is_day:1,weather_code:0},
 hourly_units:{time:'unixtime'},
 hourly:{time:[],temperature_2m:[],apparent_temperature:[],precipitation_probability:[],
 wind_speed_10m:[],weather_code:[],uv_index:[]}};
 for(const timestamp of hours){
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',hour:'2-digit',hourCycle:'h23'}).format(new Date(timestamp*1000)));
  const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp*1000));
  const obj={temperature:hour<11?6:hour<17?22:11,feels:hour<11?4:hour<17?23:9,rain:0,wind:9,uv:hour===13?7:0,code:0,...make(hour,localDate)};
  data.hourly.time.push(timestamp);
  data.hourly.temperature_2m.push(obj.temperature);
  data.hourly.apparent_temperature.push(obj.feels);
  data.hourly.precipitation_probability.push(obj.rain);
  data.hourly.wind_speed_10m.push(obj.wind);
  data.hourly.weather_code.push(obj.code);
  data.hourly.uv_index.push(obj.uv);
 }
 return data;
}
const baseline=model((hour,date)=>date==='2026-10-10'&&hour>=18&&hour<=19?{rain:67,code:61}:hour===16?{wind:42}:{});
const info=advisor.calculate(baseline,{now});
assert.equal(info.day,'today');
assert.equal(info.location,'Oetwil am See');
assert.ok(info.summary.startsWith('Gomes, heute'));
assert.ok(info.headline.startsWith('Heute'));
assert.match(info.outfit,/Jacke/);
assert.ok(info.extras.some(x=>/Regen/gi.test(x)));
assert.ok(info.extras.some(x=>/wind/gi.test(x)));
assert.ok(info.extras.some(x=>/Sonnenschutz/.test(x)));
assert.ok(info.extras.some(x=>/wärmer/.test(x)));
assert.deepEqual(info.periods.map(x=>x.label),['Morgen','Nachmittag','Abend']);
assert.ok(info.periods.find(x=>x.label==='Morgen').min<=5);
assert.ok(info.periods.find(x=>x.label==='Nachmittag').max>=22);
assert.equal(info.metrics.rainPossible,true);
assert.equal(info.metrics.feelsMin,4);
const mild=model(()=>({temperature:26,feels:27,rain:0,wind:8,uv:1}));
const summer=advisor.calculate(mild,{now});
assert.match(summer.headline,/sommerlich/);
assert.match(summer.outfit,/Sommerkleidung/);
assert.equal(summer.metrics.rainPossible,false);
const warmer=advisor.calculate(model(()=>({temperature:17,feels:15,rain:0,wind:8,uv:1})),{now});
const sensitive=advisor.calculate(model(()=>({temperature:17,feels:15,rain:0,wind:8,uv:1})),{now,coldSensitive:true});
assert.notEqual(warmer.outfit,sensitive.outfit,'Cold sensitivity changes recommendations, never displayed model measurements');
assert.equal(warmer.metrics.feelsMin,sensitive.metrics.feelsMin);
const snowy=advisor.calculate(model(()=>({temperature:-1,feels:-5,rain:80,code:71,wind:4,uv:0})),{now});
assert.match(snowy.outfit,/Winterjacke/);
assert.equal(snowy.metrics.snowPossible,true);
const tomorrow=advisor.calculate(mild,{now,day:'tomorrow'});
assert.equal(tomorrow.day,'tomorrow');
assert.equal(tomorrow.date,'2026-10-11');
assert.ok(tomorrow.headline.startsWith('Morgen'),tomorrow.headline);
assert.ok(tomorrow.summary.startsWith('Gomes, morgen'),tomorrow.summary);
assert.throws(()=>advisor.calculate({...mild,timezone:'UTC'},{now}),/timezone/);
assert.throws(()=>advisor.calculate({...mild,current:{...mild.current,time:now/1000-3*3600}},{now}),/stale/);
const malformed=model();malformed.hourly.apparent_temperature=[];
assert.throws(()=>advisor.calculate(malformed,{now}),/missing_hourly/);
const blankRain=model();blankRain.hourly.precipitation_probability.fill(null);
assert.throws(()=>advisor.calculate(blankRain,{now}),/precipitation_missing/);
const oldTime=model();oldTime.hourly.time[2]=oldTime.hourly.time[1];
assert.throws(()=>advisor.calculate(oldTime,{now}),/invalid_hours/);
for(const q of ['Wie soll ich mich heute anziehen?','Hey Jarvis, brauche ich eine Jacke?',
 'Soll ich mich heute eher sommerlich anziehen?', 'Wird es regnen?',
 'Wie wird das Wetter morgen?', 'Brauche ich einen Schirm?']){
 assert.equal(advisor.isWeatherQuestion(q),true,q);
}
for(const q of ['Ich brauche Toast und Milch', 'Füge Tomaten in meine Einkaufsliste',
 'Ich muss die Stromrechnung bezahlen','Habe ich heute Termine?']){
 assert.equal(advisor.isWeatherQuestion(q),false,q);
}
const html=read('index.html'),app=read('personal.js'),weather=read('weather.js'),
      ui=read('jarvis-weather-ui.js'),dashboard=read('jarvis-dashboard.js'),
      css=read('jarvis-weather.css'),sw=read('sw.js');
for(const id of ['homeOutfitOpen','homeOutfitText','jarvisWeatherAdvisor','jwaTitle','jwaHeadline','jwaSummary','jwaConditions',
 'jwaPeriods','jwaColdSensitive','jwaAsk','jwaReload','jwaChanged','jwaMeta']){
 assert.ok(html.includes('id="'+id+'"'),'Weather card ID missing '+id);
}
assert.ok(html.includes('jarvis-weather-outfit.js?v=1'));
assert.ok(html.includes('jarvis-weather-ui.js?v=1'));
assert.ok(html.includes('jarvis-weather.css?v=1'));
assert.ok(html.includes('weather.js?v=0.47.0'));
assert.ok(html.includes('personal.js?v=0.59.10'));
assert.ok(html.includes('jarvis-dashboard.js?v=2'));
assert.ok(html.indexOf('jarvis-weather-outfit.js?v=1')<html.indexOf('jarvis-weather-ui.js?v=1'));
assert.ok(html.indexOf('weather.js?v=0.47.0')<html.indexOf('jarvis-weather-ui.js?v=1'));
assert.ok(weather.includes('hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,uv_index'));
assert.ok(weather.includes('forecast_days=2'));
assert.ok(weather.includes("root.DGOSWeatherForecast=forecast"));
assert.ok(weather.includes("dgos-weather-updated"));
assert.ok(weather.includes("dgos-weather-unavailable"));
assert.ok(weather.includes("root.DGOSWeatherRefresh=refresh"));
assert.ok(app.includes('window.DGOSWeatherOutfit?.isWeatherQuestion(original)'));
assert.ok(app.includes("DGOSWeatherAdvisor?.getAdvice('today')"));
assert.ok(app.includes('Kleidung & Wetter'));
assert.ok(app.includes("showReply(response)"));
assert.ok(dashboard.includes("weatherCard.insertAdjacentElement('afterend',photoPanel)"));
assert.ok(ui.includes("dgos-weather-updated"));
assert.ok(ui.includes("dgos-weather-unavailable"));
assert.ok(ui.includes("coldKey='dgos.weather.outfit.coldSensitive.v1'"));
assert.ok(ui.includes("window.DGOSWeatherAdvisor={getAdvice,answer,ask}"));
assert.ok(ui.includes("'homeOutfitText'"));
assert.ok(ui.includes("'homeOutfitOpen'"));
assert.ok(!ui.includes("Notification.requestPermission"),"No stealth notifications");
assert.ok(!ui.includes("PushManager"),"No unsolicited background push");
assert.ok(!ui.includes("API_KEY"));
assert.ok(!weather.includes("API_KEY"));
assert.ok(css.includes('@media(max-width:680px)'));
assert.ok(css.includes('#personalJarvis .jwa'));
assert.ok(sw.includes('dgos-personal-shell-46'));
assert.ok(sw.includes('jarvis-weather-ui.js?v=1'));
assert.ok(sw.includes('jarvis-weather-outfit.js?v=1'));
assert.doesNotThrow(()=>new Function(ui));
assert.doesNotThrow(()=>new Function(weather));
assert.doesNotThrow(()=>new Function(app));
assert.doesNotThrow(()=>new Function(dashboard));
console.log('Jarvis outfit/weather: precise hour/date advice, negative and stale tests, speech, briefing, mobile/PWA and no-push safety passed');
