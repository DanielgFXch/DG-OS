#!/usr/bin/env node
'use strict';
/* Real client-script integration test with a minimal DOM shim, no external
   packages/network/API credentials. Verifies controls remain the SAME nodes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),js=read('jarvis-dashboard.js'),css=read('jarvis-dashboard.css'),sw=read('sw.js');
assert.doesNotThrow(()=>new Function(js));
for(const id of ['personalJarvis','personalJarvisOrbBtn','jarvisLifeCommandForm',
  'jarvisLifeCommandInput','jarvisPhotoInput','jarvisPhotoPanel','jarvisIntelligence',
  'jbPlanPanel','jbBrainPanel','jbPlanShopping','jvEnabled','jdpBadge']){
  if(['jvEnabled','jdpBadge'].includes(id))continue; // inserted by existing JS
  assert.ok(html.includes('id="'+id+'"'),'Preserve original Jarvis id: '+id);
}
assert.ok(html.includes('jarvis-dashboard.js?v=2'));
assert.ok(html.includes('jarvis-dashboard.css?v=1'));
assert.ok(html.indexOf('jarvis-device-pairing.js?v=1')<html.indexOf('jarvis-dashboard.js?v=2'),
  'Keep pairing/voice controls initialized before layout composition');
assert.ok(sw.includes('dgos-personal-shell-47'));
assert.ok(sw.includes('jarvis-dashboard.css?v=1'));
assert.ok(sw.includes('jarvis-dashboard.js?v=2'));
assert.ok(css.includes('#personalJarvis.jarvis-dashboard-ready'));
assert.ok(css.includes('@media(max-width:700px)'));
assert.ok(css.includes('prefers-reduced-motion'));
assert.ok(!js.includes('localStorage'),'UI refactor never edits tokens or prefs directly');
assert.ok(!js.includes('innerHTML='),'Do not render private content as HTML');
assert.ok(!js.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert.ok(!js.includes('OPENAI_API_KEY'));
assert.ok(!js.includes('fetch('),'Dashboard must preserve old secure APIs');
assert.ok(!js.includes('tradeOrder'),'Trading engine untouched');
const balanced=s=>(s.match(/{/g)||[]).length===(s.match(/}/g)||[]).length;
assert.ok(balanced(css),'New CSS has balanced declarations');
const events=()=>new Map();
class Node{
 constructor(tag='div',id='',cls=''){
  this.tagName=tag.toUpperCase();this.id=id;this.className=cls;this.children=[];this.parentNode=null;
  this.dataset={};this.attributes={};this.listeners=events();this.textContent='';
  this.checked=false;this.hidden=false;this.open=false;this.clicked=0;this.scrolled=0;
  this.classList={
   contains:c=>this.className.split(/\s+/).includes(c),
   add:c=>{if(!this.classList.contains(c))this.className+=' '+c;},
   remove:c=>{this.className=this.className.split(/\s+/).filter(x=>x!==c).join(' ');}
  };
 }
 append(...nodes){for(const node of nodes){if(!(node instanceof Node))continue;
   if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(x=>x!==node);
   this.children.push(node);node.parentNode=this;}}
 insertAdjacentElement(position,node){assert.equal(position,'afterend');const parent=this.parentNode;if(!parent)throw Error('no parent');
   if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(x=>x!==node);
   const index=parent.children.indexOf(this);parent.children.splice(index+1,0,node);node.parentNode=parent;}
 setAttribute(k,v){this.attributes[k]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
 dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);return true;}
 click(){this.clicked++;this.dispatchEvent({type:'click'});}
 scrollIntoView(){this.scrolled++;}
 focus(){this.focused=true;}
 querySelector(sel){
  const find=selector=>{
   const matches=x=>{
    if(selector.startsWith('#'))return x.id===selector.slice(1);
    if(selector.startsWith('.'))return x.className.split(/\s+/).includes(selector.slice(1));
    const tagAttr=selector.match(/^([a-z]+)\[data-([a-z-]+)="([^"]+)"\]$/);
    if(tagAttr){const k=tagAttr[2].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
      return x.tagName.toLowerCase()===tagAttr[1]&&x.dataset[k]===tagAttr[3];}
    const attr=selector.match(/^\[data-([a-z-]+)="([^"]+)"\]$/);
    if(attr){const k=attr[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return x.dataset[k]===attr[2];}
    return x.tagName.toLowerCase()===selector.toLowerCase();
   };
   const walk=node=>{for(const ch of node.children){if(matches(ch))return ch;const deeper=walk(ch);if(deeper)return deeper;}return null;};
   return walk(this);
  };
  const segments=sel.trim().split(/\s+/);
  let el=this;for(const part of segments){el=el?.querySingle(part,find);if(!el)return null;}return el;
 }
 querySingle(part,find){return find(part);}
}
function build(pairStatus='VERBUNDEN'){
 const body=new Node('body'),panel=new Node('section','personalJarvis');
 body.append(panel);
 const hero=new Node('div','','jarvis-cinematic-hero');panel.append(hero);
 const badge=new Node('div','','jarvis-system-badge');badge.append(new Node('span'));hero.append(badge);
 const orb=new Node('button','personalJarvisOrbBtn');hero.append(orb);
 const voice=new Node('div','','jarvis-voice-console'),enabled=new Node('input','jvEnabled');
 voice.append(enabled);panel.append(voice);
 const pairing=new Node('div','','jarvis-device-pair'),jdpBadge=new Node('span','jdpBadge');jdpBadge.textContent=pairStatus;pairing.append(jdpBadge);panel.append(pairing);
 const stats=new Node('div','','jarvis-life-stats');panel.append(stats);
 const deck=new Node('div','','jarvis-command-deck');deck.append(new Node('button'));panel.append(deck);
 const form=new Node('form','jarvisLifeCommandForm');panel.append(form);
 const photoEntry=new Node('section','','jarvis-photo-entry'),photoInput=new Node('input','jarvisPhotoInput');
 photoEntry.append(photoInput);panel.append(photoEntry);
 const photoPanel=new Node('section','jarvisPhotoPanel');panel.append(photoPanel);
 const intelligence=new Node('section','jarvisIntelligence');
 const planTab=new Node('button');planTab.dataset.jbTab='plan';
 const brainTab=new Node('button');brainTab.dataset.jbTab='brain';intelligence.append(planTab,brainTab);
 panel.append(intelligence);
 const integration=new Node('details','','jarvis-integrations');panel.append(integration);
 const nav=new Node('nav','','bottom-nav'),privNav=new Node('button');
 privNav.dataset.target='personalPrivate';nav.append(privNav);body.append(nav);
 const privateHub=new Node('section','personalPrivate');
 const shoppingTab=new Node('button');shoppingTab.dataset.privateTab='shopping';
 privateHub.append(shoppingTab);body.append(privateHub);
 const document={
   body,createElement:tag=>new Node(tag),
   getElementById:id=>{
    const visit=n=>{if(n.id===id)return n;for(const ch of n.children){const v=visit(ch);if(v)return v;}return null;};
    return visit(body);
   },
   querySelector:s=>body.querySelector(s)
 };
 const listeners=new Map();
 const window={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};
 class MutationObserver{constructor(fn){this.fn=fn;}observe(){}}
 vm.runInNewContext(js,{window,document,MutationObserver,Event,console},{timeout:1200});
 const send=(name)=>{for(const fn of listeners.get(name)||[])fn();};
 return {body,panel,hero,voice,enabled,pairing,stats,deck,form,photoEntry,photoInput,photoPanel,intelligence,
  integration,planTab,brainTab,nav,privNav,shoppingTab,jdpBadge,document,send};
}
const app=build();
const q=app.document.getElementById('jarvisDashboardQuick');
const advanced=app.document.getElementById('jarvisDashAdvanced');
const more=app.document.getElementById('jarvisDashMore');
assert.ok(q&&advanced&&more,'New dashboard controls are interactive');
assert.ok(app.panel.classList.contains('jarvis-dashboard-ready'));
assert.equal(app.panel.children.indexOf(q),app.panel.children.indexOf(app.hero)+1,'Quick actions directly after Jarvis Orb');
assert.equal(app.panel.children.indexOf(app.form),app.panel.children.indexOf(q)+1,'Text commands remain prominent');
assert.equal(app.voice.parentNode,advanced,'Original voice element with listeners remains mounted');
assert.equal(app.pairing.parentNode,advanced,'Original Telegram pairing widget remains mounted');
assert.equal(app.deck.parentNode,more,'Existing quick commands still present');
assert.equal(app.photoPanel.parentNode,app.panel,'Editable photo draft stays in Jarvis');
assert.equal(app.integration.parentNode,app.panel,'Optional Obsidian integrations remain available');
const toggle=app.document.getElementById('jarvisDashVoiceToggle');
assert.equal(toggle.getAttribute('aria-checked'),'false','Respect disabled spoken answers');
toggle.click();
assert.equal(app.enabled.checked,true,'Quick control changes real Voice Control checkbox');
assert.equal(toggle.getAttribute('aria-checked'),'true');
assert.equal(app.enabled.listeners.get('change').length>=1,true);
const settings=app.document.getElementById('jarvisDashSettingsLink');settings.click();
assert.equal(advanced.open,true,'Real Voice Control and pairing accessible');
const findCard=(id)=>q.children.flatMap(n=>n.children).find(n=>n.dataset.jarvisDashboard===id);
const plan=findCard('plan'),brain=findCard('brain'),shopping=findCard('shopping'),photo=findCard('photo');
assert.ok(plan&&brain&&shopping&&photo,'Four real quick actions');
plan.click();assert.equal(app.planTab.clicked,1);assert.equal(app.intelligence.scrolled,1);
brain.click();assert.equal(app.brainTab.clicked,1);
shopping.click();assert.equal(app.privNav.clicked,1);assert.equal(app.shoppingTab.clicked,1);
photo.click();assert.equal(app.photoInput.clicked,1,'iPhone photo input opens on shortcut');
const connectionLabel=app.hero.querySelector('.jarvis-system-badge span');
assert.equal(connectionLabel.textContent,'VERBUNDEN','Only show verified device connection');
assert.equal(app.hero.querySelector('.jarvis-system-badge').dataset.connected,'true');
assert.equal(app.document.getElementById('jarvisDashMicHint').textContent.includes('tippen'),true);
const disconnected=build('KOPPLUNG');
assert.equal(disconnected.document.getElementById('jarvisDashAdvanced').open,true,'Unpaired device exposes setup');
assert.equal(disconnected.hero.querySelector('.jarvis-system-badge span').textContent,'KOPPLUNG');
console.log('Jarvis dashboard: original nodes preserved, mic/voice, shopping, memory, planner, photo, pairing and responsive assets verified');
