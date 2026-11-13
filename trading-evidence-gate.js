/* DG OS — presentation-only live evidence gate.
   Server reachability is not market-data freshness. This module does not
   calculate setups, change DG rules, or authorize orders. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGTradingEvidenceGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function assess({reachable=false,marketState=null,brain=null,nowMs=Date.now(),maxAgeSeconds=20}={}){
    const rejected=(reason,ageSeconds=null)=>({live:false,reason,ageSeconds});
    if(reachable!==true)return rejected('SERVER_OFFLINE');
    if(marketState?.symbol!=='XAUUSD')return rejected('INVALID_MARKET');
    if(!brain?.report||!brain?.decision)return rejected('BRAIN_MISSING');
    const freshness=marketState.freshness;
    if(freshness?.websocketStatus!=='streaming'||freshness.isPriceLive!==true)
      return rejected('STREAM_NOT_LIVE');
    const at=Date.parse(freshness.lastPriceUpdate||'');
    if(!Number.isFinite(at)||!Number.isFinite(nowMs)||at>nowMs+5000)
      return rejected('INVALID_TIMESTAMP');
    const ageSeconds=Math.max(0,(nowMs-at)/1000);
    const limit=Number.isFinite(maxAgeSeconds)&&maxAgeSeconds>0?
      Math.min(maxAgeSeconds,120):20;
    if(ageSeconds>limit)return rejected('STALE_TICK',ageSeconds);
    return {live:true,reason:'LIVE_TICK_CONFIRMED',ageSeconds};
  }
  return Object.freeze({assess});
});
