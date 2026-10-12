'use strict';
/* Uniform UI contract: no health-only navigation and no duplicated data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
const html=read('index.html'),css=read('dg-unified-premium.css'),sw=read('sw.js');
const nav=read('navigation.js'),health=read('health-dock-date.css'),personal=read('personal.js');
assert.ok(html.includes('<link rel="stylesheet" href="./dg-unified-premium.css?v=1" />'));
assert.ok(sw.includes("'./dg-unified-premium.css?v=1'"));
const links=[...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"\s*\/>/g)].map(m=>m[1]);
assert.equal(links.at(-1),'dg-unified-premium.css?v=1','One shared theme must load LAST');
assert.ok(html.indexOf('health-dock-date.css?v=1')<html.indexOf('dg-unified-premium.css?v=1'));
assert.match(sw,/const CACHE='dgos-personal-shell-[0-9]+'/, 'Versioned shell cache includes the new CSS asset');
assert.ok(css.includes('body[data-dgos-route] .topbar'));
assert.ok(css.includes('body[data-dgos-route] #dgosRouteBar:not(.hidden)'));
assert.ok(css.includes('body[data-dgos-route="trading"] #tradingCommandCenter .trading-back-personal'));
assert.ok(css.includes('body[data-dgos-route] .bottom-nav{'));
assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important'));
assert.ok(css.includes('body[data-dgos-route] .bottom-nav button.active'));
assert.ok(css.includes('body[data-dgos-route] .bottom-nav button[aria-current="page"]'));
for(const tab of ['personalHome','personalJarvis','personalCalendar','personalHealth','tradingWorkspace']){
  assert.ok(html.includes('data-target="'+tab+'"'),'Original button exists '+tab);
  assert.ok(css.includes('.bottom-nav button[data-target="'+tab+'"]::before{background-image:'),
    'Universal icon for '+tab);
}
for(const secondary of ['personalPrivate','personalSocial']){
  assert.ok(html.includes('data-target="'+secondary+'"'));
  assert.ok(css.includes('button[data-target="'+secondary+'"]'));
}
for(const route of ['home','jarvis','calendar','health','trading','private','social']){
  assert.ok(nav.includes(route+': { target:'),'Router route '+route);
}
const mobile=css.slice(css.indexOf('@media(max-width:700px)'));
assert.ok(mobile.includes('bottom:0!important'));
assert.ok(mobile.includes('inset:auto 0 0 0!important'));
assert.ok(mobile.includes('env(safe-area-inset-bottom)'));
assert.ok(mobile.includes('width:100%!important'));
assert.ok(mobile.includes('main.app')&&mobile.includes('padding-bottom'));
for(const id of ['whoopStatus','whoopSleep','whoopRecovery','whoopStrain','whoopSleepAnalysis',
                 'dgwSleepRange','personalJarvisOrbBtn','jarvisLifeCommandForm',
                 'calendarToday','tradingCommandCenter']){
  assert.ok(html.includes('id="'+id+'"'),'Original UI hook '+id);
}
assert.ok(css.includes('body[data-dgos-route="home"] #personalHome'));
assert.ok(css.includes('body[data-dgos-route="calendar"] #personalCalendar'));
assert.ok(css.includes('body[data-dgos-route="jarvis"] #personalJarvis'));
assert.ok(css.includes('body[data-dgos-route="health"] #personalHealth'));
assert.ok(css.includes('body[data-dgos-route="trading"] #tradingCommandCenter'));
assert.ok(css.includes('body[data-dgos-route="private"] #personalPrivate'));
assert.ok(css.includes('body[data-dgos-route="social"] #socialWorkspace'));
assert.ok(health.includes('dgh-sleep-day-chip'),'Actual sleep date remains visible');
assert.ok(personal.includes("set('whoopSleep'"),'WHOOP original remains data owner');
assert.ok(css.includes(':focus-visible')&&css.includes('prefers-reduced-motion'));
for(const forbidden of ['fetch(','localStorage','SUPABASE_SERVICE_ROLE_KEY','API_KEY','tradeOrder','innerHTML']){
  assert.ok(!css.includes(forbidden),'UI skin cannot modify private data '+forbidden);
}
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
console.log('DG OS: shared midnight/navy palette, common headers, fixed five-icon dock on all routes, original features intact.');
