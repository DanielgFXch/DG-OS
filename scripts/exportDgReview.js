'use strict';

const fs=require('fs');
const path=require('path');
const reality=require('./dgRealityCheck.js');

function parseArgs(argv){
  const result={server:null,snapshot:null,output:null};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--server') result.server=argv[++i]||null;
    else if(argv[i]==='--snapshot') result.snapshot=argv[++i]||null;
    else if(argv[i]==='--output') result.output=argv[++i]||null;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if((result.server?1:0)+(result.snapshot?1:0)!==1) throw new Error('Use exactly one of --server or --snapshot.');
  return result;
}

function selectedCases(report){
  return['Daily','4H','H1'].flatMap(tf=>(report.relevantPois[tf]||[])).slice(0,6);
}

function buildReviewPack(report){
  const cases=selectedCases(report);
  const liquidity=report.keyLiquidity.slice(0,6).map(level=>`${level.label} ${level.status} @ ${level.price}`).join('; ')||'—';
  const lines=['# DG OS – Daniel Review Pack','',`Generated: ${report.generatedAt}`,`Source: ${report.source}`,`Symbol: ${report.symbol}`,`Price: ${report.price}`,'',
    '> Review only. Daniel feedback is not applied automatically to trading rules.',''];
  if(!cases.length) lines.push('REAL_CASE_NOT_AVAILABLE','');
  cases.forEach((item,index)=>{
    const confirmation=report.confirmations.find(entry=>entry.poi===item.id);
    lines.push(`## CASE ${index+1}`,'',
      `Time: ${item.formedAt||'—'}`,
      `TF: ${item.timeframe}`,
      `Type: ${item.type}`,
      `Direction: ${item.direction}`,
      `Range: ${item.range.low}–${item.range.high}`,
      `Mitigation: ${item.mitigationPercent}% (${item.mitigationState})`,
      `Tested: ${item.tested?'YES':'NO'}`,
      `Reaction: ${item.reaction?'YES':'NO'}`,
      `Liquidity Context: ${liquidity}`,
      `Confirmation: ${confirmation?`${confirmation.status} after touch ${confirmation.touchedAt}`:'NO CONFIRMATION'}`,
      `DG OS Relevance: ${item.quality.toUpperCase()} (${item.score}/${item.maxScore})`,
      `DG OS Decision: ${report.decision.stage}${report.decision.direction?` ${report.decision.direction}`:''} [${report.decision.internalStatus}]`,'',
      'DANIEL REVIEW:','- Relevant? [ ]','- Would I watch this? [ ]','- Reaction correct? [ ]','- Expected status:','- Comment:','');
  });
  return lines.join('\n');
}

function defaultOutputPath(){
  return path.join(process.cwd(),'tmp','dg-review',`dg-review-${new Date().toISOString().replace(/[:.]/g,'-')}.md`);
}

async function main(argv){
  const options=parseArgs(argv);
  const input=await reality.loadInput(options);
  const report=reality.buildRealityReport(input);
  const output=path.resolve(options.output||defaultOutputPath());
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,`${buildReviewPack(report)}\n`);
  process.stdout.write(`${output}\n`);
}

if(require.main===module){
  main(process.argv.slice(2)).catch(err=>{process.stderr.write(`DG Review export failed: ${err.message}\n`);process.exitCode=1;});
}

module.exports={parseArgs,selectedCases,buildReviewPack,defaultOutputPath};
