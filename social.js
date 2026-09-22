/* DG OS Social Media Hub — local-only Instagram cleanup workflow. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'dgos.social.hub.v1';
  const EDGE = 'https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/social';
  const DEVICE_SESSION_KEY = 'dgos.deviceSession';
  const LEGACY_SESSION_KEY = 'dgos.whoopSession';
  const ACCOUNT_LABELS = { business: 'Business', private: 'Privat' };
  const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

  const blankAccount = () => ({
    handle: '',
    followers: [],
    following: [],
    whitelist: [],
    decisions: {},
    importedAt: null,
    sourceFiles: []
  });

  const initialState = () => ({
    active: 'business',
    accounts: { business: blankAccount(), private: blankAccount() }
  });

  let state = loadState();
  const cloud = { business: null, private: null };

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return initialState();
      const next = initialState();
      next.active = parsed.active === 'private' ? 'private' : 'business';
      for (const key of ['business', 'private']) {
        const src = parsed.accounts && parsed.accounts[key] ? parsed.accounts[key] : {};
        next.accounts[key] = {
          handle: cleanUsername(src.handle || ''),
          followers: cleanUserList(src.followers),
          following: cleanUserList(src.following),
          whitelist: cleanUserList(src.whitelist),
          decisions: src.decisions && typeof src.decisions === 'object' ? src.decisions : {},
          importedAt: typeof src.importedAt === 'string' ? src.importedAt : null,
          sourceFiles: Array.isArray(src.sourceFiles) ? src.sourceFiles.filter(v => typeof v === 'string').slice(0, 30) : []
        };
      }
      return next;
    } catch (_) {
      return initialState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      notice('Speichern nicht möglich. Dein Browser-Speicher ist voll oder gesperrt.', 'error');
      return false;
    }
  }

  function cleanUsername(value) {
    const cleaned = String(value || '').trim().replace(/^@+/, '').replace(/\/$/, '');
    return USERNAME_RE.test(cleaned) ? cleaned.toLowerCase() : '';
  }

  function cleanUserList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(cleanUsername).filter(Boolean))].sort();
  }

  function account() {
    return state.accounts[state.active];
  }

  function session() {
    return localStorage.getItem(DEVICE_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY) || '';
  }

  function apiHeaders(json = false) {
    const headers = {};
    const token = session();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function api(action, options = {}) {
    const response = await fetch(EDGE + '/' + action, Object.assign({
      cache: 'no-store',
      headers: apiHeaders(Boolean(options.body))
    }, options));
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(body && body.error ? body.error : 'request_failed');
      error.status = response.status;
      throw error;
    }
    return body || {};
  }

  function formatDelta(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    return n > 0 ? '+' + n : String(n);
  }

  function deltaClass(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '';
    return n > 0 ? 'is-positive' : 'is-negative';
  }

  function renderCloud() {
    const data = cloud[state.active];
    const metrics = data && data.metrics ? data.metrics : null;
    const status = $('socialCloudStatus');
    if (status) {
      if (!session()) status.textContent = 'Nur lokal · DG OS Gerät nicht verbunden';
      else if (!metrics) status.textContent = 'Noch keine Cloud-Historie';
      else status.textContent = 'DG OS Cloud · ' + formatDate(metrics.capturedAt);
    }

    const mapping = [
      ['socialMetricToday', metrics && metrics.delta1d],
      ['socialMetric7d', metrics && metrics.delta7d],
      ['socialMetric30d', metrics && metrics.delta30d]
    ];
    for (const [id, value] of mapping) {
      const el = $(id);
      if (!el) continue;
      el.textContent = formatDelta(value);
      el.classList.remove('is-positive', 'is-negative');
      const cls = deltaClass(value);
      if (cls) el.classList.add(cls);
    }

    const cleanup = $('socialMetricCloudCleanup');
    if (cleanup) cleanup.textContent = metrics ? String(metrics.cleanup || 0) : '—';
    renderHistoryChart(data && Array.isArray(data.history) ? data.history : []);
  }

  function renderHistoryChart(history) {
    const host = $('socialHistoryChart');
    if (!host) return;
    host.replaceChildren();
    if (!history || history.length < 2) {
      const empty = document.createElement('span');
      empty.className = 'social-chart-empty';
      empty.textContent = 'Nach mindestens zwei Snapshots zeigt DG OS hier deinen Follower-Verlauf.';
      host.append(empty);
      return;
    }
    const values = history.map(item => Number(item.followers_count)).filter(Number.isFinite);
    if (values.length < 2) return;
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
    const points = history.map((item, index) => {
      const x = history.length === 1 ? 50 : (index / (history.length - 1)) * 100;
      const y = 90 - ((Number(item.followers_count) - min) / span) * 72;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('social-history-svg');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('fill', 'none');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
    host.append(svg);
  }

  async function loadCloudDashboard(accountKey = state.active) {
    if (!session()) {
      cloud[accountKey] = null;
      if (accountKey === state.active) renderCloud();
      return;
    }
    try {
      const data = await api('dashboard?accountKey=' + encodeURIComponent(accountKey));
      cloud[accountKey] = data;
    } catch (_) {
      cloud[accountKey] = null;
    }
    if (accountKey === state.active) renderCloud();
  }

  async function syncSnapshot(acc, accountKey) {
    if (!session()) return { synced: false, reason: 'no_session' };
    const result = await api('import-snapshot', {
      method: 'POST',
      body: JSON.stringify({
        accountKey,
        handle: acc.handle || null,
        followers: acc.followers,
        following: acc.following,
        sourceRef: (acc.sourceFiles || []).slice(0, 8).join(', ')
      })
    });
    await loadCloudDashboard(accountKey);
    return { synced: true, result };
  }

  function notice(message, tone = '') {
    const el = $('socialNotice');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.tone = tone;
  }

  function openWorkspace(accountKey) {
    if (accountKey === 'business' || accountKey === 'private') state.active = accountKey;
    persist();
    render();
    loadCloudDashboard(state.active);
    const workspace = $('socialWorkspace');
    workspace.classList.remove('hidden');
    document.body.classList.add('social-workspace-open');
    workspace.scrollTop = 0;
  }

  function closeWorkspace() {
    $('socialWorkspace').classList.add('hidden');
    document.body.classList.remove('social-workspace-open');
  }

  function nonFollowers(acc = account()) {
    const followerSet = new Set(acc.followers);
    return acc.following.filter(username => !followerSet.has(username));
  }

  function queue(acc = account()) {
    const whitelist = new Set(acc.whitelist);
    const candidates = nonFollowers(acc).filter(username => !whitelist.has(username));
    const pending = [];
    const later = [];
    for (const username of candidates) {
      const decision = acc.decisions[username];
      if (!decision) pending.push(username);
      else if (decision === 'later') later.push(username);
    }
    return [...pending, ...later];
  }

  function decisionCounts(acc = account()) {
    const values = Object.values(acc.decisions || {});
    return {
      kept: values.filter(v => v === 'keep').length,
      removed: values.filter(v => v === 'removed').length,
      later: values.filter(v => v === 'later').length
    };
  }

  function formatDate(value) {
    if (!value) return 'Noch kein Import';
    const d = new Date(value);
    return Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
      : 'Noch kein Import';
  }

  function renderSummaryCard(key) {
    const acc = state.accounts[key];
    const handle = $(`social${key === 'business' ? 'Business' : 'Private'}Handle`);
    const status = $(`social${key === 'business' ? 'Business' : 'Private'}Status`);
    if (handle) handle.textContent = acc.handle ? `@${acc.handle}` : `${ACCOUNT_LABELS[key]}-Account einrichten`;
    if (status) {
      const count = nonFollowers(acc).length;
      status.textContent = acc.following.length ? `${count} Cleanup-Kandidaten · ${acc.following.length} gefolgt` : 'Noch keine Instagram-Daten importiert';
    }
  }

  function render() {
    renderSummaryCard('business');
    renderSummaryCard('private');

    const acc = account();
    const label = ACCOUNT_LABELS[state.active];
    document.querySelectorAll('[data-social-account]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.socialAccount === state.active ? 'true' : 'false');
    });

    $('socialWorkspaceTitle').textContent = `${label} Instagram`;
    $('socialWorkspaceSubtitle').textContent = acc.handle ? `@${acc.handle}` : 'Account noch nicht benannt';
    $('socialHandleInput').value = acc.handle;
    $('socialImportedAt').textContent = formatDate(acc.importedAt);
    $('socialMetricFollowers').textContent = String(acc.followers.length);
    $('socialMetricFollowing').textContent = String(acc.following.length);
    $('socialMetricNonFollowers').textContent = String(nonFollowers(acc).length);
    $('socialMetricWhitelist').textContent = String(acc.whitelist.length);
    renderCloud();

    const counts = decisionCounts(acc);
    $('socialCleanupProgress').textContent = `${counts.removed} entfernt · ${counts.kept} behalten · ${counts.later} später`;
    $('socialWhitelistCount').textContent = `${acc.whitelist.length} geschützt`;
    renderWhitelist();
    renderQueue();
  }

  function renderWhitelist() {
    const acc = account();
    const container = $('socialWhitelistList');
    container.replaceChildren();
    if (!acc.whitelist.length) {
      const empty = document.createElement('span');
      empty.className = 'social-empty-inline';
      empty.textContent = 'Noch niemand geschützt.';
      container.append(empty);
      return;
    }
    for (const username of acc.whitelist.slice(0, 80)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'social-whitelist-chip';
      chip.textContent = `@${username} ×`;
      chip.title = 'Aus Whitelist entfernen';
      chip.addEventListener('click', () => {
        acc.whitelist = acc.whitelist.filter(v => v !== username);
        persist();
        render();
      });
      container.append(chip);
    }
  }

  function renderQueue() {
    const acc = account();
    const all = queue(acc);
    const current = all[0];
    $('socialQueueCount').textContent = `${all.length} offen`;

    const card = $('socialCleanupCard');
    const empty = $('socialCleanupEmpty');
    if (!current) {
      card.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.textContent = acc.following.length
        ? 'Cleanup erledigt. Aktuell gibt es keine offenen Kandidaten.'
        : 'Importiere zuerst deine Instagram Followers- und Following-Dateien.';
      return;
    }

    empty.classList.add('hidden');
    card.classList.remove('hidden');
    $('socialCleanupUsername').textContent = `@${current}`;
    $('socialCleanupReason').textContent = 'Folgt dir nicht zurück · nicht auf Whitelist';
    $('socialCleanupPosition').textContent = `1 von ${all.length} offenen Kandidaten`;
    $('socialOpenInstagram').dataset.username = current;
    $('socialDecisionKeep').dataset.username = current;
    $('socialDecisionRemoved').dataset.username = current;
    $('socialDecisionLater').dataset.username = current;
  }

  function saveHandle() {
    const raw = $('socialHandleInput').value;
    const cleaned = cleanUsername(raw);
    if (!cleaned) {
      notice('Bitte einen gültigen Instagram-Username eingeben.', 'error');
      $('socialHandleInput').focus();
      return;
    }
    account().handle = cleaned;
    persist();
    render();
    loadCloudDashboard(state.active);
    notice(`@${cleaned} als ${ACCOUNT_LABELS[state.active]} gespeichert.`, 'success');
  }

  function addWhitelist() {
    const input = $('socialWhitelistInput');
    const username = cleanUsername(input.value);
    if (!username) {
      notice('Bitte einen gültigen Username für die Whitelist eingeben.', 'error');
      input.focus();
      return;
    }
    const acc = account();
    if (!acc.whitelist.includes(username)) acc.whitelist = [...acc.whitelist, username].sort();
    input.value = '';
    persist();
    render();
    notice(`@${username} wird beim Cleanup geschützt.`, 'success');
  }

  function setDecision(username, decision) {
    const clean = cleanUsername(username);
    if (!clean) return;
    account().decisions[clean] = decision;
    persist();
    render();
    const labels = { keep: 'behalten', removed: 'als entfernt markiert', later: 'auf später verschoben' };
    notice(`@${clean} wurde ${labels[decision]}.`, 'success');
  }

  function extractUsernameFromUrl(value) {
    try {
      const url = new URL(value);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
      const part = url.pathname.split('/').filter(Boolean)[0] || '';
      return cleanUsername(part);
    } catch (_) {
      return '';
    }
  }

  function extractFromJson(value) {
    const found = new Set();
    const visit = node => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;

      if (Array.isArray(node.string_list_data)) {
        for (const item of node.string_list_data) {
          if (!item || typeof item !== 'object') continue;
          const direct = cleanUsername(item.value || '');
          const fromHref = extractUsernameFromUrl(item.href || '');
          if (direct) found.add(direct);
          if (fromHref) found.add(fromHref);
        }
      }
      if (typeof node.href === 'string') {
        const fromHref = extractUsernameFromUrl(node.href);
        if (fromHref) found.add(fromHref);
      }
      for (const child of Object.values(node)) visit(child);
    };
    visit(value);
    return [...found];
  }

  function extractFromHtml(text) {
    const found = new Set();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('a[href]').forEach(anchor => {
      const username = extractUsernameFromUrl(anchor.getAttribute('href') || '');
      if (username) found.add(username);
    });
    return [...found];
  }

  async function parseExportFile(file) {
    const lower = file.name.toLowerCase();
    const kind = /following/.test(lower) && !/followers/.test(lower)
      ? 'following'
      : /followers/.test(lower)
        ? 'followers'
        : null;
    if (!kind) return { kind: null, usernames: [], file: file.name };

    const text = await file.text();
    let usernames = [];
    if (lower.endsWith('.json') || file.type.includes('json')) {
      try {
        usernames = extractFromJson(JSON.parse(text));
      } catch (_) {
        throw new Error(`${file.name}: JSON konnte nicht gelesen werden.`);
      }
    } else if (lower.endsWith('.html') || lower.endsWith('.htm') || file.type.includes('html')) {
      usernames = extractFromHtml(text);
    }
    return { kind, usernames: cleanUserList(usernames), file: file.name };
  }

  async function importFiles(files) {
    if (!files.length) return;
    notice('Instagram-Daten werden gelesen …');
    const parsed = [];
    try {
      for (const file of files) parsed.push(await parseExportFile(file));
    } catch (error) {
      notice(error.message || 'Import fehlgeschlagen.', 'error');
      return;
    }

    const followerFiles = parsed.filter(v => v.kind === 'followers');
    const followingFiles = parsed.filter(v => v.kind === 'following');
    if (!followerFiles.length || !followingFiles.length) {
      notice('Bitte mindestens eine Followers-Datei und eine Following-Datei aus dem entpackten Instagram-Export auswählen.', 'error');
      return;
    }

    const acc = account();
    acc.followers = cleanUserList(followerFiles.flatMap(v => v.usernames));
    acc.following = cleanUserList(followingFiles.flatMap(v => v.usernames));
    acc.importedAt = new Date().toISOString();
    acc.sourceFiles = parsed.filter(v => v.kind).map(v => v.file);

    const followingSet = new Set(acc.following);
    acc.decisions = Object.fromEntries(Object.entries(acc.decisions).filter(([username]) => followingSet.has(username)));

    if (!persist()) return;
    render();
    notice(`${acc.followers.length} Followers und ${acc.following.length} Following importiert. DG OS synchronisiert den Snapshot …`);
    try {
      const sync = await syncSnapshot(acc, state.active);
      if (sync.synced) {
        const changes = sync.result && sync.result.changes;
        const suffix = changes
          ? ` · +${changes.newFollowers || 0} neue / -${changes.lostFollowers || 0} verlorene Followers`
          : ' · erster Snapshot gespeichert';
        notice(`${acc.followers.length} Followers · ${nonFollowers(acc).length} Cleanup-Kandidaten${suffix}`, 'success');
      } else {
        notice(`${acc.followers.length} Followers lokal importiert. Cloud-Sync folgt, sobald dieses DG-OS-Gerät autorisiert ist.`, 'success');
      }
    } catch (_) {
      notice(`${acc.followers.length} Followers lokal importiert. Cloud-Sync war gerade nicht erreichbar; die lokalen Daten bleiben erhalten.`, 'error');
    }
  }

  function resetAccountData() {
    const acc = account();
    acc.followers = [];
    acc.following = [];
    acc.decisions = {};
    acc.importedAt = null;
    acc.sourceFiles = [];
    persist();
    render();
    notice('Import- und Cleanup-Daten dieses Accounts wurden lokal gelöscht.', 'success');
  }

  function ensureSocialBottomNav() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    let button = nav.querySelector('[data-target="personalSocial"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.target = 'personalSocial';
      button.textContent = 'Social';
      const trading = nav.querySelector('[data-target="tradingWorkspace"]');
      nav.insertBefore(button, trading || null);
    }
    button.dataset.socialBound = 'router';
  }

  function bind() {
    $('openSocialHub').addEventListener('click', () => openWorkspace(state.active));
    document.querySelectorAll('[data-social-open]').forEach(button => {
      button.addEventListener('click', () => openWorkspace(button.dataset.socialOpen));
    });
    document.querySelectorAll('[data-social-account]').forEach(button => {
      button.addEventListener('click', () => {
        state.active = button.dataset.socialAccount;
        persist();
        render();
        loadCloudDashboard(state.active);
        notice('');
      });
    });
    $('socialCloseWorkspace').addEventListener('click', closeWorkspace);
    $('socialSaveHandle').addEventListener('click', saveHandle);
    $('socialHandleInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveHandle();
      }
    });
    $('socialImportFiles').addEventListener('change', event => {
      const files = [...(event.target.files || [])];
      importFiles(files).finally(() => { event.target.value = ''; });
    });
    $('socialWhitelistAdd').addEventListener('click', addWhitelist);
    $('socialWhitelistInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addWhitelist();
      }
    });
    $('socialOpenInstagram').addEventListener('click', event => {
      const username = cleanUsername(event.currentTarget.dataset.username || '');
      if (!username) return;
      window.open(`https://www.instagram.com/${encodeURIComponent(username)}/`, '_blank', 'noopener,noreferrer');
    });
    $('socialDecisionKeep').addEventListener('click', event => setDecision(event.currentTarget.dataset.username, 'keep'));
    $('socialDecisionRemoved').addEventListener('click', event => setDecision(event.currentTarget.dataset.username, 'removed'));
    $('socialDecisionLater').addEventListener('click', event => setDecision(event.currentTarget.dataset.username, 'later'));
    $('socialResetData').addEventListener('click', resetAccountData);
    $('socialStartCleanup').addEventListener('click', () => {
      renderQueue();
      $('socialCleanupSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('socialWorkspace').classList.contains('hidden')) closeWorkspace();
    });
  }

  ensureSocialBottomNav();
  bind();
  render();
  loadCloudDashboard('business');
  loadCloudDashboard('private');
  window.addEventListener('dgos-device-session', () => {
    loadCloudDashboard('business');
    loadCloudDashboard('private');
  });
})();
