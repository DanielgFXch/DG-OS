'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const parse=require('../jarvis-bill-speech.js');
let b=parse.parse('Hey Jarvis, ich habe eine Rechnung von Sunrise über 89 Franken, fällig am 31. Oktober 2026');
assert.equal(b.intent,'bill_draft');assert.equal(b.title,'Rechnung Sunrise');
assert.equal(b.amount,'89.00');assert.equal(b.dueDate,'2026-10-31');
b=parse.parse('Jarvis ich habe eine Rechnung von Sunrise');
assert.equal(b.title,'Rechnung Sunrise');assert.equal(b.amount,'');assert.equal(b.dueDate,'');
assert.equal(parse.parse('Jarvis zeig mir meine offenen Rechnungen').intent,'bill_list');
assert.equal(parse.parse('Jarvis ich habe keine Rechnung von Sunrise'),null);
assert.equal(parse.parse('Jarvis, was ist eine Rechnung?'),null);
assert.equal(parse.dateFromText('29.02.2025'),'');
assert.equal(parse.dateFromText('29.02.2028'),'2028-02-29');
const html=read('index.html'),client=read('personal.js'),photo=read('jarvis-life-photo.js');
const ui=read('jarvis-bills.js'),style=read('jarvis-bills.css'),sw=read('sw.js');
const edge=read('supabase/functions/jarvis-bills/index.ts');
for(const v of ['jarvis-bill-speech.js?v=1','jarvis-bills.js?v=1','jarvis-bills.css?v=1','jarvis-life-photo.js?v=1','personal.js?v=0.59.12']){
 assert.ok(html.includes(v),'index '+v);assert.ok(sw.includes(v),'PWA '+v);
}
assert.ok(html.indexOf('jarvis-bill-speech.js?v=1')<html.indexOf('personal.js?v=0.59.12'));
for(const id of ['jarvisBills','jbBillDraft','jbBillTitle','jbBillAmount','jbBillCurrency','jbBillDue','jbBillSave','jbBillCancel','jbBillList']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Unique field '+id);
}
for(const code of [client,photo,ui])assert.doesNotThrow(()=>new Function(code));
assert.ok(client.includes('DGOSInvoiceSpeech?.parse(original)'));
assert.ok(client.includes("spokenInvoice?.intent==='bill_draft'"));
assert.ok(photo.includes("draft.kind==='invoice'"));
assert.ok(photo.includes('DGOSJarvisBills.showDraft'));
assert.ok(ui.includes("jbBillDraft').addEventListener('submit'"));
assert.ok(ui.includes('window.confirm('),'Paid status explicitly confirmed');
assert.ok(!ui.includes('innerHTML'));
assert.ok(edge.includes('dgos_device_sessions')&&edge.includes('dgos_telegram_config'));
assert.ok(edge.includes('ownerSession(req)'));
assert.ok(edge.includes('.eq("kind","bill")'));
assert.ok(!edge.includes('payInvoice('));
assert.ok(style.includes('@media(max-width:620px)'));
assert.equal((style.match(/{/g)||[]).length,(style.match(/}/g)||[]).length);
console.log('Jarvis voice + image invoice review, secure bill persistence and paid checks OK');
