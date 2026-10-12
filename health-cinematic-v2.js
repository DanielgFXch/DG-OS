/* DG OS Health Cinematic v2 — presentation-only, actual WHOOP state.
 * Enhances the existing connection pill; never simulates API connection,
 * changes WHOOP data or replaces any native import/refresh handlers.
 */
(() => {
  'use strict';
  const health=document.getElementById('personalHealth');
  const badge=health?.querySelector('.personal-health-actions');
  const status=document.getElementById('whoopStatus');
  const meta=document.getElementById('whoopHealthMeta');
  const details=document.getElementById('whoopDetails');
  if(!health||!badge||!status||!meta||!details||badge.querySelector('.dgh-details-trigger'))return;
  const sync=document.createElement('span');
  sync.className='dgh-sync-subline';
  sync.setAttribute('data-visible','false');
  const detailsButton=document.createElement('button');
  detailsButton.type='button';
  detailsButton.className='dgh-details-trigger';
  detailsButton.textContent='›';
  detailsButton.setAttribute('aria-label','Weitere echte WHOOP-Daten anzeigen');
  detailsButton.setAttribute('aria-controls','whoopDetails');
  badge.append(sync,detailsButton);
  detailsButton.addEventListener('click',()=>{
    if(health.dataset.whoopSync!=='live'||details.classList.contains('hidden'))return;
    details.open=true;
    details.scrollIntoView({behavior:'smooth',block:'start'});
    details.querySelector('summary')?.focus({preventScroll:true});
  });
  function renderConnection(){
    const live=health.dataset.whoopSync==='live'&&/WHOOP\s*·\s*verbunden/i.test(status.textContent||'');
    const info=String(meta.textContent||'').trim();
    const match=info.match(/^WHOOP automatisch aktualisiert\s*·\s*([0-2]\d:[0-5]\d)(?:\s|$)/);
    if(live&&match){
      sync.textContent='Synchronisiert · '+match[1];
      sync.dataset.visible='true';
    }else{
      sync.textContent='';
      sync.dataset.visible='false';
    }
    detailsButton.disabled=!live;
    detailsButton.setAttribute('aria-hidden',String(!live));
  }
  new MutationObserver(renderConnection).observe(status,{childList:true,characterData:true,subtree:true});
  new MutationObserver(renderConnection).observe(meta,{childList:true,characterData:true,subtree:true});
  new MutationObserver(renderConnection).observe(health,{attributes:true,attributeFilter:['data-whoop-sync']});
  window.addEventListener('dgos-whoop-updated',renderConnection);
  renderConnection();
})();
