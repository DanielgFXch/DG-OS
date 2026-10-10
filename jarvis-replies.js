/* Short, natural Jarvis confirmations. Only the actual backend result counts. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSJarvisReplies=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function products(values){
    if(!Array.isArray(values))return [];
    return values.filter(v=>typeof v==='string'&&v.trim())
      .map(v=>v.trim()).slice(0,12);
  }
  function joined(values){
    const items=products(values);
    if(items.length===0)return '';
    if(items.length===1)return items[0];
    if(items.length===2)return items[0]+' und '+items[1];
    return items.slice(0,-1).join(', ')+' und '+items.at(-1);
  }
  function shopping(added,skipped,address='Gomes'){
    const newItems=products(added),oldItems=products(skipped);
    const name=typeof address==='string'&&/^[a-zäöüà-ÿ -]{1,35}$/i.test(address.trim())?address.trim():'Gomes';
    const prefix='Okay '+name+', ';
    if(!newItems.length&&!oldItems.length)
      return 'Ich konnte keine neuen Produkte bestätigen. Bitte versuch es nochmals.';
    if(!newItems.length)
      return prefix+joined(oldItems)+' '+(oldItems.length===1?'steht':'stehen')+' bereits auf deiner Einkaufsliste.';
    const first=prefix+joined(newItems)+' '+(newItems.length===1?'steht':'stehen')+' jetzt auf deiner Einkaufsliste.';
    if(!oldItems.length)return first;
    return first+' '+joined(oldItems)+' '+(oldItems.length===1?'war':'waren')+' bereits eingetragen.';
  }
  return {joined,shopping};
});