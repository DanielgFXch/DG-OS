'use strict';
/* iPhone navigation gap regression + sleep label truthfulness (real WHOOP wake time). */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const get=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=get('index.html'),sw=get('sw.js'),css=get('health-dock-date.css'),js=get('health-dock-date.js');
const source=get('supabase/functions/whoop/index.ts');
const history=get('whoop-sleep-ui.js');
assert.doesNotThrow(()=>new Function(js));
for(const asset of ['health-dock-date.css?v=1','health-dock-date.js?v=1']){
  assert.ok(html.includes(asset)&&sw.includes(asset),'Both app shell and service worker include '+asset);
}
assert.ok(html.indexOf('health-compact-whoop.css?v=1')<html.indexOf('health-dock-date.css?v=1'));
assert.ok(html.indexOf('health-cinematic-v2.js?v=2')<html.indexOf('health-dock-date.js?v=1'));
for(const id of ['whoopSleep','whoopRecovery','whoopStrain','whoopStatus','whoopConnect','whoopHealthMeta']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Real original element untouched '+id);
}
assert.ok(css.includes('body[data-dgos-route="health"]'),'Health-only dock styling');
assert.ok(css.includes('inset:auto 0 0 0!important'),'Dock reaches the bottom rather than floating above it');
assert.ok(css.includes('bottom:0!important'));
assert.ok(css.includes('env(safe-area-inset-bottom)'),'Gesture safe-area inside the dock');
assert.ok(css.includes('main.app')&&css.includes('padding-bottom'),'Scrolled content stays accessible above the dock');
assert.ok(css.includes('background:linear-gradient(165deg,rgba(4,20,54,.985),rgba(1,10,31,.995))'),'Solid background hides content behind the dock');
assert.ok(css.includes('pointer-events:none!important'),'Date chip does not intercept controls');
assert.ok((css.match(/{/g)||[]).length===(css.match(/}/g)||[]).length,'CSS braces');
assert.ok(source.includes('sleep:sleep ? {')||source.includes('sleep: sleep ? {'),'Production WHOOP API shape checked');
assert.ok(source.includes('start:sleep.start,end:sleep.end'),'WHOOP response exposes actual wake time');
assert.ok(history.includes('dgos-whoop-history-loaded'),'Historical fallback is a genuine event');
assert.ok(!js.includes('fetch(')&&!js.includes('localStorage'),'Visual label does not access private auth');
assert.ok(!js.includes('innerHTML'),'Safe DOM-only construction');

class Elem{
  constructor(){this.children=[];this.dataset={};this.attrs={};this.textContent='';this.className='';}
  append(...c){this.children.push(...c)}
  prepend(...c){this.children.unshift(...c)}
  setAttribute(k,v){this.attrs[k]=v}
  querySelector(q){return this.children.find(x=>'.'+x.className===q)||null}
}
const card=new Elem(),health=new Elem();health.dataset.whoopSync='live';
const listeners={};
const document={querySelector:q=>q==='#personalHealth .dgh-sleep-card'?card:null,getElementById:id=>id==='personalHealth'?health:null,createElement:()=>new Elem()};
const window={addEventListener:(key,fn)=>listeners[key]=fn};
vm.runInNewContext(js,{document,window,Intl,Date,console},{timeout:1000});
const chip=card.children[0];
assert.equal(chip.className,'dgh-sleep-day-chip');
assert.equal(chip.children[0].textContent,'SCHLAFDATEN');
const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'});
const today=fmt.format(new Date());
const todayWake=new Date(today+'T10:00:00Z').toISOString();
listeners['dgos-whoop-updated']({detail:{sleep:{end:todayWake}}});
assert.equal(chip.children[0].textContent,'HEUTE','Today label only from real WHOOP wake date');
assert.equal(chip.dataset.kind,'today');
assert.ok(chip.children[1].textContent.includes(today.slice(0,4)),'Small date shown');
const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString();
listeners['dgos-whoop-updated']({detail:{sleep:{end:yesterday}}});
assert.equal(chip.children[0].textContent,'LETZTER SCHLAF','Old WHOOP sleep must not be called today');
assert.equal(chip.dataset.kind,'previous');
listeners['dgos-whoop-updated']({detail:{sleep:null}});
assert.equal(chip.children[0].textContent,'DATUM OFFEN','No fabricated date when the WHOOP API lacks sleep');
health.dataset.whoopSync='unavailable';
listeners['dgos-whoop-history-loaded']({detail:{latestDate:today}});
assert.equal(chip.children[0].textContent,'GESPEICHERT','Old archive must be marked as saved, not live');
health.dataset.whoopSync='live';
listeners['dgos-whoop-history-loaded']({detail:{latestDate:today}});
assert.equal(chip.children[0].textContent,'GESPEICHERT','Archive cannot override confirmed live WHOOP state');
console.log('PASS: health bottom dock anchored, real today/previous sleep dates, no invented data, WHOOP integration preserved');
