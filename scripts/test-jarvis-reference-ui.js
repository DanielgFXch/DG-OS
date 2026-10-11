'use strict';
/* DG OS Jarvis reference UI: no mock values or duplicate functional controls. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const html = read('index.html');
const js = read('jarvis-reference-ui.js');
const css = read('jarvis-reference-ui.css');
const sw = read('sw.js');
const dashboard = read('jarvis-dashboard.js');
const voice = read('jarvis-voice.js');
const health = read('health-premium.css');
assert.doesNotThrow(() => new Function(js), 'New Jarvis UI JavaScript is syntactically valid');
assert.ok(html.includes('jarvis-reference-ui.css?v=1'));
assert.ok(html.includes('jarvis-reference-ui.js?v=1'));
assert.ok(html.indexOf('jarvis-premium.css?v=1') < html.indexOf('jarvis-reference-ui.css?v=1'), 'New visual system overrides old visual rules');
assert.ok(html.indexOf('jarvis-dashboard.js?v=3') < html.indexOf('jarvis-reference-ui.js?v=1'), 'Real dashboard handlers initialise before visual composition');
assert.ok(html.indexOf('jarvis-premium.js?v=1') < html.indexOf('jarvis-reference-ui.js?v=1'), 'Premium speech handlers initialise first');
for(const asset of ['jarvis-reference-ui.css?v=1','jarvis-reference-ui.js?v=1']){
  assert.ok(sw.includes(asset), 'PWA caches '+asset);
}
for(const name of ['personalJarvis','personalJarvisOrbBtn','jarvisLifeCommandForm','jarvisLifeCommandInput',
  'jarvisPhotoInput','jarvisWeatherAdvisor','jarvisLifeTasks','whoopStatus','dgwSleepPercent']){
  assert.ok(html.includes('id="'+name+'"'), 'Real source control/data still exists: '+name);
}
for(const code of [
  "panel.classList.contains('jarvis-dashboard-ready')",
  "active.append(activeLeft, orb)",
  "recent.append(reply)",
  "chat.append(form)",
  "extra.append(quick)",
  "originalDeck.querySelector('[data-jarvis-action=\"task\"]')?.click()",
  "go('personalHealth')",
  "value('jwaHeadline')",
  "value('dgwSleepPercent')",
  "value('jarvisLifeTasks')",
  "new MutationObserver(syncInsights)",
  "window.addEventListener('dgos-jarvis-microphone-state'"
]){
  assert.ok(js.includes(code), 'Wire actual UI instead of fake controls: '+code);
}
assert.ok(js.includes('bottom-nav button[data-target'), 'Navigation uses the existing router');
assert.ok(!js.includes('innerHTML') && !js.includes('fetch('), 'No injected HTML or new API calls');
assert.ok(!js.includes('localStorage') && !js.includes('API_KEY') && !js.includes('tradeOrder'), 'No secrets, trading writes or profile storage');
assert.ok(!js.includes("'81 %'") && !js.includes("'18°'"), 'Never hardcode example health/weather values');
assert.ok(css.includes('assets/jarvis-nightscape.svg'), 'Night mountain artwork present');
assert.ok(css.includes('.jref-active') && css.includes('.jref-insights') && css.includes('.jref-chat'), 'Premium reference sections styled');
assert.ok(css.includes('max-width:355px') && css.includes('prefers-reduced-motion'), 'Small phones and accessibility supported');
assert.ok(css.includes(':focus-visible'), 'Visible keyboard focus');
assert.ok((css.match(/{/g)||[]).length === (css.match(/}/g)||[]).length, 'CSS brace blocks balanced');
assert.ok(dashboard.includes('jarvis-dashboard-ready') && voice.includes('personalJarvisOrbBtn'), 'Existing real Jarvis is still wired');
assert.ok(health.includes('personalHealth'), 'Other independent WHOOP page remains untouched');
console.log('Jarvis reference UI: CSS, JS, real data sources, navigation, speech, PWA and no mocks verified');
