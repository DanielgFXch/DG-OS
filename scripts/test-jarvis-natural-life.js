#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const shopping=require('../jarvis-shopping-intent.js').parseShoppingCommand;
const life=require('../jarvis-life-intent.js');
const fixed=new Date('2026-10-10T14:00:00Z'); // Saturday Zurich
for(const [phrase,items] of [
 ['Hey ich brauche Toast Tomaten Käse',['Toast','Tomaten','Käse']],
 ['Hey, ich brauche Toast, Tomaten und Milch',['Toast','Tomaten','Milch']],
 ['Bitte in die Einkaufsliste Tomaten Toast Milch',['Tomaten','Toast','Milch']],
 ['Bitte Tomaten Toast Milch in die Einkaufsliste',['Tomaten','Toast','Milch']],
 ['Jarvis, ich brauche noch Brot',['Brot']],
 ['Hey Jarvis bitte in die Einkaufsliste Toast und Tomaten',['Toast','Tomaten']],
 ['Auf die Einkaufsliste: Milch, Käse',['Milch','Käse']],
 ['Ich brauche Milch Eier Brot',['Milch','Eier','Brot']],
 ['Ich brauche Käse',['Käse']],
 ['Jarvis bitte füge Wasser und Käse auf die Einkaufsliste',['Wasser','Käse']]
]){
 const result=shopping(phrase);
 assert.ok(result,'No shopping intent: '+phrase);
 assert.equal(result.intent,'shopping_add');
 assert.deepEqual(result.items,items,phrase);
}
for(const phrase of [
 'Hey Jarvis, ich brauche keine Milch', 'Ich muss nächste Woche Milch kaufen',
 'Ich muss nächste Woche Rechnung zahlen', 'Was brauche ich heute?', 'Hey Jarvis ich brauche Hilfe',
 'Zeig meine Einkaufsliste', 'Bitte zeig mir meine Einkaufsliste',
 'Wie viel Käse habe ich?', 'Brauche ich Tomaten?',
 'Bitte morgen Toast kaufen', 'Bitte Rechnung bezahlen', 'Milch nicht kaufen'
]){
 const result=shopping(phrase);
 assert.ok(!result||result.intent!=='shopping_add','Unsafe shopping write for '+phrase);
}
for(const [phrase,title,date,kind] of [
 ['Hey Jarvis ich muss nächste Woche die Rechnung bezahlen','Rechnung bezahlen','2026-10-12','payment_reminder'],
 ['Ich muss nächste Woche Tomaten kaufen','Tomaten kaufen','2026-10-12','purchase_reminder'],
 ['Hey ich muss nächste Woche Toast kaufen','Toast kaufen','2026-10-12','purchase_reminder'],
 ['Jarvis, ich muss morgen Zahnarzt anrufen','Zahnarzt anrufen','2026-10-11','task'],
 ['Ich muss übermorgen Post abholen','Post abholen','2026-10-12','task'],
 ['Ich muss nächste Woche Freitag Rechnung zahlen','Rechnung zahlen','2026-10-16','payment_reminder'],
 ['Ich muss heute Rechnung bezahlen','Rechnung bezahlen','2026-10-10','payment_reminder']
]){
 const result=life.parseScheduledCommand(phrase,fixed);
 assert.ok(result&&result.intent==='task_create','Scheduled task missing for: '+phrase+': '+JSON.stringify(result));
 assert.equal(result.title,title,phrase);
 assert.equal(result.dueDate,date,phrase);
 assert.equal(result.kind,kind,phrase);
}
for(const phrase of [
 'Hey Jarvis ich muss das nächste Woche zahlen',
 'Ich muss das nächste Woche kaufen',
 'Ich muss nächste Woche etwas machen',
 'Was muss ich nächste Woche bezahlen?'
]){
 const r=life.parseScheduledCommand(phrase,fixed);
 assert.ok(!r||r.intent!=='task_create','Must clarify unknown object: '+phrase);
}
for(const phrase of [
 'Ich muss nächste Woche keine Rechnung bezahlen',
 'Ich möchte vielleicht morgen Brot kaufen',
 'Wie viele Rechnungen muss ich morgen bezahlen?',
 'Nächste Woche ist Urlaub',
 'Bitte zeig meine Termine'
]){
 assert.equal(life.parseScheduledCommand(phrase,fixed),null,'Should not schedule: '+phrase);
}
assert.equal(life.todayZurich(fixed),'2026-10-10');
assert.equal(life.dueDate('nächste Woche',fixed).date,'2026-10-12');
assert.equal(life.dueDate('nächste Woche Dienstag',fixed).date,'2026-10-13');
assert.equal(life.dueDate('übernächste Woche',fixed).date,'2026-10-19');
assert.deepEqual(life.parsePhotoReference('Hey Jarvis ich muss das nächste Woche zahlen',fixed),
 {intent:'photo_reference',kind:'payment_reminder',dueDate:'2026-10-12',dateLabel:'Montag nächste Woche'});
assert.equal(life.parsePhotoReference('Was steht auf der Rechnung?',fixed),null);
const html=read('index.html'),client=read('personal.js'),photo=read('jarvis-life-photo.js');
const brain=read('jarvis-brain.js'),edge=read('supabase/functions/jarvis-private/index.ts');
for(const id of ['jarvisPhotoPick','jarvisPhotoInput','jarvisPhotoPanel','jarvisPhotoKind',
 'jarvisPhotoTitle','jarvisPhotoDate','jarvisPhotoSave','jarvisPhotoCancel',
 'jarvisPhotoItems','jarvisPhotoMore','jarvisPhotoNotice']){
 assert.ok(html.includes('id="'+id+'"'),'Missing photo UI '+id);
}
assert.match(html,/jarvis-shopping-intent\.js\?v=2/);
assert.match(html,/jarvis-life-intent\.js\?v=1/);
assert.match(html,/jarvis-life-photo\.js\?v=1/);
assert.match(html,/personal\.js\?v=0\.59\.5/);
assert.match(html,/jarvis-brain\.js\?v=3/);
assert.match(html,/jarvis-life-photo\.css\?v=1/);
assert.ok(html.indexOf('jarvis-life-intent.js?v=1')<html.indexOf('personal.js?v=0.59.5'));
assert.doesNotThrow(()=>new Function(client));
assert.doesNotThrow(()=>new Function(photo));
assert.doesNotThrow(()=>new Function(read('jarvis-life-intent.js')));
assert.ok(client.includes('window.DGOSLifeIntent?.parseScheduledCommand(original)'));
assert.ok(client.includes('window.DGOSJarvisPhoto?.handleVoiceCommand(original)'));
assert.ok(client.includes('/functions/v1/tasks/create'));
assert.ok(client.includes("void saveScheduledTask(planned)"));
assert.ok(client.includes('scheduledTaskInFlight'));
assert.ok(client.includes("dgos-jarvis-tasks-updated"));
assert.ok(brain.includes("dgos-jarvis-tasks-updated"));
assert.ok(photo.includes('window.DGOSJarvisPhoto='));
assert.ok(photo.includes('handleVoiceCommand'));
assert.ok(photo.includes('if(!pending)return false'));
assert.ok(photo.includes("window.confirm(")===false,'Photo uses explicit Save confirmation button, not browser alert');
assert.ok(photo.includes("id")===true);
assert.ok(photo.includes("taskApi"));
assert.ok(photo.includes("groceryApi"));
assert.ok(photo.includes("photoUrl"));
assert.ok(photo.includes("window.dispatchEvent(new Event('dgos-private-updated'))"));
assert.ok(edge.includes('action === "analyze-photo"'));
assert.ok(edge.includes('owner = await authorized(req)'));
assert.ok(edge.includes('Nothing is saved')||edge.includes('NOTHING is saved'));
assert.ok(edge.includes('cooldown(owner + ":life-photo", 12000)'));
assert.ok(edge.includes('image_url: image'));
assert.ok(edge.includes('data:image'));
assert.ok(!photo.includes('OPENAI_API_KEY')&&!photo.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert.ok(!photo.includes('innerHTML'));
assert.ok(!client.includes('tradeOrder'));
console.log('Jarvis natural shopping, scheduled task, Zurich dates, photo consent and write-safety checks passed');
