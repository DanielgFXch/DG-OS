#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const {parseShoppingCommand:parse}=require('../jarvis-shopping-intent.js');
for(const [phrase, expected] of [
  ['Hey Jarvis brauche Toast Tomaten Käse',['Toast','Tomaten','Käse']],
  ['Hey Jarvis, ich brauche Toast, Tomaten und Käse',['Toast','Tomaten','Käse']],
  ['Hey Jarvis ich brauch noch Toast Tomaten Käse',['Toast','Tomaten','Käse']],
  ['Hey Jarvis ich brauche Milch Eier Brot',['Milch','Eier','Brot']],
  ['Jarvis, ich brauche Käse',['Käse']],
  ['Ich brauche noch Brot',['Brot']],
  ['Jarvis kauf Toast und Tomaten',['Toast','Tomaten']],
  ['Hey Jarvis, bitte schreib Milch, Eier und Brot auf die Einkaufsliste',['Milch','Eier','Brot']],
  ['Jarvis, bitte füge Milch, Eier auf die Einkaufsliste',['Milch','Eier']],
  ['Jarvis, Einkaufsliste: Brot, Milch und Käse',['Brot','Milch','Käse']],
  ['Jarvis brauche Käse Käse',['Käse']]
]){
  const actual=parse(phrase);
  assert.ok(actual, 'Did not detect '+phrase);
  assert.equal(actual.intent,'shopping_add','Wrong intent for '+phrase);
  assert.deepEqual(actual.items,expected,'Wrong groceries for '+phrase);
}
for(const phrase of [
  'Was brauche ich heute?', 'Hey Jarvis was brauche ich zum Kochen?',
  'Jarvis zeig meine Einkaufsliste', 'Jarvis öffne die Einkaufsliste',
  'Hey Jarvis ich brauche Hilfe', 'Hey Jarvis ich brauche einen Termin',
  'Jarvis brauche keine Tomaten', 'Jarvis was ist heute wichtig?',
  'Hey Jarvis bitte erzähl mir etwas über Toast',
  'Jarvis ich brauche Milch oder Käse',
  'Hey Jarvis ich will morgen mit Freunden essen gehen',
  'Jarvis ich brauche keine Milch und Käse'
]) {
  assert.equal(parse(phrase),null,'Should not save items from: '+phrase);
}
assert.equal(parse('Jarvis, füge irgendetwas total Ungenaues auf die Einkaufsliste').intent,'shopping_clarify');
const html=read('index.html'),client=read('personal.js'),backend=read('supabase/functions/jarvis-private/index.ts'),hub=read('private-hub.js');
assert.ok(html.includes('jarvis-shopping-intent.js?v=1'));
assert.ok(html.indexOf('jarvis-shopping-intent.js?v=1')<html.indexOf('personal.js?v=0.59.2'),'Parser must load before Jarvis');
assert.ok(html.includes('private-hub.js?v=2'));
assert.doesNotThrow(()=>new Function(read('jarvis-shopping-intent.js')));
assert.doesNotThrow(()=>new Function(client));
assert.doesNotThrow(()=>new Function(hub));
assert.ok(client.includes('window.DGShoppingIntent?.parseShoppingCommand(original)'));
assert.ok(client.includes("void addSpokenShopping(spokenShopping.items)"));
assert.ok(client.includes("source_ref:")===false,'Source reference should stay on server');
assert.ok(client.includes("dgos-private-updated"),'Update existing organizer and planner');
assert.ok(hub.includes("window.addEventListener('dgos-private-updated',load)"),'Private list should refresh immediately');
assert.ok(client.includes('SHOPPING_URL'));
assert.ok(client.includes("Authorization:'Bearer '+token"),'Paired device session required');
assert.ok(client.includes('shoppingInFlight'),'Repeat recognition should not submit in parallel');
assert.ok(client.includes("if (!res.ok)"),'Must report failed write accurately');
assert.ok(backend.includes('action === "add-shopping"'),'Must provide dedicated batch API');
assert.ok(backend.includes('owner = await authorized(req)'),'Every shopping write requires owner verification');
assert.ok(backend.includes('.eq("kind", "shopping").eq("status", "open")'),'Deduplicate against open list');
assert.ok(backend.includes('source: "voice"'),'Tag spoken writes');
assert.ok(backend.includes('source_ref: "jarvis:spoken-shopping"'),'Track write provenance');
assert.ok(backend.includes('Array.isArray(input)'),'Validate batch');
assert.ok(backend.includes('input.length > 12'),'Bound writes');
assert.ok(!client.includes('SUPABASE_SERVICE_ROLE_KEY')&&!client.includes('OPENAI_API_KEY'),'Never send secrets to browser');
console.log('Jarvis spoken shopping: parser, safety, server auth and existing-list integration tests passed');
