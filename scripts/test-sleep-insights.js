'use strict';
const assert=require('node:assert/strict');
const {summary,insights,duration,delta}=require('../sleep-insights.js');
const nights=[
 {start:'2026-10-10T01:56:25+02:00',end:'2026-10-10T09:11:09+02:00',durationHours:404/60,performance:81,efficiency:93,recovery:79,hrvMs:55,restingHeartRate:54},
 {start:'2026-10-09T02:10:00+02:00',end:'2026-10-09T08:10:00+02:00',durationHours:326/60,performance:72,efficiency:91,recovery:79,hrvMs:63,restingHeartRate:53}
];
assert.equal(duration(404),'6h 44m');
assert.equal(duration(null),'—');
assert.equal(delta(81,72,'Pkt.'),'+9 Pkt. zur letzten Nacht · besser');
assert.equal(delta(63,55,'ms',false),'+8 ms zur letzten Nacht · weniger günstig');
const result=summary(nights);
assert.equal(result.nights.length,2);
assert.equal(Math.round(result.week),365);
assert.equal(result.latest.performance,81);
assert.match(insights(result).join(' '),/78 Minuten länger/);
assert.equal(summary([]).latest,null);
assert.equal(summary([{durationHours:5}]).latest,null);
console.log('DG OS Sleep Intelligence: 10 checks passed');
