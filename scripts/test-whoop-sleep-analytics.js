#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=require('../whoop-sleep-analytics.js');
const sample=[
 ['2026-10-03',319,54,98,63,593,97],
 ['2026-10-08',438,79,121,114,553,94],
 ['2026-10-09',326,72,103,86,563,91],
 ['2026-10-10',404,81,110,137,592,93]
].map(r=>({sleep_date:r[0],duration_min:r[1],performance:r[2],deep_min:r[3],rem_min:r[4],needed_min:r[5],efficiency:r[6]}));
assert.equal(api.dayAdd('2026-10-10',-7),'2026-10-03');
assert.equal(api.dayAdd('2026-10-10',-1),'2026-10-09');
assert.equal(api.dayAdd('2026-03-01',-1),'2026-02-28');
assert.equal(api.duration(404),'6 Std. 44 Min.');
assert.equal(api.isSleepQuestion('Hey Jarvis, wie habe ich gestern geschlafen?'),true);
assert.equal(api.isSleepQuestion('Wie war meine Schlafqualität letzte Woche?'),true);
assert.equal(api.isSleepQuestion('Erinnere mich morgen ans Schlafen'),false);
assert.equal(api.isSleepQuestion('Brauche Toast und Milch'),false);
assert.equal(api.duration(0),'0 Std. 00 Min.');
assert.equal(api.integer('',100),null,'Missing WHOOP numbers should never silently become zero');
assert.equal(api.integer('81',100),81);
assert.equal(api.integer(400,100),null);
const a=api.compute(sample);
assert.equal(a.latest,'2026-10-10');
assert.equal(a.current.duration_min,404);
assert.equal(a.yesterday.duration_min,326);
assert.equal(a.lastWeek.duration_min,319);
assert.equal(a.current.performance,81);
assert.equal(a.current.deep_min,110);
assert.equal(a.current.rem_min,137);
assert.equal(a.week.length,3,'Missing 2026-10-04 must not be invented');
assert.ok(a.summary.includes('gestern'));
assert.ok(a.summary.includes('letzte Woche'));
assert.ok(a.summary.includes('Schlafbedarf'));
assert.ok(a.summary.includes('9 Prozentpunkte'),'Yesterday: 81% vs 72% = +9 p.p.');
assert.ok(a.summary.includes('+27 Prozentpunkte'),'Last week: 81% vs 54% = +27 p.p.');
assert.equal(api.compute(sample,'2026-10-07').current,null,'Missing day not replaced with nearest');
assert.equal(api.compute([],null).empty,true);
const fixture='Beginn des Schlafs,Beginn des Aufwachens,Zeitzone des Zyklus,Schlafdauer (Min.),Dauer des Tiefschlafs (Min.),Dauer des REM-Schlafs (Min.),Schlafbedarf (Min.),Schlafleistung %,Schlafeffizienz %,Nickerchen\n'+
 '2026-10-10 01:56:25,2026-10-10 09:11:09,UTC+02:00,404,110,137,592,81,93,false\n'+
 '2026-10-10 11:00:00,2026-10-10 11:40:00,UTC+02:00,40,0,0,592,8,90,true\n'+
 '2026-10-09 02:00:00,2026-10-09 07:40:00,UTC+02:00,326,103,86,563,72,91,false';
const parsed=api.parseWhoopCSV(fixture);
assert.equal(parsed.length,2,'Must ignore naps and dedupe dates');
assert.equal(parsed[1].sleep_date,'2026-10-10');
assert.equal(parsed[1].duration_min,404);
assert.equal(parsed[1].sleep_start,'2026-10-09T23:56:25.000Z','Respect export UTC offset');
assert.equal(parsed[1].performance,81);
assert.equal(api.parseWhoopCSV('\ufeff'+fixture).length,2);
assert.throws(()=>api.parseWhoopCSV('wrong,data\nfoo,bar'),/Schlaf.csv/);
const normalized=api.normalized([
 {...parsed[1],source:'export'}, {...parsed[1],source:'whoop_live',duration_min:405}
]);
assert.equal(normalized.length,1);
assert.equal(normalized[0].duration_min,405,'Latest live WHOOP should overwrite uploaded duplicate');
const html=read('index.html'),css=read('whoop-sleep.css'),ui=read('whoop-sleep-ui.js'),server=read('supabase/functions/whoop/index.ts');
for(const id of ['whoopSleepAnalysis','dgwSleepTitle','dgwSleepDuration','dgwSleepRange',
'dgwSleepPercent','dgwSleepBars','dgwVsYesterday','dgwVsLastWeek','dgwAverage7',
'dgwDeep','dgwRem','dgwEfficiency','dgwSleepNotice','dgwWhoopImportFile']){
  assert.ok(html.includes('id="'+id+'"'),'Missing health ID '+id);
}
assert.ok(html.includes('whoop-sleep.css?v=1'));
assert.ok(html.includes('whoop-sleep-analytics.js?v=1'));
assert.ok(html.includes('whoop-sleep-ui.js?v=2'));
assert.ok(read('whoop-sleep-ui.js').includes('dgos-whoop-history-loaded'),'Historical sleep is available in the overview without live WHOOP authorization');
assert.ok(html.includes('personal.js?v=0.59.11'));
assert.ok(html.indexOf('personal.js?v=0.59.11')<html.indexOf('whoop-sleep-ui.js?v=2'));
assert.ok(html.indexOf('whoop-sleep-analytics.js?v=1')<html.indexOf('whoop-sleep-ui.js?v=2'));
assert.ok(ui.includes("dgos-whoop-updated"));
assert.ok(ui.includes('window.DGOSWhoopSleepUI={refresh,answerQuestion}'));
assert.ok(read('personal.js').includes('DGOSWhoopSleepUI?.answerQuestion(original)'));

assert.ok(read('personal.js').includes("new CustomEvent('dgos-whoop-updated'"));
assert.ok(read('personal.js').includes("'Schlafdauer '+fmtHours(sleep.durationHours)"));
assert.ok(ui.includes("dgwWhoopImportFile"));
assert.ok(ui.includes("DecompressionStream('deflate-raw')"));
assert.ok(ui.includes('0x02014b50'),'ZIP must use central directory because exports have data descriptors');
assert.ok(ui.includes('aria-pressed'));
assert.ok(ui.includes("token=()=>"));
assert.ok(!ui.includes("localStorage.setItem("),'Health data must not be stored in localStorage');
assert.ok(!ui.includes('innerHTML'),'Avoid dynamic HTML injection from export');
assert.ok(!ui.includes('apiKey')&&!ui.includes('SERVICE_ROLE_KEY'));
assert.ok(server.includes('if(action==="history")'));
assert.ok(server.includes('if(action==="history-import")'));
assert.ok(server.includes('await validSession(req)'),'Only signed WHOOP owner sessions');
assert.ok(server.includes('history_import_failed')||server.includes('whoop_history_import_failed'));
assert.ok(server.includes('source:"whoop_live"'),'Future sleeps saved automatically');
assert.ok(server.includes('.upsert(record,{onConflict:"sleep_date"})'));
assert.ok(server.includes('if(origin!==ALLOWED_ORIGIN)'));
assert.ok(read('supabase/migrations/20261010233000_whoop_sleep_history.sql').includes('ROW LEVEL SECURITY'));
assert.ok(read('supabase/migrations/20261010233000_whoop_sleep_history.sql').includes('REVOKE ALL'));
assert.ok(read('sw.js').includes('dgos-personal-shell-48'));
assert.ok(read('sw.js').includes('whoop-sleep-analytics.js?v=1'));
assert.ok(css.includes('@media(max-width:600px)'));
assert.ok(css.includes('conic-gradient'));
assert.doesNotThrow(()=>new Function(ui));
assert.doesNotThrow(()=>new Function(read('personal.js')));
console.log('WHOOP German sleep history: actual export parser, day/week comparisons, protected APIs, mobile rings and privacy checks passed');
