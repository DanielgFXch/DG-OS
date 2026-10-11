#!/usr/bin/env node
'use strict';
// DG OS WHOOP premium visual system - functional IDs and truthfulness contracts.
// Real values continue to come exclusively from the authenticated WHOOP API
// or the separately marked historical CSV import; never hardcode demo metrics.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html'),css=read('health-premium.css'),sw=read('sw.js');
const whoop=read('personal.js'),analytics=read('whoop-sleep-ui.js'),base=read('premium-ui.css');
assert.ok(html.includes('<link rel="stylesheet" href="./health-premium.css?v=1.0.0" />'));
assert.ok(sw.includes('health-premium.css?v=1.0.0'),'PWA caches new CSS');
assert.ok(sw.includes("dgos-personal-shell-52"),'Cache rotated so iPhone gets the update');
assert.ok(html.indexOf('home-compact.css?v=1')<html.indexOf('health-premium.css?v=1.0.0'),'Health visual overrides are loaded last');
assert.ok(css.includes('#personalHealth.personal-health-panel'),'CSS scoped to current health screen');
for(const id of [
  'personalHealth','whoopStatus','whoopConnect','whoopSleep','whoopSleepPerformance',
  'whoopRecovery','whoopHrv','whoopStrain','whoopCalories','whoopHealthMeta',
  'whoopSleepAnalysis','dgwSleepTitle','dgwSleepRefresh','dgwSleepRange',
  'dgwSleepNext','dgwSleepPrev','dgwSleepPercent','dgwSleepDuration','dgwSleepBars',
  'dgwWhoopImportFile','whoopDetails','whoopRhr'
]){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Unique original binding ID: '+id);
}
for(const value of ['day','week','month'])assert.ok(html.includes('data-dgw-period="'+value+'"'),'Existing working tabs '+value);
for(const name of ['dgh-headline','dgh-tagline','dgh-sleep-card','dgh-recovery-card','dgh-strain-card','dgh-sleep-subtitle'])
  assert.ok(html.includes('class="'+name+'"'),'Real HTML for styled element '+name);
assert.ok(whoop.includes("set('whoopSleep',sleep&&sleep.performance"),'True WHOOP percentage remains data-driven');
assert.ok(whoop.includes("set('whoopHealthMeta',updated&&Number.isFinite(updated.getTime())"),'Real WHOOP last-update timestamp retained');
assert.ok(analytics.includes("cards[i].style.setProperty('--whoop-pct'"),'Ring still follows real WHOOP data');
assert.ok(analytics.includes("data-dgw-period"),'Working timeline tabs retained');
assert.ok(css.includes('var(--whoop-pct,0%)'),'Ring progress uses actual JS-provided percentage');
assert.ok(!html.includes('vs. Vorwoche')&&!html.includes('+ 12 %'),'No invented week-on-week comparisons');
assert.ok(!html.includes('1373 kcal')&&!html.includes('88 %')&&!html.includes('81 %'),'No demo health numbers in the HTML');
assert.ok(css.includes('data-whoop-sync="live"'),'Only a verified live connection gets the green indicator');
assert.ok(css.includes('data-whoop-sync="live"] #whoopConnect'),'Connect action hidden only on live session');
assert.ok(!css.includes('http://')&&!css.includes('https://'),'Visuals do not fetch external assets');
assert.ok(css.includes('data:image/svg+xml'),'Mountains are decorative embedded vector, not a static screenshot');
assert.ok(css.includes('prefers-reduced-motion'),'Reduced-motion accessibility');
assert.ok(css.includes('@media (max-width:700px)'),'Responsive iPhone rules');
assert.ok(css.includes('focus-visible'),'Keyboard focus accessible');
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'Balanced CSS blocks');
assert.ok(base.includes('#personalHealth'),'Visual enhancement overlays existing design');
console.log('DG OS WHOOP Premium Health: real metrics, connection state, preserved functional controls, iPhone styles, cache and a11y OK');
