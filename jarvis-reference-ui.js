/* DG OS — Reference-grade Jarvis presentation.
 * Progressive enhancement of the REAL Jarvis controls. No new data sources,
 * demo metrics, cloned input handlers, tokens, or trading logic.
 */
(() => {
  'use strict';
  const panel = document.getElementById('personalJarvis');
  const hero = panel?.querySelector('.jarvis-cinematic-hero');
  const head = hero?.querySelector('.personal-jarvis-head');
  const badge = hero?.querySelector('.jarvis-system-badge');
  const orb = hero?.querySelector('.jarvis-orb-stage');
  const reply = hero?.querySelector('.jpr-reply-card');
  const form = document.getElementById('jarvisLifeCommandForm');
  const input = document.getElementById('jarvisLifeCommandInput');
  const quick = document.getElementById('jarvisDashboardQuick');
  const originalDeck = panel?.querySelector('.jarvis-command-deck');
  if (!panel?.classList.contains('jarvis-dashboard-ready') || !hero || !head ||
      !badge || !orb || !reply || !form || !input || !quick || !originalDeck ||
      panel.classList.contains('jarvis-reference-ready')) return;

  const make = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = value;
    return el;
  };
  const title = document.getElementById('personalJarvisTitle');
  if (title) {
    const gradient = make('span', '', 'Jarvis.');
    title.replaceChildren(document.createTextNode('Dein '), gradient);
  }
  const kicker = head.querySelector('.personal-kicker');
  if (kicker) kicker.textContent = 'JARVIS · DEIN PERSÖNLICHER ASSISTENT';
  const subtitle = head.querySelector('p');
  if (subtitle) subtitle.textContent = 'Dein intelligenter Assistent für Alltag, Gesundheit und Fokus.';

  // The original orb and connection badge are MOVED, never copied.
  // Existing microphone listeners, state, accessibility and pairing survive.
  const active = make('section', 'jref-active');
  active.setAttribute('aria-label', 'Jarvis Sprachassistent');
  const live = make('div', 'jref-live');
  live.append(make('span', 'jref-status-pip'));
  const copy = make('div', 'jref-live-copy');
  const state = make('strong', 'jref-state', 'Jarvis bereit');
  state.id = 'jrefState';
  const hint = make('p', 'jref-hint', 'Tippe auf die leuchtende Kugel und sprich mit Jarvis.');
  hint.id = 'jrefHint';
  copy.append(state, hint);
  live.append(copy);
  const liveBadges = make('div', 'jref-real-badges');
  const label = make('span', '', 'SPRACHSTEUERUNG');
  liveBadges.append(label, badge);
  const activeLeft = make('div', 'jref-active-left');
  activeLeft.append(live, liveBadges);
  active.append(activeLeft, orb);
  head.insertAdjacentElement('afterend', active);
  const audio = hero.querySelector('.jv-hero-audio');
  let speechOptions;
  if (audio) {
    speechOptions = make('details', 'jref-voice-options');
    speechOptions.append(make('summary', '', 'Sprachausgabe & Einstellungen'));
    speechOptions.append(audio);
    active.insertAdjacentElement('afterend', speechOptions);
  }

  function panelHeading(kickerText, heading, subText) {
    const wrap = make('div', 'jref-heading');
    const small = make('span', 'jref-eyebrow', kickerText);
    const h = make('h3', '', heading);
    const sub = make('p', '', subText);
    wrap.append(small, h, sub);
    return wrap;
  }
  function tile(icon, name, value, info, type, action) {
    const button = make('button', 'jref-insight jref-insight-' + type);
    button.type = 'button';
    button.setAttribute('aria-label', name + ' öffnen');
    const top = make('div', 'jref-insight-top');
    top.append(make('span', 'jref-insight-icon', icon), make('span', 'jref-insight-name', name));
    const strong = make('strong', 'jref-insight-value', value);
    const small = make('small', 'jref-insight-info', info);
    button.append(top, strong, small);
    button.addEventListener('click', action);
    return { button, strong, small };
  }
  const go = target => {
    document.querySelector('.bottom-nav button[data-target="' + target + '"]')?.click();
  };
  const weatherSection = document.getElementById('jarvisWeatherAdvisor');
  const today = make('section', 'jref-today jref-glass');
  today.setAttribute('aria-label', 'Heute für dich');
  today.append(panelHeading('DEIN TAGESÜBERBLICK', 'Heute für dich', 'Echte Informationen aus deinem DG OS.'));
  const insights = make('div', 'jref-insights');
  const weather = tile('☀', 'Wetter & Kleidung', 'Wird geladen', 'Aktuelle Prognose', 'weather',
    () => weatherSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const tasks = tile('✦', 'Dein Tagesfokus', '—', 'Aufgaben in DG OS', 'tasks',
    () => go('personalHome'));
  const sleep = tile('☾', 'Schlaf-Check', '—', 'WHOOP Werte prüfen', 'sleep',
    () => go('personalHealth'));
  insights.append(weather.button, tasks.button, sleep.button);
  today.append(insights);

  const shortcuts = make('section', 'jref-actions jref-glass');
  shortcuts.setAttribute('aria-label', 'Schnellaktionen');
  shortcuts.append(panelHeading('MIT EINEM TIPP', 'Schnellaktionen', 'Direkt zu deinen wichtigsten Funktionen.'));
  const grid = make('div', 'jref-action-grid');
  const buttons = [
    ['✧', 'Erinnerung', 'task'],
    ['▦', 'Kalender', 'personalCalendar'],
    ['♡', 'Gesundheit', 'personalHealth'],
    ['▥', 'Trading', 'tradingWorkspace']
  ];
  for (const [icon, caption, target] of buttons) {
    const btn = make('button', 'jref-action');
    btn.type = 'button';
    btn.dataset.jrefTarget = target;
    btn.append(make('span', 'jref-action-icon', icon), make('span', 'jref-action-text', caption),
      make('span', 'jref-action-chevron', '›'));
    btn.addEventListener('click', () => {
      if (target === 'task') originalDeck.querySelector('[data-jarvis-action="task"]')?.click();
      else go(target);
    });
    grid.append(btn);
  }
  shortcuts.append(grid);

  const chat = make('section', 'jref-chat jref-glass');
  chat.setAttribute('aria-label', 'Frag Jarvis');
  chat.append(panelHeading('DEINE KI ZENTRALE', 'Frag Jarvis', 'Schreib oder sprich mit deinem persönlichen Assistenten.'));
  input.placeholder = 'Was kann ich heute für dich tun?';
  chat.append(form);
  const promptRow = make('div', 'jref-prompts');
  for (const prompt of ['Was ist heute wichtig?', 'Erstelle einen Tagesplan', 'Wie habe ich geschlafen?']) {
    const button = make('button', 'jref-prompt', prompt + '  ›');
    button.type = 'button';
    button.addEventListener('click', () => {
      input.value = prompt;
      input.focus();
    });
    promptRow.append(button);
  }
  chat.append(promptRow);

  const recent = make('section', 'jref-recent jref-glass');
  recent.setAttribute('aria-label', 'Letzte Antwort');
  recent.append(panelHeading('DEIN GESPRÄCH', 'Letzte Antwort', 'Jarvis zeigt dir hier seine echte letzte Antwort.'));
  recent.append(reply);

  // Keep the compact original dashboard, shortcuts and all native integrations,
  // but move secondary controls below the primary UX without deleting them.
  const extra = make('details', 'jref-extra jref-glass');
  extra.append(make('summary', '', 'Weitere Funktionen & persönlicher Tagesplan'));
  extra.append(quick);
  hero.after(today, shortcuts, chat, recent, extra);

  const source = id => document.getElementById(id);
  const value = id => (source(id)?.textContent || '').trim();
  const valid = v => v && v !== '—' && !/wird geprüft|wird geladen|verbind|noch kein|daten fehlen|nicht verfügbar/i.test(v);
  const syncInsights = () => {
    const weatherName = value('jwaHeadline');
    const weatherInfo = value('jwaConditions');
    weather.strong.textContent = valid(weatherName) ? weatherName : 'Prognose laden';
    weather.small.textContent = valid(weatherInfo) ? weatherInfo : 'Aktuelle Daten werden geprüft';
    const count = value('jarvisLifeTasks');
    tasks.strong.textContent = /^\d+$/.test(count) ? count + ' Aufgaben' : '—';
    tasks.small.textContent = /^\d+$/.test(count) ? 'In deiner Tagesübersicht' : 'Aufgaben werden geladen';
    const whoopState = value('whoopStatus');
    const percent = value('dgwSleepPercent');
    const sleepPerf = value('whoopSleepPerformance');
    const metric = /^\d{1,3}\s*%$/.test(percent) ? percent :
      /^\d{1,3}\s*%$/.test(sleepPerf) ? sleepPerf : '';
    const connected = /verbunden/i.test(whoopState) && !/nicht verbunden/i.test(whoopState);
    sleep.strong.textContent = connected && metric ? metric : '—';
    sleep.small.textContent = connected && metric ? 'Schlafleistung · WHOOP' :
      'Keine bestätigten WHOOP-Werte';
  };
  // Observe only actual existing sources; never synthesize health or weather.
  const observer = new MutationObserver(syncInsights);
  for (const id of ['jwaHeadline','jwaConditions','jarvisLifeTasks',
                     'whoopStatus','dgwSleepPercent','whoopSleepPerformance']) {
    const element = source(id);
    if (element) observer.observe(element, { childList: true, characterData: true, subtree: true });
  }
  syncInsights();

  const defaultHint = hint.textContent;
  const applyState = (micState) => {
    active.dataset.mic = micState || 'idle';
    if (micState === 'listening') {
      state.textContent = 'Jarvis hört zu';
      hint.textContent = 'Aufnahme läuft. Zum Senden erneut auf die Kugel tippen.';
    } else if (micState === 'processing' || micState === 'starting') {
      state.textContent = micState === 'starting' ? 'Mikrofon startet' : 'Jarvis denkt nach';
      hint.textContent = 'Deine Anfrage wird verarbeitet.';
    } else if (micState === 'error') {
      state.textContent = 'Mikrofon prüfen';
      hint.textContent = 'Weitere Informationen stehen unter den Sprach-Einstellungen.';
    } else {
      state.textContent = 'Jarvis bereit';
      hint.textContent = defaultHint;
    }
  };
  window.addEventListener('dgos-jarvis-microphone-state', event =>
    applyState(event.detail?.state));
  panel.classList.add('jarvis-reference-ready');
})();
