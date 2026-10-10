#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const bot=require('../jarvis-replies.js');
assert.equal(bot.joined(['Milch']),'Milch');
assert.equal(bot.joined(['Milch','Toast']),'Milch und Toast');
assert.equal(bot.joined(['Milch','Toast','Tomaten']),'Milch, Toast und Tomaten');
assert.equal(bot.shopping(['Milch','Toast'],[]),'Okay Gomes, Milch und Toast stehen jetzt auf deiner Einkaufsliste.');
assert.equal(bot.shopping(['Tomaten'],[]),'Okay Gomes, Tomaten steht jetzt auf deiner Einkaufsliste.');
assert.equal(bot.shopping([],['Milch','Toast']),'Okay Gomes, Milch und Toast stehen bereits auf deiner Einkaufsliste.');
assert.equal(bot.shopping(['Toast'],['Milch']),'Okay Gomes, Toast steht jetzt auf deiner Einkaufsliste. Milch war bereits eingetragen.');
assert.equal(bot.shopping([],[]),'Ich konnte keine neuen Produkte bestätigen. Bitte versuch es nochmals.');
assert.equal(bot.shopping(['Käse'],[],'Gomes'),'Okay Gomes, Käse steht jetzt auf deiner Einkaufsliste.');
assert.equal(bot.shopping(['Milch'],[],'<script>'),'Okay Gomes, Milch steht jetzt auf deiner Einkaufsliste.');
const html=read('index.html'),client=read('personal.js'),voice=read('jarvis-voice.js');
assert.match(html,/jarvis-replies\.js\?v=1/);
assert.match(html,/personal\.js\?v=0\.59\.6/);
assert.match(html,/jarvis-voice\.js\?v=10/);
assert.ok(html.indexOf('jarvis-replies.js?v=1')<html.indexOf('personal.js?v=0.59.6'),
  'Reply formatter must be available before Jarvis command handler');
assert.ok(client.includes('window.DGOSJarvisReplies?.shopping(added,skipped)'),
  'Use actual saved, deduplicated server results');
assert.ok(client.indexOf('if (!res.ok)')<client.indexOf('window.DGOSJarvisReplies?.shopping(added,skipped)'),
  'Never confirm a failed write');
assert.ok(client.includes("showReply(summary)"),'A final result must reach the TTS event');
assert.ok(voice.includes("window.addEventListener('dgos-jarvis-final-response'"));
assert.ok(voice.includes("lastCompleted=text"),'Keep last completed response for enabling TTS');
assert.ok(voice.includes("if(!enabled)"),'Preserve explicit opt-out');
assert.ok(voice.includes("if(lastCompleted&&!microphoneBusy)void speak(lastCompleted)"),
  'Checking spoken responses should speak the previous successful result');
assert.ok(voice.includes('Antwort als Text angezeigt. Aktiviere'),
  'Tell user why no voice is audible');
assert.ok(voice.includes('Antworten vorlesen · Jarvis spricht zurück'),
  'Readable owner control label');
assert.ok(voice.includes("if($('jvEnabled').checked)"),'Respect opt-in to automatic voice');
assert.ok(!voice.includes('new MutationObserver(()=>{\n    const text=reply.textContent'),
  'Never play intermediate microphone status');
assert.ok(read('sw.js').includes('dgos-personal-shell-39'));
assert.ok(read('sw.js').includes('jarvis-replies.js?v=1'));
assert.doesNotThrow(()=>new Function(read('jarvis-replies.js')));
assert.doesNotThrow(()=>new Function(client));
assert.doesNotThrow(()=>new Function(voice));
console.log('Conversational Jarvis: German confirmations, user voice opt-in, replay and secure final-response wiring passed');
