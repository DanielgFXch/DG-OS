'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let configuration = null;
  let session = null;
  let records = [];
  function show(message, error = false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('error',error);
  }
  function render() {
    const term = $('search').value.trim().toLocaleLowerCase();
    const items = records.filter(i => (i.title+' '+i.content).toLocaleLowerCase().includes(term));
    $('memories').replaceChildren();
    if (!items.length) { const p=document.createElement('p');p.textContent='Keine passenden Erinnerungen vorhanden.';$('memories').append(p);return; }
    for (const item of items) {
      const div=document.createElement('article');div.className='memory';
      const heading=document.createElement('h3');heading.textContent=item.title;
      const detail=document.createElement('p');detail.textContent=item.content;
      const meta=document.createElement('div');meta.className='muted';meta.textContent=item.category+' · '+new Date(item.updated_at).toLocaleString('de-CH');
      div.append(heading,detail,meta);$('memories').append(div);
    }
  }
  async function api(url, options = {}) {
    const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+session.access_token},cache:'no-store',credentials:'same-origin'});
    const data=await response.json().catch(()=>({}));
    if (!response.ok) {
      if (response.status===401) logout();
      throw Error(data.error||'request_failed');
    }
    return data;
  }
  async function load() {
    const data=await api('/api/memory/items?limit=100');
    records=data.items||[];render();
    show(records.length+' Erinnerungen geladen.');
  }
  function logout() {
    session=null;records=[];$('password').value='';
    $('workspace').hidden=true;$('login').hidden=false;
    show('Abgemeldet. Erinnerungen sind nur nach Anmeldung sichtbar.');
  }
  async function init() {
    try {
      const result=await fetch('/api/memory/status',{cache:'no-store'});
      if (!result.ok) throw Error('memory_status_unavailable');
      configuration=await result.json();
      if (!configuration.configured||!configuration.supabaseUrl||!configuration.publishableKey) {
        show('Memory ist noch nicht konfiguriert. Setze DGOS_SUPABASE_PUBLISHABLE_KEY nur auf dem Server.',true);return;
      }
      $('login').hidden=false;show('Memory ist bereit. Bitte anmelden.');
    } catch (_) {show('Die Memory-API ist auf diesem Server nicht verfügbar.',true);}
  }
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if (!configuration) return;
    const button=$('loginForm').querySelector('button');button.disabled=true;
    try {
      const response=await fetch(configuration.supabaseUrl+'/auth/v1/token?grant_type=password',{
        method:'POST',headers:{apikey:configuration.publishableKey,'Content-Type':'application/json'},
        body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})
      });
      const data=await response.json();
      if (!response.ok || !data.access_token) throw Error('Anmeldung fehlgeschlagen. Prüfe E-Mail und Passwort.');
      session={access_token:data.access_token};
      $('password').value='';
      $('account').textContent=(data.user&&data.user.email)||'Angemeldet';
      await load();
      $('login').hidden=true;$('workspace').hidden=false;
    } catch (error) { session=null;show(error.message||'Anmeldung fehlgeschlagen.',true); }
    finally {button.disabled=false;}
  });
  $('memoryForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const button=$('memoryForm').querySelector('button');button.disabled=true;
    try {
      await api('/api/memory/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        category:$('category').value,title:$('title').value,content:$('content').value,confirmed_by_user:true
      })});
      $('memoryForm').reset();await load();show('Erinnerung gespeichert.');
    } catch(error) {show('Speichern fehlgeschlagen: '+error.message,true);}
    finally {button.disabled=false;}
  });
  $('search').addEventListener('input',render);
  $('reload').addEventListener('click',()=>load().catch(e=>show('Laden fehlgeschlagen: '+e.message,true)));
  $('logout').addEventListener('click',logout);
  init();
})();