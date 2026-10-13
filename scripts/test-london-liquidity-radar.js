'use strict';
/* DG OS London Liquidity Radar: verify closed H1 candles / no repaint or fake signal. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const intel=require('../trading-intelligence.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const day='2026-10-09';
function source(){
 const result=[];
 for(let hour=0;hour<22;hour++){
   const asia=hour<8, london=hour>=8&&hour<16;
   result.push({datetime:day+' '+String(hour).padStart(2,'0')+':00:00',
     open:100,close:100,high:asia?101:london?103:102,low:asia?99:london?97:98});
 }
 return result;
}
const compute=(series,now='2026-10-10T00:30:00Z')=>intel.computeSessionIntelligence({
  candlesByTimeframe:{'1h':{series}},now:new Date(now),source:'TEST ONLY'
});
const baseline=compute(source());
const baselineLondon=baseline.londonLiquidity;
assert.equal(baselineLondon.status,'FIXED');
assert.equal(baselineLondon.high,103);
assert.equal(baselineLondon.low,97);
assert.equal(baselineLondon.rangeFinal,true);
assert.equal(baselineLondon.observedLondonCandles,8);
assert.equal(baselineLondon.observedNYCandlesAfterClose,5,'NY overlap 13-15 must not be treated as after London close');
assert.equal(baselineLondon.highSweep.state,'OPEN');
assert.equal(baselineLondon.lowSweep.state,'OPEN');
assert.equal(baseline.disclaimer.includes('Trading-Signal'),true);
const taken=source();
taken[16]={...taken[16],high:104,close:103.5,open:100,low:98};
taken[17]={...taken[17],high:104,close:103.8,open:103.5,low:103.2};
for(let hour=18;hour<=20;hour++)taken[hour]={...taken[hour],open:103.8,close:103.8,high:104,low:103.2};
const takenResult=compute(taken);
assert.equal(takenResult.londonLiquidity.highSweep.state,'TAKEN_NO_RETURN','Wick crossing with no H1 return is only TAKEN');
assert.equal(takenResult.londonLiquidity.highSweep.returnedAt,null);
assert.equal(takenResult.londonLiquidity.highSweep.at,'2026-10-09T16:00:00.000Z');
const reversal=source();
reversal[16]={...reversal[16],high:104,close:100};
const sweep=compute(reversal);
assert.equal(sweep.londonLiquidity.highSweep.state,'RETURN_INSIDE');
assert.equal(sweep.londonLiquidity.highSweep.extreme,104);
assert.equal(sweep.londonLiquidity.highSweep.returnedAt,'2026-10-09T16:00:00.000Z');
const lows=source();
lows[17]={...lows[17],low:96,close:100};
assert.equal(compute(lows).londonLiquidity.lowSweep.state,'RETURN_INSIDE');
assert.equal(compute(lows).londonLiquidity.highSweep.state,'OPEN');
const double=source();
double[16]={...double[16],high:105,low:96,close:100};
const ambiguous=compute(double).londonLiquidity;
assert.equal(ambiguous.sequence,'UNKNOWN_SAME_H1_CANDLE');
assert.equal(ambiguous.highSweep.state,'RETURN_INSIDE');
assert.equal(ambiguous.lowSweep.state,'RETURN_INSIDE');
const overlap=source();
overlap[14]={...overlap[14],high:105,close:100};
const overlapping=compute(overlap).londonLiquidity;
assert.equal(overlapping.high,105,'High can still form in 13-16 UTC overlap');
assert.equal(overlapping.highSweep.state,'OPEN','A London high cannot sweep itself during formation');
const incomplete=source().filter(row=>!row.datetime.endsWith('15:00:00'));
const forming=compute(incomplete).londonLiquidity;
assert.equal(forming.status,'FORMING');
assert.equal(forming.highSweep,null,'Never claim fixed London level without all 8 H1 candles');
assert.equal(forming.lowSweep,null);
const inProgress=source();
inProgress[16]={...inProgress[16],high:110,close:100};
const beforeClose=compute(inProgress,'2026-10-09T16:30:00Z').londonLiquidity;
assert.equal(beforeClose.status,'FIXED');
assert.equal(beforeClose.observedNYCandlesAfterClose,0,'Partial NY candle is not evidence');
assert.equal(beforeClose.highSweep.state,'OPEN');
const noAsia=source().filter(row=>!row.datetime.includes(' 02:'));
assert.equal(compute(noAsia).londonLiquidity,null,'No Asia confirmation means no derived London radar for now');
const stale=compute(source(),'2026-10-20T00:00:00Z');
assert.equal(stale.status,'HISTORICAL');
assert.equal(stale.londonLiquidity.status,'FIXED');
const html=read('index.html');
for(const id of ['dgLondonRadar','dgLondonRadarTitle','dgLondonRadarState','dgLondonRadarHigh',
  'dgLondonRadarHighState','dgLondonRadarLow','dgLondonRadarLowState','dgLondonRadarContext','dgLondonRadarSource']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Radar UI ID appears exactly once: '+id);
}
const css=read('trading-london-radar.css');
const ui=read('trading-intelligence-ui.js');
assert.doesNotThrow(()=>new Function(ui));
assert.match(html,/trading-intelligence\.js\?v=2/);
assert.match(html,/trading-intelligence-ui\.js\?v=2/);
assert.ok(html.indexOf('trading-london-radar.css?v=1')<html.indexOf('dg-unified-premium.css?v=1'),'Shared design system still last');
assert.ok(read('sw.js').includes('trading-london-radar.css?v=1'));
assert.ok(read('sw.js').includes('trading-intelligence.js?v=2'));
assert.ok(ui.includes('renderLondonRadar(data)'));
assert.ok(css.includes('@media(max-width:700px)'));
assert.ok(css.includes('prefers-reduced-motion'));
assert.ok(!ui.includes('innerHTML')&&!ui.includes('BUY_READY')&&!ui.includes('SELL_READY'));
assert.ok(!read('trading-intelligence.js').includes('Math.random'));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
console.log('London Radar: complete H1 proof, London/NY overlap, take/return, same-H1 ambiguity, stale and responsive UI PASS');
