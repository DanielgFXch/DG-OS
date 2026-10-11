#!/usr/bin/env node
'use strict';
/* Home mobile layout contract: checks source-of-truth IDs, real weather parser,
 * mobile temperature visibility, Jarvis interactions and safe PWA updates.
 * No external calls, packages or user credentials.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const html=read('index.html'),css=read('home-compact.css'),sw=read('sw.js'),weatherJs=read('weather.js');
const premium=read('premium-ui.css'),navigation=read('navigation.css');
assert.ok(html.includes('home-compact.css?v=1'),'Compact home CSS referenced');
assert.ok(sw.includes('home-compact.css?v=1'),'Compact home CSS precached in PWA');
assert.ok(sw.includes("dgos-personal-shell-50"),'New cache generation activates latest CSS');
assert.ok(html.indexOf('premium-ui.css?v=1.0.1')<html.indexOf('home-compact.css?v=1'),'Compact override loaded LAST');
for(const id of [
 'personalHome','personalGreeting','personalDate','dgHeroJarvis','homeOutfitOpen',
 'personalClock','personalCount','dgHomeOverview','dgOvTasks','dgOvAppointments',
 'weatherTemperature','weatherDescription','weatherFeels','weatherStatus',
 'weatherRefresh','weatherSunrise','weatherSunset','weatherDaylight'
]){
 assert.ok(html.includes('id="'+id+'"'),'Existing real weather / dashboard DOM binding kept: '+id);
}
assert.ok(html.includes('DEIN TAG · DEIN ÜBERBLICK'),'German dashboard caption');
assert.ok(html.includes('weatherTemperature">— °C</strong>'),'Never fake a temperature');
assert.ok(html.includes('class="quick-info-grid"'),'Weather grid remains reusable');
assert.ok(weatherJs.includes("root.DGOSWeatherRefresh=refresh"),'Refresh remains a real API action');
assert.ok(weatherJs.includes("values.temperature"),'Real temperature still reaches original DOM');
assert.ok(weatherJs.includes("window")||weatherJs.includes("root"),'Shared weather UI data contract');
assert.ok(navigation.includes('data-dgos-route="home"'),'Existing navigation remains');
assert.ok(premium.includes('ux-palette'),'Existing premium quick access remains');
assert.ok(css.includes('body[data-dgos-route="home"] #personalHome'),'Strict CSS scope to Home route');
assert.ok(!css.includes('https://'),'No new network endpoints');
assert.ok(!css.includes('url('),'No remote images or fonts');
assert.ok(css.includes('@media(max-width:700px)'),'Mobile first-screen design');
assert.ok(css.includes('@media(max-width:360px)'),'Small iPhone fallback');
assert.ok(css.includes('@media(max-width:1100px)'),'Tablet/desktop layout');
assert.ok(css.includes('prefers-reduced-motion'),'Reduced-motion support');
assert.ok(css.includes('grid-column:1/-1!important'),'Weather main tile spans full width on mobile');
assert.ok(css.includes('#weatherTemperature'),'True temperature has priority');
assert.ok(css.includes('font-size:clamp(27px,7.4vw,34px)!important'),'Temperature remains prominent');
assert.ok(css.includes('font-size:clamp(25px,7.2vw,32px)!important'),'Greeting reduced in mobile viewport');
assert.ok(css.includes('#dgHeroJarvis'),'Original functional Jarvis button is still compact');
const firstChildOverrides=[...css.matchAll(/\.quick-info-grid\s*>\s*div:first-child\s*\{([^}]+)\}/g)].map(x=>x[1]);
assert.ok(firstChildOverrides.some(rule=>/display:grid!important/.test(rule)),'Restore temperature tile hidden by old mobile styles');
assert.ok(css.includes('display:grid!important;')&&css.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important;'),'Mobile submetrics remain three-column');
assert.ok(css.includes('#dgHomeOverview .dg-overview-card'),'First-glance navigation cards compact');
const balanced=s=>(s.match(/\{/g)||[]).length===(s.match(/\}/g)||[]).length;
assert.ok(balanced(css),'Complete CSS blocks');
const {normalize}=require('../weather.js');
const now=Date.parse('2026-10-11T07:00:00Z');
const sample={
 timezone:'Europe/Zurich',
 current_units:{time:'unixtime',temperature_2m:'°C'},
 current:{temperature_2m:12.7,apparent_temperature:10.2,time:now/1000,weather_code:2,is_day:1},
 daily:{sunrise:[Date.parse('2026-10-11T05:37:00Z')/1000],sunset:[Date.parse('2026-10-11T16:45:00Z')/1000]}
};
const result=normalize(sample,now);
assert.equal(result.temperature,'13 °C','Frontend shows rounded temperature from live weather, never mock values');
assert.equal(result.feels,'Gefühlt 10 °C');
assert.equal(result.sunrise,'07:37');
assert.equal(result.sunset,'18:45');
assert.match(result.description,/Bewölkt/);
assert.throws(()=>normalize({...sample,current:{...sample.current,time:(now-2*3600*1000)/1000}},now),/stale|unavailable/i,'Stale observations must not appear as current');
console.log('DG OS compact Home: live temperature, CSS layout contracts, PWA assets, IDs, accessibility & freshness OK');
