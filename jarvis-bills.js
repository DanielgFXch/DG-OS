/* DG OS: one owner-confirmed invoice workflow for voice, image and text.
 * Bills stored in the existing private data table; no payments or bank data.
 */
(() => {
  'use strict';
  const root=document.getElementById('jarvisBills');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const api='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-bills';
  const token=()=>{try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return '';}};
  let bills=[],busy=false;
  const today=()=>window.DGOSLifeIntent?.todayZurich()||new Date().toISOString().slice(0,10);
  function el(tag,cls,txt){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(txt!==undefined)node.textContent=String(txt);
    return node;
  }
  function notice(text,error=false){
    $('jbBillsStatus').textContent=text;
    $('jbBillsStatus').dataset.error=String(error);
  }
  async function request(action,payload){
    const key=token();
    if(!key)throw Error('Bitte verbinde dieses Gerät zuerst sicher mit Jarvis über Telegram.');
    const response=await fetch(api+'?action='+encodeURIComponent(action),{
      method:payload?'POST':'GET',cache:'no-store',
      headers:{Authorization:'Bearer '+key,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    let out={};try{out=await response.json();}catch{}
    if(!response.ok){
      if(response.status===401)throw Error('Deine Jarvis-Gerätesitzung ist abgelaufen. Bitte erneut mit Telegram koppeln.');
      if(out.error==='invalid_bill')throw Error('Bitte Anbieter, Betrag und Fälligkeit überprüfen.');
      throw Error('Deine privaten Rechnungen konnten gerade nicht verarbeitet werden. Es wurde nichts geändert.');
    }
    return out;
  }
  function niceDate(value){
    if(!value||typeof value!=='string')return 'Fälligkeit noch offen';
    const date=new Date(value+'T12:00:00Z');
    return Number.isFinite(date.getTime())?
      new Intl.DateTimeFormat('de-CH',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):
      'Fälligkeit noch offen';
  }
  function money(item){
    const value=Number(item.amount);
    if(item.amount===null||item.amount===undefined||item.amount===''||!Number.isFinite(value))
      return 'Betrag nicht erfasst';
    return new Intl.NumberFormat('de-CH',{style:'currency',currency:item.currency==='EUR'?'EUR':'CHF'}).format(value);
  }
  function render(){
    const list=$('jbBillList');list.replaceChildren();
    const open=bills.filter(x=>x.status==='open');
    $('jbBillsOpenCount').textContent=open.length+' offen';
    if(!bills.length){
      list.append(el('p','jb-bills-empty','Noch keine Rechnungen gespeichert. Sag zum Beispiel: «Hey Jarvis, ich habe eine Rechnung von Sunrise über 79 Franken».'));
      return;
    }
    const sorted=[...bills].sort((a,b)=>(a.status==='done')-(b.status==='done')||
      String(a.date||'9999-12-31').localeCompare(String(b.date||'9999-12-31')));
    for(const item of sorted){
      const card=el('article','jb-bill-item'+(item.status==='done'?' is-paid':''));
      const info=el('div','jb-bill-info');
      info.append(el('strong','jb-bill-name',item.title));
      info.append(el('span','jb-bill-money',money(item)));
      info.append(el('small','jb-bill-date',niceDate(item.date)));
      const state=el('span','jb-bill-state',item.status==='done'?'BEZAHLT':'OFFEN');
      const control=el('button','jb-bill-toggle',item.status==='done'?'Wieder öffnen':'Als bezahlt markieren');
      control.type='button';
      control.setAttribute('aria-label',item.status==='done'?
        'Rechnung '+item.title+' wieder als offen markieren':
        'Rechnung '+item.title+' als bezahlt markieren');
      control.addEventListener('click',async()=>{
        if(busy)return;
        if(item.status!=='done'&&!window.confirm('Hast du die Rechnung «'+item.title+'» tatsächlich bezahlt? Es wird keine Zahlung ausgeführt.'))return;
        busy=true;control.disabled=true;
        try{
          const r=await request('toggle',{id:item.id,done:item.status!=='done'});
          bills=bills.map(x=>x.id===item.id?r.bill:x);
          render();notice('Rechnungsstatus aktualisiert. Keine Zahlung ausgeführt.');
          window.dispatchEvent(new Event('dgos-private-updated'));
        }catch(e){notice(e?.message||'Status konnte nicht gespeichert werden.',true);}
        finally{busy=false;}
      });
      card.append(state,info,control);list.append(card);
    }
  }
  async function load(){
    if(!token()){bills=[];render();notice('Bitte verbinde dieses Gerät im Jarvis-Bereich einmal mit Telegram.');return;}
    try{const out=await request('list');bills=Array.isArray(out.bills)?out.bills:[];render();notice('Deine privaten Rechnungen sind synchronisiert.');}
    catch(e){notice(e?.message||'Konnte nicht laden.',true);}
  }
  function showDraft(info={},source='manual'){
    const draft=$('jbBillDraft');
    draft.hidden=false;
    $('jbBillTitle').value=String(info.title||'').slice(0,120);
    $('jbBillAmount').value=String(info.amount||'').slice(0,12);
    $('jbBillCurrency').value=info.currency==='EUR'?'EUR':'CHF';
    $('jbBillDue').value=/^\d{4}-\d{2}-\d{2}$/.test(info.dueDate||'')?info.dueDate:'';
    $('jbBillSource').textContent=source==='voice'?'GESPROCHEN':source==='photo'?'AUS FOTO':'MANUELL';
    notice('Entwurf bereit. Prüfe die Angaben und tippe erst dann auf «Als offene Rechnung speichern».');
    draft.scrollIntoView({behavior:'smooth',block:'center'});
    $('jbBillTitle').focus({preventScroll:true});
  }
  $('jbBillNew').addEventListener('click',()=>showDraft());
  $('jbBillCancel').addEventListener('click',()=>{
    $('jbBillDraft').hidden=true;
    $('jbBillDraft').reset();
    notice('Entwurf verworfen. Nichts gespeichert.');
  });
  $('jbBillDraft').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const title=$('jbBillTitle').value.trim();
    const amount=$('jbBillAmount').value.trim();
    const date=$('jbBillDue').value;
    const currency=$('jbBillCurrency').value;
    if(title.length<2||title.length>120)return notice('Bitte einen verständlichen Rechnungsnamen eingeben.',true);
    if(amount&& !/^\d{1,6}(?:[.,]\d{1,2})?$/.test(amount))
      return notice('Bitte einen gültigen Betrag eingeben, z. B. 79.90.',true);
    if(!token())return notice('Bitte Jarvis zuerst mit Telegram koppeln.',true);
    busy=true;$('jbBillSave').disabled=true;
    try{
      const result=await request('add',{title,amount,date,currency});
      bills.unshift(result.bill);
      $('jbBillDraft').hidden=true;$('jbBillDraft').reset();
      render();notice('Gespeichert als OFFEN: '+title+'. Es wurde nichts bezahlt.');
      window.dispatchEvent(new Event('dgos-private-updated'));
      window.dispatchEvent(new Event('dgos-jarvis-tasks-updated'));
      $('jbBillsHeading').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(e){notice(e?.message||'Rechnung konnte nicht gespeichert werden.',true);}
    finally{busy=false;$('jbBillSave').disabled=false;}
  });
  window.DGOSJarvisBills={
    showDraft,
    openList(){
      root.scrollIntoView({behavior:'smooth',block:'start'});
      void load();
    },
    reload:load
  };
  window.addEventListener('dgos-device-session',load);
  window.addEventListener('focus',()=>{if(document.body.dataset.dgosRoute==='jarvis')void load();});
  void load();
})();
