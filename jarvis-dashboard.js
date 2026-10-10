/* DG OS Jarvis · compact command center UX.
 * Reorders existing, initialized widgets WITHOUT cloning controls, rebinding
 * listeners, changing secrets, trading strategy, or backend actions.
 * Original Jarvis markup remains available as fallback if this module fails.
 */
(() => {
  'use strict';
  const panel=document.getElementById('personalJarvis');
  const hero=panel?.querySelector('.jarvis-cinematic-hero');
  const consoleNode=panel?.querySelector('.jarvis-voice-console');
  const pairNode=panel?.querySelector('.jarvis-device-pair');
  const orb=document.getElementById('personalJarvisOrbBtn');
  const summary=panel?.querySelector('.jarvis-life-stats');
  const weatherCard=document.getElementById('jarvisWeatherAdvisor');
  const form=document.getElementById('jarvisLifeCommandForm');
  const deck=panel?.querySelector('.jarvis-command-deck');
  const photoEntry=panel?.querySelector('.jarvis-photo-entry');
  const photoPanel=document.getElementById('jarvisPhotoPanel');
  const intelligence=document.getElementById('jarvisIntelligence');
  const integrations=panel?.querySelector('.jarvis-integrations');
  const masterSpeech=document.getElementById('jvEnabled');
  const pairingBadge=document.getElementById('jdpBadge');
  if(!panel||!hero||!consoleNode||!pairNode||!orb||!summary||!form||!deck||!photoEntry||!photoPanel||!intelligence||!integrations||!masterSpeech||!pairingBadge)return;
  if(document.getElementById('jarvisDashboardQuick'))return;
  const make=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const heading=make('div','jarvis-dash-eyebrow','DEINE PERSÖNLICHE ZENTRALE');
  const quick=make('section','jarvis-dash-quick');
  quick.id='jarvisDashboardQuick';
  quick.setAttribute('aria-label','Jarvis Schnellzugriff');
  const head=make('div','jarvis-dash-quick-head');
  const titleWrap=make('div','jarvis-dash-intro');
  titleWrap.append(heading,make('h3','','Womit soll ich dir helfen?'));
  const caption=make('p','','Sprich mit Jarvis oder starte direkt eine Aufgabe.');
  titleWrap.append(caption);
  const controls=make('div','jarvis-dash-voice-controls');
  const voiceToggle=make('button','jarvis-dash-voice-toggle');
  voiceToggle.id='jarvisDashVoiceToggle';voiceToggle.type='button';
  voiceToggle.setAttribute('role','switch');
  voiceToggle.setAttribute('aria-label','Jarvis Sprachantwort ein- oder ausschalten');
  const statusDot=make('span','jarvis-dash-speaker-icon','🔊');
  statusDot.setAttribute('aria-hidden','true');
  const voiceLabel=make('span','jarvis-dash-voice-label');
  voiceToggle.append(statusDot,voiceLabel);
  const settingsLink=make('button','jarvis-dash-settings-link','Stimme & Verbindung ↗');
  settingsLink.type='button';settingsLink.id='jarvisDashSettingsLink';
  controls.append(voiceToggle,settingsLink);
  head.append(titleWrap,controls);quick.append(head);
  const cards=make('div','jarvis-dash-cards');
  const choices=[
    {id:'plan',icon:'◫',title:'Mein Tag',sub:'Termine & Aufgaben'},
    {id:'shopping',icon:'▤',title:'Einkaufsliste',sub:'Produkte verwalten'},
    {id:'brain',icon:'✦',title:'Gedächtnis',sub:'Was Jarvis weiss'},
    {id:'photo',icon:'◉',title:'Foto nutzen',sub:'Rechnung & Einkauf'}
  ];
  const cardButtons={};
  for(const choice of choices){
    const btn=make('button','jarvis-dash-card');btn.type='button';
    btn.dataset.jarvisDashboard=choice.id;
    const icon=make('span','jarvis-dash-card-icon',choice.icon);icon.setAttribute('aria-hidden','true');
    const copy=make('span','jarvis-dash-card-copy');
    copy.append(make('strong','',choice.title),make('small','',choice.sub));
    const arrow=make('span','jarvis-dash-card-arrow','›');arrow.setAttribute('aria-hidden','true');
    btn.append(icon,copy,arrow);cards.append(btn);cardButtons[choice.id]=btn;
  }
  quick.append(cards);
  const help=make('p','jarvis-dash-mic-hint');
  help.id='jarvisDashMicHint';
  help.textContent='Mikrofon: auf den Orb tippen, sprechen und zum Senden erneut tippen.';
  quick.append(help);
  // Hide the long form of specialized actions behind an accessible native
  // disclosure while preserving the ORIGINAL buttons and click listeners.
  const more=make('details','jarvis-dash-more');
  more.id='jarvisDashMore';
  const moreSummary=make('summary','', 'Weitere Aktionen');
  const moreHint=make('span','','Briefing · Aufgaben · Termine · Organisieren');
  moreSummary.append(moreHint);
  more.append(moreSummary);
  const advanced=make('details','jarvis-dash-advanced');
  advanced.id='jarvisDashAdvanced';
  const advSummary=make('summary');
  const advTitle=make('span','','Stimme, Geräte & Einstellungen');
  const advSecondary=make('small','','Sprachstudio · Telegram-Verbindung');
  advSummary.append(advTitle,advSecondary);
  advanced.append(advSummary);
  // Reparent nodes only. Never clone them: existing listeners, state,
  // microphone input, voice selection and Telegram pairing keep working.
  hero.insertAdjacentElement('afterend',quick);
  quick.insertAdjacentElement('afterend',form);
  if(weatherCard){
    form.insertAdjacentElement('afterend',weatherCard);
    weatherCard.insertAdjacentElement('afterend',photoPanel);
  }else form.insertAdjacentElement('afterend',photoPanel);
  photoPanel.insertAdjacentElement('afterend',summary);
  summary.insertAdjacentElement('afterend',intelligence);
  intelligence.insertAdjacentElement('afterend',more);
  more.append(deck);
  more.insertAdjacentElement('afterend',advanced);
  advanced.append(consoleNode,pairNode);
  advanced.insertAdjacentElement('afterend',integrations);
  // Original hidden photo-file input remains available; the quick card invokes
  // precisely the existing image-pick handler rather than a new upload flow.
  const voiceSync=()=>{
    const enabled=Boolean(masterSpeech.checked);
    voiceToggle.setAttribute('aria-checked',String(enabled));
    voiceToggle.dataset.enabled=String(enabled);
    voiceLabel.textContent=enabled?'Sprachantwort an':'Sprachantwort aus';
  };
  voiceToggle.addEventListener('click',()=>{
    masterSpeech.checked=!masterSpeech.checked;
    masterSpeech.dispatchEvent(new Event('change',{bubbles:true}));
    voiceSync();
  });
  masterSpeech.addEventListener('change',voiceSync);
  voiceSync();
  function openSection(tab){
    if(tab==='plan'||tab==='brain'){
      const switcher=intelligence.querySelector('[data-jb-tab="'+tab+'"]');
      switcher?.click();
      intelligence.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(tab==='shopping'){
      const nav=document.querySelector('.bottom-nav button[data-target="personalPrivate"]');
      if(nav){
        nav.click();
        document.querySelector('[data-private-tab="shopping"]')?.click();
      }else form.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if(tab==='photo'){
      // Direct input activation is more reliable on iOS Safari when the
      // original, initialized photo entry is visually collapsed.
      document.getElementById('jarvisPhotoInput')?.click();
    }
  }
  Object.entries(cardButtons).forEach(([key,btn])=>btn.addEventListener('click',()=>openSection(key)));
  settingsLink.addEventListener('click',()=>{
    advanced.open=true;
    advanced.scrollIntoView({behavior:'smooth',block:'start'});
    const select=document.getElementById('jvEngine');
    if(select)select.focus({preventScroll:true});
  });
  // Connection badge only turns "connected" after actual device-pairing
  // widget declares success. Existing static ONLINE is not evidence.
  const connectionLabel=hero.querySelector('.jarvis-system-badge span');
  const connectionBadge=hero.querySelector('.jarvis-system-badge');
  const updateConnection=()=>{
    const status=pairingBadge.textContent.trim().toUpperCase();
    const connected=status==='VERBUNDEN';
    if(connectionLabel)connectionLabel.textContent=connected?'VERBUNDEN':
      (status==='WARTET'||status==='KOPPLUNG')?'KOPPLUNG':'PRÜFEN';
    if(connectionBadge){
      connectionBadge.dataset.connected=String(connected);
      connectionBadge.setAttribute('aria-label',connected?'Jarvis-Gerät ist verbunden':'Jarvis-Geräteverbindung noch nicht bestätigt');
    }
    // Only draw attention to the pairing form when needed; do not erase
    // a manually opened settings pane on a status update.
    if(!connected && status==='KOPPLUNG')advanced.open=true;
  };
  updateConnection();
  const pairObserver=new MutationObserver(updateConnection);
  pairObserver.observe(pairingBadge,{childList:true,subtree:true,characterData:true});
  window.addEventListener('dgos-device-session',updateConnection);
  const setHint=(text)=>{help.textContent=text;};
  window.addEventListener('dgos-jarvis-microphone-state',event=>{
    const state=event.detail?.state;
    if(state==='listening')setHint('● Aufnahme läuft. Sprich jetzt und tippe zum Senden erneut auf den Orb.');
    else if(state==='starting')setHint('Mikrofon wird gestartet. Bitte erlaube den Zugriff in Safari.');
    else if(state==='processing')setHint('Deine Aufnahme wird verarbeitet …');
    else if(state==='error')setHint('Die Aufnahme hat nicht geklappt. Lies bitte die Fehlermeldung unter dem Orb.');
    else if(state==='result')setHint('Text erkannt. Jarvis bearbeitet deine Anfrage …');
    else setHint('Mikrofon: auf den Orb tippen, sprechen und zum Senden erneut tippen.');
  });
  // The voice settings may need the microphone or an iOS TTS retry. Keep
  // the disclosure reachable, and never block original callbacks.
  panel.classList.add('jarvis-dashboard-ready');
})();
