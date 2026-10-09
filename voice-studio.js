'use strict';
(() => {
const $ = id => document.getElementById(id);
const providers = ['cartesia','elevenlabs','openai','browser'];
const storageKey='dgos.voiceStudio.preferences.v1';
const synth=window.speechSynthesis;
let provider='cartesia';
let utterance=null;
function notify(message){$('notice').textContent=message;}
function refresh(){
document.querySelectorAll('[data-provider]').forEach(button=>{button.dataset.active=String(button.dataset.provider===provider);button.setAttribute('aria-pressed',String(button.dataset.provider===provider));});
const browser=provider==='browser';
$('providerStatus').textContent=browser?'Lokal verfügbar':provider==='openai'?'Realtime: vorbereitet':provider==='cartesia'?'Unten Cartesia verbinden':'Nicht verbunden';
$('voiceSelect').disabled=!browser||!synth;
$('preview').disabled=!browser||!synth;
if(!browser)notify(provider==='openai'
?'OpenAI Realtime erfordert einen serverseitigen kurzlebigen Session-Token und eine bestätigte private Anmeldung. Noch nicht aktiviert.'
:provider==='cartesia'?'Bitte unten bei Meine Jarvis-Stimmen anmelden und deine Stimme auswählen.':'ElevenLabs ist noch nicht verbunden.');
else notify(synth?'Lokale Stimme ist bereit. Du kannst sie jetzt testen.':'Sprachausgabe wird von diesem Browser nicht unterstützt.');
}
function populate(){
const previous=$('voiceSelect').value;
$('voiceSelect').replaceChildren(new Option('Systemstandard',''));
if(!synth)return;
for(const v of synth.getVoices().slice().sort((a,b)=>a.name.localeCompare(b.name)))$('voiceSelect').add(new Option(v.name+' · '+v.lang,v.voiceURI));
$('voiceSelect').value=[...$('voiceSelect').options].some(o=>o.value===previous)?previous:'';
}
function stop(){synth?.cancel();utterance=null;}
function read(){
try {
const o=JSON.parse(localStorage.getItem(storageKey)||'{}');
if(providers.includes(o.provider))provider=o.provider;
if(['de-DE','en-GB','pt-PT'].includes(o.language))$('language').value=o.language;
if(Number(o.pace)>=0.7&&Number(o.pace)<=1.3)$('pace').value=String(o.pace);
populate();
if(typeof o.voice==='string'&&[...$('voiceSelect').options].some(x=>x.value===o.voice))$('voiceSelect').value=o.voice;
}catch(_){}
$('paceOut').textContent=Number($('pace').value).toFixed(2)+'×';refresh();
}
document.querySelectorAll('[data-provider]').forEach(b=>b.addEventListener('click',()=>{stop();provider=b.dataset.provider;refresh();}));
$('pace').addEventListener('input',()=>$('paceOut').textContent=Number($('pace').value).toFixed(2)+'×');
$('preview').addEventListener('click',()=>{
if(provider!=='browser'||!synth)return;
stop();
const text=$('sample').value.trim();
if(!text)return notify('Bitte zuerst einen Testtext eingeben.');
utterance=new SpeechSynthesisUtterance(text);
utterance.lang=$('language').value;utterance.rate=Number($('pace').value);
const voice=synth.getVoices().find(x=>x.voiceURI===$('voiceSelect').value);
if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
utterance.onerror=()=>notify('Die Sprachausgabe ist auf diesem Gerät nicht verfügbar.');
synth.speak(utterance);notify('Browser-Stimme wird abgespielt.');
});
$('stop').addEventListener('click',()=>{stop();notify('Wiedergabe gestoppt.');});
$('save').addEventListener('click',()=>{
localStorage.setItem(storageKey,JSON.stringify({provider,voice:$('voiceSelect').value,language:$('language').value,pace:Number($('pace').value)}));
notify('Gespeichert. '+(provider==='browser'?'Lokale Vorschau aktiviert.':'Anbieter vorgemerkt; noch keine kostenpflichtige Verbindung aktiv.'));
});
if(synth)synth.addEventListener?.('voiceschanged',populate);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
read();
})();