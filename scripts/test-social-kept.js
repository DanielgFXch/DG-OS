#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const html=read('index.html');
const client=read('social.js');
const css=read('social.css');
const edge=read('supabase/functions/social/index.ts');
assert.doesNotThrow(()=>new Function(client),'Browser JS syntax');
for(const id of ['socialKeptSection','socialKeptTitle','socialKeptCount','socialKeptSearch',
  'socialKeptRefresh','socialKeptList','socialKeptStatus']) {
  assert.ok(html.includes('id="'+id+'"'),'Missing kept UI '+id);
}
assert.match(html,/social\.js\?v=0\.61\.1/,'Client cache bust');
assert.match(html,/social\.css\?v=0\.61\.1/,'Style cache bust');
assert.ok(client.includes('function keptUsernames('));
assert.ok(client.includes('function renderKeptAccounts('));
assert.ok(client.includes('async function loadKeptAccounts('));
assert.ok(client.includes('async function undoKeptAccount('));
assert.ok(client.includes("state.accounts[key]"),'Accounts must remain independent');
assert.ok(client.includes('accountKey'), 'Cloud lookups must be scoped to Instagram account');
assert.ok(client.includes("actionButton.dataset.socialKeptAction === 'undo'"));
assert.ok(client.includes('renderKeptAccounts();'),'Kept results must refresh');
assert.ok(client.includes("filter(([username, decision]) => followingSet.has(username) || decision === 'keep')"),
  'Reimports must not remove kept decisions');
assert.ok(client.includes('cloudKept'), 'Cloud-backfilled historical decisions must render');
assert.ok(client.includes('window.open('), 'Direct Instagram link must be available');
assert.ok(!/OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(client), 'Never add secrets to public client');
assert.ok(css.includes('@media(max-width:650px)'), 'Mobile display must be responsive');
assert.ok(edge.includes('req.method==="GET" && action==="kept"'));
assert.ok(edge.includes('.eq("account_key",accountKey).eq("decision","keep")'));
assert.ok(edge.includes('old?.decision==="keep"'), 'Server reimports must preserve stored keeps');
assert.ok(edge.includes('await authorized(req)'), 'Server must require paired device');
assert.ok(edge.includes('cleanAccount(url.searchParams.get("accountKey"))'),'Account scope required');
console.log('Social kept accounts integration and privacy checks passed');
