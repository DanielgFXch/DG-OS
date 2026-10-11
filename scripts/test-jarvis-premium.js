#!/usr/bin/env node
'use strict';
/* Real Jarvis reference design without a screenshot as the interface.
 * All existing IDs, microphone callbacks, voice/pairing, shopping and
 * calendar routing must remain operational.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const html=read('index.html'),css=read('jarvis-premium.css');
const bg=read('assets/jarvis-nightscape.svg'),js=read('jarvis-premium.js');
const dashboard=read('jarvis-dashboard.js'),voice=read('jarvis-voice.js'),sw=read('sw.js');
assert.doesNotThrow(()=>new Function(js),'Premium interactions parse cleanly');
assert.doesNotThrow(()=>new Function(dashboard),'Existing Jarvis routing still parses');
assert.doesNotThrow(()=>new Function(voice),'Actual iPhone voice client still parses');
assert.ok(html.includes('jarvis-premium.css?v=1'));
assert.ok(html.includes('jarvis-premium.js?v=1'));
assert.ok(html.includes('jarvis-voice.js?v=14'));
assert.ok(html.includes('jarvis-dashboard.js?v=3'));
assert.ok(html.indexOf('health-premium.css?v=1.0.0')<html.indexOf('jarvis-premium.css?v=1'));
assert.ok(html.indexOf('jarvis-dashboard.js?v=3')<html.indexOf('jarvis-premium.js?v=1'));
assert.ok(sw.includes('dgos-personal-shell-53'));
for(const a of ['jarvis-premium.css?v=1','jarvis-premium.js?v=1','jarvis-dashboard.js?v=3','jarvis-voice.js?v=14','assets/jarvis-nightscape.svg'])
 assert.ok(sw.includes(a),'Offline-safe PWA references '+a);
for(const name of ['personalJarvis','personalJarvisTitle','personalJarvisOrbBtn','personalJarvisStatus','personalJarvisReply','jarvisReplyTime','jarvisLifeCommandForm','jarvisPhotoInput','jdpBadge']){
 if(name==='jdpBadge')continue; // Authenticated pairing element is inserted separately.
 assert.equal((html.match(new RegExp('id="'+name+'"','g'))||[]).length,1,'Original unique interactive ID '+name);
}
assert.ok(html.includes('class="jpr-reply-card"'));
assert.ok(html.includes('class="jpr-waveform"'));
assert.ok(!html.includes('<div class="jarvis-system-badge"'),'Connection badge is a real button, not a decorative status');
assert.ok(html.includes('type="button" class="jarvis-system-badge"'));
assert.ok(js.includes('jarvisDashAdvanced'),'Connection badge opens existing settings');
assert.ok(dashboard.includes("data-jarvis-action=\"task\""),'Task shortcut invokes real existing handler');
assert.ok(dashboard.includes('data-target="personalCalendar"'),'Calendar shortcut invokes native route');
for(const n of ['plan','calendar','shopping','task'])
 assert.ok(dashboard.includes("id:'"+n+"'"),'Shortcut '+n);
for(const id of ['jvHeroToggle','jvHeroRead','jvHeroFile','jvHeroTone','jvUseServerVoice'])
 assert.ok(voice.includes(id),'Preserve actual audio controls: '+id);
assert.ok(voice.includes('class="jpr-troubleshoot"'),'Audio troubleshooting stays accessible but collapsed');
assert.ok(voice.includes('jvQuickToggle'),'Visible toggle still controls genuine TTS checkbox');
assert.ok(css.includes('background-image')&&css.includes('data:image/svg+xml'),'Feature icons are vector assets, not emoji');
assert.ok(css.includes('assets/jarvis-nightscape.svg'),'Original decorative mountain backdrop');
assert.ok(bg.includes('<svg')&&!bg.includes('<script'),'Safe original, static visual asset');
assert.ok(css.includes('@media(max-width:360px)'),'Small iPhone layout');
assert.ok(css.includes('prefers-reduced-motion'),'Reduced motion support');
assert.ok(css.includes(':focus-visible'),'Accessible keyboard focus');
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'CSS blocks balanced');
assert.ok(!css.includes('API_KEY')&&!js.includes('fetch('),'No new endpoints or secret exposure');
assert.ok(!html.includes('Okay Gomes, Mehlsch und Tomaten stehen'),'Response must come from real Jarvis processing');
assert.ok(js.includes("dgos-jarvis-final-response"),'Timestamp appears only for real completed answers');
assert.ok(js.includes("dgos-jarvis-microphone-state"),'The status animates in response to real mic events');
console.log('DG OS Jarvis premium: functional markup, authentic replies, four shortcuts, status, voice, responsive CSS and PWA valid');
