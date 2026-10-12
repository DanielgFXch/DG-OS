'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
const html=read('index.html'),css=read('health-cinematic-v2.css'),js=read('health-cinematic-v2.js'),sw=read('sw.js'),svg=read('assets/health-nightscape-v2.svg');
assert.doesNotThrow(()=>new Function(js));
for(const f of ['health-cinematic-v2.css?v=2','health-cinematic-v2.js?v=2'])assert.ok(html.includes(f)&&sw.includes(f),'Loaded and cached '+f);
assert.ok(sw.includes('assets/health-nightscape-v2.svg'));
assert.ok(html.indexOf('health-premium.css?v=1.0.0')<html.indexOf('health-cinematic-v2.css?v=2'));
assert.ok(html.indexOf('jarvis-reference-ui.css?v=1')<html.indexOf('health-cinematic-v2.css?v=2'));
assert.ok(html.indexOf('personal.js?v=')<html.indexOf('health-cinematic-v2.js?v=2'));
for(const id of ['personalHealth','whoopSleep','whoopSleepPerformance','whoopRecovery','whoopHrv','whoopStrain','whoopCalories','whoopHealthMeta','whoopStatus','whoopConnect','whoopDetails','whoopSleepAnalysis','dgwSleepRefresh','dgwSleepBars']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'WHOOP original binding '+id);
}
assert.ok(css.includes('body[data-dgos-route="health"]'));
assert.ok(css.includes('var(--whoop-pct,0%)')&&css.includes('var(--pct)'),'Rings still reflect real values');
assert.ok(css.includes('overflow-x:clip')&&css.includes('prefers-reduced-motion'));
assert.ok(css.includes('data-target="personalHome"')&&css.includes('data-target="personalHealth"'));
assert.ok(css.includes('aria-current="page"'));
assert.ok(svg.startsWith('<svg')&&svg.trimEnd().endsWith('</svg>'));
assert.ok(!svg.includes('<script')&&!svg.includes('href="http'));
assert.ok(!js.includes('fetch(')&&!js.includes('localStorage')&&!js.includes('service_role'));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Balanced CSS');

class Fake{
 constructor(){this.children=[];this.dataset={};this.attrs={};this.listeners={};this.classList={contains:()=>false};this.textContent='';this.disabled=false;this.open=false;}
 querySelector(){return this.children.find(x=>x.className==='dgh-details-trigger')||null;}
 append(...nodes){this.children.push(...nodes)}
 setAttribute(k,v){this.attrs[k]=String(v)}
 addEventListener(k,fn){this.listeners[k]=fn}
 scrollIntoView(){this.scrolled=true}
 focus(){this.focused=true}
}
const health=new Fake(),badge=new Fake(),status=new Fake(),meta=new Fake(),details=new Fake(),observers=[];
health.dataset.whoopSync='disconnected';status.textContent='WHOOP · nicht verbunden';meta.textContent='Verbinde WHOOP einmal sicher.';
details.querySelector=()=>({focus:()=>{details.focused=true}});
health.querySelector=()=>badge;
const nodes={personalHealth:health,whoopStatus:status,whoopHealthMeta:meta,whoopDetails:details};
const document={getElementById:id=>nodes[id]||null,createElement:()=>new Fake()};
const window={addEventListener:()=>{}};
class MutationObserver{constructor(fn){this.fn=fn;observers.push(this)}observe(){}}
vm.runInNewContext(js,{document,window,MutationObserver,console},{timeout:1500});
const sync=badge.children.find(x=>x.className==='dgh-sync-subline');
const btn=badge.children.find(x=>x.className==='dgh-details-trigger');
assert.ok(sync&&btn);
assert.equal(sync.dataset.visible,'false');assert.equal(btn.disabled,true);
health.dataset.whoopSync='live';status.textContent='WHOOP · verbunden';meta.textContent='WHOOP automatisch aktualisiert · 09:38';
observers.forEach(o=>o.fn());
assert.equal(sync.textContent,'Synchronisiert · 09:38');assert.equal(sync.dataset.visible,'true');
assert.equal(btn.disabled,false);btn.listeners.click();assert.equal(details.open,true);assert.equal(details.scrolled,true);
meta.textContent='WHOOP-Daten geladen.';observers.forEach(o=>o.fn());
assert.equal(sync.textContent,'');assert.equal(sync.dataset.visible,'false');
console.log('Cinematic Health v2: data truth, genuine WHOOP controls, header, icons, accessibility and PWA confirmed');
