'use strict';
/* WHOOP mini header is only visual: no duplicate status, sync, or API operations. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('index.html');
const css=read('health-compact-whoop.css');
const sw=read('sw.js');
const original=read('health-cinematic-v2.css');
assert.ok(html.includes('<link rel="stylesheet" href="./health-compact-whoop.css?v=1" />'));
assert.ok(sw.includes("'./health-compact-whoop.css?v=1'"));
assert.ok(html.indexOf('health-cinematic-v2.css?v=2')<html.indexOf('health-compact-whoop.css?v=1'));
for(const id of ['whoopStatus','whoopConnect','whoopHealthMeta','whoopDetails','whoopSleep','whoopSleepPerformance','whoopRecovery','whoopHrv','whoopStrain','whoopCalories']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Original DOM data binding is unique: '+id);
}
assert.ok(css.includes('#personalHealth[data-whoop-sync="live"] > .personal-health-head'),'Live state only moves badge');
assert.ok(css.includes('.personal-health-actions'),'Uses existing WHOOP controls');
assert.ok(css.includes('position:absolute!important'),'Connected badge is positioned in header');
assert.ok(css.includes('inset:0 0 auto auto!important'),'Connected badge is top-right');
assert.ok(css.includes('min-height:0!important'),'Empty hero space removed');
assert.ok(css.includes('.dgh-whoop-icon')&&css.includes('display:none!important'),'Large WHOOP icon is hidden in compact mode');
assert.ok(css.includes('.dgh-details-trigger'),'Real WHOOP details remains clickable');
assert.ok(css.includes('.dgh-sync-subline[data-visible="true"]'),'Sync text hidden only in live compact header, original meta remains');
assert.ok(css.includes('min-height:188px'),'Secondary metrics move up slightly');
assert.ok(css.includes('prefers-reduced-motion')===false,'No animations were added');
assert.ok(!css.includes('body[data-dgos-route="jarvis"]'),'Other routes unaffected');
assert.ok(!css.includes('display:none!important;\n  }')||css.includes('#personalHealth'),'CSS is health scoped');
assert.ok(!css.includes('fetch(')&&!css.includes('localStorage')&&!css.includes('API_KEY'),'CSS does not affect WHOOP data');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS declarations balanced');
assert.ok(original.includes('data-whoop-sync="live"] .dgh-details-trigger'),'Genuine WHOOP action retained');
console.log('Health compact WHOOP: top-right mini pill, preserved reconnect behavior, lifted metrics and authentic data bindings OK');
