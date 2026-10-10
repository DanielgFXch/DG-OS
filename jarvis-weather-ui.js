/* Jarvis outfit card – uses existing validated hourly weather, no GPS or keys. */
(() => {
  'use strict';
  const host=document.getElementById('jarvisWeatherAdvisor');
  if(!host||!window.DGOSWeatherOutfit)return;
  const $=id=>document.getElementById(id);
  const engine=window.DGOSWeatherOutfit;
  const coldKey='dgos.weather.outfit.coldSensitive.v1';
  const localCold=()=>{
    try{return localStorage.getItem(coldKey)==='1';}catch{return false;}
  };
  let coldSensitive=localCold(),lastAdvice=null,forecast=null,hasUpdated=false,signature='',pending=false;
  const coldControl=$('jwaColdSensitive');
  const reload=$('jwaReload');
  const show=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  coldControl.checked=coldSensitive;
  const clock=ms=>new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ms));
  function clearCard(message){
    forecast=null;
    lastAdvice=null;
    host.dataset.state='unavailable';
    show('jwaHeadline','Keine aktuelle Prognose');
    show('jwaSummary',message);
    show('jwaConditions','Wetterdaten fehlen · Keine Kleidungsprognose');
    show('jwaMeta','Oetwil am See · Daten nicht verfügbar');
    $('jwaPeriods').replaceChildren();
    $('jwaAsk').disabled=true;
  }
  function render(advice){
    const oldSignature=signature;
    const newSignature=JSON.stringify([advice.headline,advice.metrics.rainPossible,
      advice.metrics.snowPossible,advice.metrics.windMax>=40,advice.outfit]);
    host.dataset.state='ready';
    show('jwaHeadline',advice.headline);
    show('jwaSummary',advice.summary);
    show('jwaConditions','Gefühlt '+advice.metrics.feelsMin+' bis '+advice.metrics.feelsMax+
      ' °C · Max. Regenwahrscheinlichkeit '+advice.metrics.rainMax+' %');
    show('jwaMeta',(advice.day==='tomorrow'?'Morgen':'Heute')+' · '+advice.location+
      ' · Wetterstand '+clock(advice.lastWeatherUpdate)+' Uhr');
    const list=$('jwaPeriods');list.replaceChildren();
    for(const period of advice.periods){
      if(period.label==='Nacht')continue;
      const card=document.createElement('div');
      card.className='jwa-period';
      const label=document.createElement('strong');label.textContent=period.label;
      const temp=document.createElement('span');temp.textContent='Gefühlt '+period.min+
        (period.max!==period.min?'–'+period.max:'')+' °C';
      const hint=document.createElement('small');hint.textContent=period.description+
        (period.rain>=35?' · Regen '+period.rain+' %':'');
      card.append(label,temp,hint);list.append(card);
    }
    $('jwaAsk').disabled=false;
    if(hasUpdated&&oldSignature&&oldSignature!==newSignature){
      show('jwaChanged','Die Wetterempfehlung hat sich aktualisiert.');
    }else show('jwaChanged','Automatisch aktualisiert, solange DG OS geöffnet ist.');
    hasUpdated=true;signature=newSignature;
  }
  function getAdvice(day='today'){
    if(!forecast)return null;
    try{
      return engine.calculate(forecast,{day,coldSensitive});
    }catch{return null;}
  }
  function update(data){
    if(!data){clearCard('Ohne aktuelle Wetterdaten kann Jarvis dir keine zuverlässige Kleidung empfehlen.');return;}
    forecast=data;
    let advice=getAdvice('today');
    if(!advice){
      // Late evening: show next morning rather than an empty card.
      advice=getAdvice('tomorrow');
    }
    if(!advice){clearCard('Die aktuelle Stundenprognose reicht gerade nicht für einen Kleidungstipp. Bitte neu laden.');return;}
    lastAdvice=advice;
    render(advice);
  }
  function answer(day='today'){
    const recommendation=getAdvice(day);
    if(!recommendation)return 'Gomes, ich habe gerade keine ausreichend aktuelle Wetterprognose für '+(day==='tomorrow'?'morgen':'heute')+'. Bitte aktualisiere das Wetter.';
    return recommendation.summary+' '+recommendation.details+'. Prognose für '+recommendation.location+' laut Open-Meteo.';
  }
  function ask(day='today'){
    const speech=answer(day);
    const reply=$('personalJarvisReply'),status=$('personalJarvisStatus');
    if(reply)reply.textContent=speech;
    if(status)status.textContent='Wetter · Kleidung';
    if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('dgos-jarvis-final-response',{detail:{text:speech}}));
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
    return speech;
  }
  $('jwaAsk').addEventListener('click',()=>ask(lastAdvice?.day==='tomorrow'?'tomorrow':'today'));
  coldControl.addEventListener('change',()=>{
    coldSensitive=coldControl.checked;
    try{localStorage.setItem(coldKey,coldSensitive?'1':'0');}catch{}
    if(forecast)update(forecast);
  });
  reload.addEventListener('click',async()=>{
    if(pending)return;
    pending=true;reload.disabled=true;
    show('jwaMeta','Aktuelle Wetterdaten werden geladen …');
    try{
      if(typeof window.DGOSWeatherRefresh==='function')await window.DGOSWeatherRefresh();
      else clearCard('Die Wetterverbindung konnte nicht gestartet werden.');
    }catch{clearCard('Wetterdaten konnten nicht aktualisiert werden.');}
    finally{pending=false;reload.disabled=false;}
  });
  window.addEventListener('dgos-weather-updated',event=>update(event.detail?.forecast));
  window.addEventListener('dgos-weather-unavailable',()=>clearCard('Die Wetterverbindung ist gerade nicht erreichbar. Keine alten Empfehlungen.'));
  window.DGOSWeatherAdvisor={getAdvice,answer,ask};
  if(window.DGOSWeatherForecast)update(window.DGOSWeatherForecast);
})();