#!/usr/bin/env node
'use strict';
// DG OS premium UI: isolated, dependency-free contract and real interaction tests.
// Never starts backend services or uses user API credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=load('index.html'), css=load('premium-ui.css'), js=load('premium-ui.js'), sw=load('sw.js');
assert.doesNotThrow(()=>new Function(js),'Client JS must parse');
for(const name of ['personalHome','personalTasks','personalCalendar','personalHealth','personalPrivate','personalSocial',
 'whoopSleepAnalysis','personalJarvis','personalJarvisOrbBtn','jarvisLifeCommandForm','jarvisLifeCommandInput','tradingWorkspace']){
 assert.ok(html.includes('id="'+name+'"'),'Do not remove original JS hooks: '+name);
}
for(const item of ['premium-ui.css?v=1.0.0','premium-ui.js?v=1.0.0']){
 assert.ok(html.includes(item),'New UI asset linked in index: '+item);
 assert.ok(sw.includes(item),'New UI asset available offline: '+item);
}
assert.ok(html.indexOf('jarvis-weather.css?v=1') < html.indexOf('premium-ui.css?v=1.0.0'),'Design system must be the last stylesheet');
assert.ok(html.indexOf('navigation.js?v=0.60.1') < html.indexOf('premium-ui.js?v=1.0.0'),'Route engine must initialise before quick access');
assert.ok(css.includes('@media(max-width:700px)'),'Mobile design must be explicit');
assert.ok(css.includes('@media(max-width:390px)'),'Small iPhone sizes must be handled');
assert.ok(css.includes('prefers-reduced-motion'),'Motion must respect accessibility');
assert.ok(css.includes(':focus-visible'),'Keyboard focus must be visible');
assert.ok(css.includes('ux-palette-item[data-active="true"]'),'Keyboard selection has CSS feedback');
assert.ok(css.includes('.bottom-nav .ux-more-button'),'Additional navigation must be accessible on mobile');
const balance = s => (s.match(/{/g)||[]).length === (s.match(/}/g)||[]).length;
assert.ok(balance(css),'CSS declaration blocks must be balanced');
for(const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','sk-proj-','innerHTML =','localStorage.setItem','fetch(','XMLHttpRequest']){
 assert.ok(!js.includes(forbidden),'UI script must not contain unsafe data logic: '+forbidden);
}
class Element {
 constructor(tag, doc){
  this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.className='';this.dataset={};
  this.attrs={};this.listeners={};this.value='';this.textContent='';this.open=false;this.isConnected=true;
  this.scrolls=0;this.clicks=0;
  this.classList={
   toggle:(name,enabled)=>{const words=new Set(this.className.split(/\s+/).filter(Boolean));if(enabled===undefined? !words.has(name):enabled)words.add(name);else words.delete(name);this.className=[...words].join(' ');},
   contains:name=>this.className.split(/\s+/).includes(name)
  };
 }
 append(...items){this.children.push(...items);return this}
 prepend(...items){this.children.unshift(...items);return this}
 setAttribute(k,v){this.attrs[k]=v}
 removeAttribute(k){delete this.attrs[k]}
 getAttribute(k){return this.attrs[k]}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 fire(k,event={}){for(const fn of this.listeners[k]||[]) fn(event)}
 click(){this.clicks++;this.fire('click',{target:this,preventDefault(){}})}
 focus(){this.doc.activeElement=this}
 showModal(){this.open=true}
 close(){this.open=false;this.fire('close')}
 getBoundingClientRect(){return {left:0,right:500,top:0,bottom:500}}
 getClientRects(){return [1]}
 scrollIntoView(){this.scrolls++}
 replaceChildren(...nodes){this.children=nodes}
 querySelectorAll(s){return s==='.ux-palette-item'? this.children.filter(c=>c.className.includes('ux-palette-item')):[]}
}
const doc={listeners:{},activeElement:null,
 createElement(tag){return new Element(tag,this)},
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)},
 fire(type,event){for(const fn of this.listeners[type]||[])fn(event)}
};
doc.body=new Element('body',doc);doc.body.dataset.dgosRoute='home';
const header=new Element('div',doc), dock=new Element('nav',doc);
const targetIds=['personalHome','personalTasks','personalCalendar','personalHealth','personalPrivate','personalSocial',
'tradingWorkspace','whoopSleepAnalysis','jarvisDashSettingsLink'];
const nodes=Object.fromEntries(targetIds.map(id=>[id,new Element('section',doc)]));
nodes.jarvisDashSettingsLink.click=function(){this.clicks++};
const routeByTarget={personalHome:'home',personalJarvis:'jarvis',personalPrivate:'private',
 personalCalendar:'calendar',personalHealth:'health',personalSocial:'social',tradingWorkspace:'trading'};
const nav=Object.fromEntries(Object.keys(routeByTarget).map(target=>{
 const button=new Element('button',doc);
 button.dataset.target=target;button.click=function(){this.clicks++;doc.body.dataset.dgosRoute=routeByTarget[target]};
 dock.append(button);return [target,button];
}));
doc.getElementById=id=>{
 if(id==='uxQuickPalette')return doc.body.children.find(c=>c.id===id)||null;
 return nodes[id] || null;
};
doc.querySelector=query=>{
 if(query==='.topbar-meta')return header;
 if(query==='.bottom-nav')return dock;
 const match=query.match(/^\.bottom-nav button\[data-target="([^"]+)"\]$/);
 if(match)return nav[match[1]]||null;
 if(query==='[data-private-tab="shopping"]')return nodes.shopping || null;
 return null;
};
nodes.shopping=new Element('button',doc);
const sandbox={
 document:doc,
 HTMLDialogElement:function(){},
 MutationObserver:class{observe(){}},
 requestAnimationFrame:cb=>cb(),
 window:{},
 console
};
vm.runInNewContext(js,sandbox,{filename:'premium-ui.js'});
assert.equal(header.children.length,1,'Search trigger should be added to the header');
const trigger=header.children[0], more=dock.children.at(-1), dialog=doc.getElementById('uxQuickPalette');
assert.equal(more.textContent,'Mehr');
assert.ok(dialog,'Native dialog should be appended');
const search=dialog.children[0].children[1],list=dialog.children[2];
trigger.click();
assert.equal(dialog.open,true,'Header trigger opens quick access');
assert.equal(list.children.length,11,'All genuine destinations should be available');
search.value='schlafanalyse';search.fire('input');
assert.equal(list.children.length,1,'Search filters by German label');
dialog.fire('keydown',{key:'Enter',preventDefault(){},isComposing:false});
assert.equal(dialog.open,false);
assert.equal(doc.body.dataset.dgosRoute,'health','Schlafanalyse opens Gesundheit');
assert.equal(nodes.whoopSleepAnalysis.scrolls,1,'WHOOP real section receives focus scroll');
more.click();
search.value='einkauf';search.fire('input');
dialog.fire('keydown',{key:'Enter',preventDefault(){},isComposing:false});
assert.equal(doc.body.dataset.dgosRoute,'private','Shopping opens Privat screen');
assert.equal(nodes.shopping.clicks,1,'Shopping activates the original existing tab');
doc.fire('keydown',{metaKey:true,ctrlKey:false,key:'k',preventDefault(){}});
assert.equal(dialog.open,true,'Cmd+K opens the palette');
doc.fire('keydown',{metaKey:true,ctrlKey:false,key:'k',preventDefault(){}});
assert.equal(dialog.open,false,'Cmd+K closes the palette');
trigger.click();
search.value='aufgaben';search.fire('input');
dialog.fire('keydown',{key:'Enter',preventDefault(){},isComposing:false});
assert.equal(doc.body.dataset.dgosRoute,'home','Task action navigates to Today');
assert.equal(nodes.personalTasks.scrolls,1,'Task action scrolls to original task panel');
console.log('DG OS premium UI: assets, no-secrets, responsive contracts and live quick-navigation interactions OK');
