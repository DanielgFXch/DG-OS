/* DG OS Premium UI — lightweight, dependency-free quick navigation.
 * Reuses original route buttons, real shopping/WHOOP/settings panels and handlers.
 * No API calls, no data persistence, no credentials and no duplicated app state.
 */
(() => {
  'use strict';
  if (document.getElementById('uxQuickPalette')) return;

  const header = document.querySelector('.topbar-meta');
  const dock = document.querySelector('.bottom-nav');
  if (!header || !dock || typeof HTMLDialogElement === 'undefined') return;

  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const navButton = target => document.querySelector('.bottom-nav button[data-target="' + target + '"]');
  const focusSection = id => {
    const node = document.getElementById(id);
    if (!node) return;
    // The route CSS unhides its original section on the next frame.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (node.getClientRects().length) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  };
  const showRoute = (target, sectionId, after) => {
    const button = navButton(target);
    if (!button) return;
    button.click(); // One real source of truth: existing navigation.js.
    if (sectionId) focusSection(sectionId);
    if (after) requestAnimationFrame(() => requestAnimationFrame(after));
  };

  const actions = [
    { id:'home', title:'Heute', description:'Deine persönliche Tagesübersicht', icon:'◫', target:'personalHome', keys:'dashboard startseite übersicht' },
    { id:'jarvis', title:'Jarvis', description:'Mit deinem Assistenten sprechen', icon:'✦', target:'personalJarvis', keys:'chat voice sprechen ki' },
    { id:'tasks', title:'Aufgaben', description:'Aufgaben direkt öffnen', icon:'✓', target:'personalHome', section:'personalTasks', keys:'to do erledigen erinnerung' },
    { id:'calendar', title:'Kalender', description:'Termine und Agenda', icon:'▦', target:'personalCalendar', keys:'plan termine agenda' },
    { id:'health', title:'Gesundheit', description:'WHOOP, Schlaf und Erholung', icon:'♡', target:'personalHealth', keys:'gesundheit erholung whoop' },
    { id:'sleep', title:'Schlafanalyse', description:'Schlaf vergleichen und Trends prüfen', icon:'◔', target:'personalHealth', section:'whoopSleepAnalysis', keys:'whoop schlaf heute gestern woche' },
    { id:'shopping', title:'Einkaufsliste', description:'Deine echten gespeicherten Produkte', icon:'▤', target:'personalPrivate', keys:'milch toast einkaufen shopping', after:() => document.querySelector('[data-private-tab="shopping"]')?.click() },
    { id:'private', title:'Privat', description:'Deine persönliche Organisation', icon:'▣', target:'personalPrivate', keys:'privat liste dokumente rechnungen' },
    { id:'social', title:'Social Media', description:'Social Hub und Analysen', icon:'◎', target:'personalSocial', keys:'instagram social' },
    { id:'trading', title:'Trading', description:'Market Desk und Marktüberblick', icon:'▥', target:'tradingWorkspace', keys:'gold markt analyse' },
    { id:'settings', title:'Stimme & Einstellungen', description:'Jarvis Stimme und Verbindungen', icon:'⚙', target:'personalJarvis', keys:'einstellungen profil voice audio provider', after:() => {
      const settings = document.getElementById('jarvisDashSettingsLink');
      if (settings) settings.click();
      else {
        const advanced = document.getElementById('jarvisDashAdvanced');
        if (advanced) { advanced.open = true; advanced.scrollIntoView({ block:'start',behavior:'smooth' }); }
      }
    }}
  ];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de-CH');

  // A real, keyboard-accessible shortcut in the existing header.
  const openButton = make('button','ux-search-trigger');
  openButton.type = 'button';
  openButton.setAttribute('aria-label','Schnellzugriff öffnen (Befehlstaste K)');
  openButton.setAttribute('aria-haspopup','dialog');
  const searchIcon = make('span','', '⌕');searchIcon.setAttribute('aria-hidden','true');
  const searchText = make('span','ux-search-label','Schnellzugriff');
  const keyHint = make('kbd','', '⌘ K');
  openButton.append(searchIcon,searchText,keyHint);
  header.prepend(openButton);

  // On mobile: keep four primary destinations visible, other real routes live in Mehr.
  const more = make('button','ux-more-button','Mehr');
  more.type = 'button';
  more.setAttribute('aria-label','Weitere Bereiche öffnen');
  more.setAttribute('aria-haspopup','dialog');
  dock.append(more);
  const syncMore = () => {
    const route = document.body.dataset.dgosRoute;
    const extra = ['private','social','trading'].includes(route);
    more.classList.toggle('active',extra);
    if (extra) more.setAttribute('aria-current','page');
    else more.removeAttribute('aria-current');
  };
  new MutationObserver(syncMore).observe(document.body,{attributes:true,attributeFilter:['data-dgos-route']});
  syncMore();

  const dialog = make('dialog','ux-palette');
  dialog.id = 'uxQuickPalette';
  dialog.setAttribute('aria-label','DG OS Schnellzugriff');
  const head = make('div','ux-palette-head');
  const symbol = make('span','ux-palette-symbol','⌕');symbol.setAttribute('aria-hidden','true');
  const search = make('input','ux-palette-input');
  search.type='search';search.autocomplete='off';search.spellcheck=false;
  search.placeholder='Wohin möchtest du?';search.setAttribute('aria-label','Bereich suchen');
  const close = make('button','ux-palette-close','×');close.type='button';close.setAttribute('aria-label','Schnellzugriff schliessen');
  head.append(symbol,search,close);
  const kicker = make('span','ux-palette-kicker','Schnellzugriff · DG OS');
  const list = make('div','ux-palette-list');list.id='uxQuickPaletteList';
  const foot = make('div','ux-palette-foot');
  const hint = make('span','','↑ ↓ Auswählen · ↵ Öffnen');
  const esc = make('span','','Esc Schliessen');
  foot.append(hint,esc);
  dialog.append(head,kicker,list,foot);
  document.body.append(dialog);

  let shown = actions;
  let selected = 0;
  let previousFocus = null;

  function select(index) {
    const options = [...list.querySelectorAll('.ux-palette-item')];
    if (!options.length) return;
    selected = (index + options.length) % options.length;
    options.forEach((button,i) => button.dataset.active = String(i === selected));
    options[selected].scrollIntoView({ block:'nearest' });
  }
  function choose(action) {
    if (!action) return;
    dialog.close();
    showRoute(action.target,action.section,action.after);
  }
  function render() {
    const query = normalize(search.value.trim());
    shown = query ? actions.filter(action => normalize(action.title + ' ' + action.description + ' ' + action.keys).includes(query)) : actions;
    selected=0;
    list.replaceChildren();
    if (!shown.length) {
      list.append(make('p','ux-palette-empty','Kein passender Bereich gefunden.'));
      return;
    }
    shown.forEach((action,index) => {
      const item = make('button','ux-palette-item');
      item.type='button';item.dataset.active=String(index === 0);
      const icon = make('span','ux-palette-icon',action.icon);icon.setAttribute('aria-hidden','true');
      const copy = make('span','ux-palette-copy');
      copy.append(make('strong','',action.title),make('small','',action.description));
      const arrow = make('span','ux-palette-arrow','↗');arrow.setAttribute('aria-hidden','true');
      item.append(icon,copy,arrow);
      item.addEventListener('mouseenter',() => {
        selected=index;
        list.querySelectorAll('.ux-palette-item').forEach((node,i) => node.dataset.active=String(i===index));
      });
      item.addEventListener('click',() => choose(action));
      list.append(item);
    });
  }
  function openPalette() {
    if (dialog.open) { search.focus();return; }
    previousFocus = document.activeElement;
    search.value='';render();
    dialog.showModal();search.focus({ preventScroll:true });
  }
  openButton.addEventListener('click',openPalette);
  more.addEventListener('click',openPalette);
  close.addEventListener('click',()=>dialog.close());
  search.addEventListener('input',render);
  dialog.addEventListener('close',()=> {
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({preventScroll:true});
  });
  // Native dialog can also be closed by clicking its backdrop.
  dialog.addEventListener('pointerdown',event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('keydown',event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length) select(selected+(event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();choose(shown[selected]);
    }
  });
  document.addEventListener('keydown',event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='k') {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else openPalette();
    }
  });
})();
