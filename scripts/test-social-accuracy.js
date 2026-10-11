#!/usr/bin/env node
'use strict';
/* Social accuracy: imported Instagram relationship lists are NOT live.
 * No Instagram network calls, changes to follows, or external dependencies.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const js=read('social.js'),html=read('index.html'),css=read('social.css');
const edge=read('supabase/functions/social/index.ts');
const migration=read('supabase/migrations/20261011154000_social_verification_accuracy.sql');
assert.doesNotThrow(()=>new Function(js),'Social client must parse');
const start=js.indexOf('  function extractFromJson(value, kind) {');
const end=js.indexOf('  function extractFromHtml(text) {',start);
assert.ok(start>0 && end>start,'Instagram relationship parser must exist');
const cleanUsername=value=>{
 const text=String(value||'').trim().replace(/^@+/,'').toLowerCase();
 return /^[a-z0-9._]{1,30}$/.test(text)?text:'';
};
const extractUsernameFromUrl=input=>{
 try{const url=new URL(input);if(!/(^|\.)instagram\.com$/i.test(url.hostname))return '';
 const parts=url.pathname.split('/').filter(Boolean);
 return cleanUsername(parts[0]==='_u'?parts[1]:parts[0]);}catch{return '';}
};
const parse=new Function('cleanUsername','extractUsernameFromUrl',
  js.slice(start,end)+'\nreturn extractFromJson;')(cleanUsername,extractUsernameFromUrl);
// A single export entry can have different historical values after a rename.
// The old recursive parser incorrectly counted all aliases independently.
const following={relationships_following:[
 {title:'current_a',string_list_data:[{value:'old_a',href:'https://www.instagram.com/_u/even_older_a/',timestamp:1790000000}]},
 {title:'current_b',string_list_data:[{value:'current_b',href:'https://www.instagram.com/current_b/'}]},
 {title:'__deleted__foobar',string_list_data:[{value:'__deleted__foobar'}]}
]};
const out=parse(following,'following');
assert.deepEqual(out.usernames.sort(),['__deleted__foobar','current_a','current_b'].sort(),
 'One real relationship yields only one user, no multiple title/value/href records');
assert.equal(out.usernames.length,3);
assert.equal(out.disagreements,1);
const follower={relationships_followers:[
 {title:'visible_title',string_list_data:[{value:'real_follower',href:'https://www.instagram.com/real_follower/'}]}
]};
assert.deepEqual(parse(follower,'followers').usernames,['real_follower']);
assert.equal(parse([{string_list_data:[{value:'anon'}]}],'following').usernames.length,1);
for(const term of [
 "acc.decisions[username] !== 'not_following'",
 "const isDeletedPlaceholder",
 "decision === 'not_following'",
 "add('not_following','Folge ich nicht')",
 "socialDecisionNotFollowing",
 "socialExportWarning",
 "socialFollowingReference",
 "following-reference",
 "aliasConflicts"
]){
 assert.ok((js+html).includes(term),'Missing correction '+term);
}
for(const id of ['socialFollowingReference','socialFollowingReferenceSave','socialFollowingSource','socialExportWarning','socialDecisionNotFollowing']){
 assert.ok(html.includes('id="'+id+'"'),'UI must include '+id);
}
assert.ok(html.includes('social.js?v=0.61.2'));
assert.ok(html.includes('social.css?v=0.61.2'));
assert.ok(read('sw.js').includes('dgos-personal-shell-51'));
assert.ok(read('sw.js').includes('social.js?v=0.61.2'));
assert.ok(edge.includes('reported_following_count'),'Store owner count separately from source snapshot');
assert.ok(edge.includes('reported_following_at'),'Timestamp reported figures');
assert.ok(edge.includes('action==="following-reference"'),'Expose authenticated manual observation endpoint');
assert.ok(edge.includes('"not_following"'),'Allow false-positive decisions without registering unfollow');
assert.ok(edge.includes('old?.decision==="not_following"'),'Reimports preserve explicit disputed status');
assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS reported_following_count'),'Never overwrite historical export counts');
assert.ok(!migration.includes('DELETE FROM'),'Never destroy import history');
assert.ok(!migration.includes('DROP TABLE'),'Do not erase Instagram relationship data');
assert.ok(css.includes('social-export-warning'),'A real mismatch warning is visible');
assert.ok(!js.includes('instagram.com/graphql'),'No unauthorised scraping or fabricated live API');
console.log('DG OS Social accuracy: canonical export entries, immutable snapshots, count provenance, false positives and PWA checks OK');
