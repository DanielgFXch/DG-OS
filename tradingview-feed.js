/* DG Trading Brain · private TradingView event history (indicator reports only).
   Device pairing is required. Never treat an alert as an independently confirmed
   market fact, a DG setup, or permission to trade. */
(() => {
  'use strict';
  const root = document.getElementById('dgTradingViewFeed');
  if (!root) return;
  const endpoint = 'https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/dgos-tradingview-feed';
  const $ = id => document.getElementById(id);
  const labels = Object.freeze({
    ASIA_HIGH_TOUCHED: 'Asia High berührt',
    ASIA_LOW_TOUCHED: 'Asia Low berührt',
    ASIA_HIGH_SWEPT: 'Asia High gemeldet: Sweep',
    ASIA_LOW_SWEPT: 'Asia Low gemeldet: Sweep',
    LONDON_HIGH_TOUCHED: 'London High berührt',
    LONDON_LOW_TOUCHED: 'London Low berührt',
    LONDON_HIGH_SWEPT: 'London High gemeldet: Sweep',
    LONDON_LOW_SWEPT: 'London Low gemeldet: Sweep',
    NY_HIGH_TOUCHED: 'NY High berührt',
    NY_LOW_TOUCHED: 'NY Low berührt',
    NY_HIGH_SWEPT: 'NY High gemeldet: Sweep',
    NY_LOW_SWEPT: 'NY Low gemeldet: Sweep'
  });
  const readToken = () => {
    try { return localStorage.getItem('dgos.deviceSession') || ''; }
    catch { return ''; }
  };
  const formatTime = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Zeit unbekannt';
    return new Intl.DateTimeFormat('de-CH', {
      timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(date) + ' CH';
  };
  const formatPrice = value => Number.isFinite(value) && value > 0
    ? value.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const status = (value, state = 'waiting') => {
    const target = $('dgTradingViewFeedStatus');
    if (target) { target.textContent = value; target.dataset.state = state; }
  };
  function notice(message) {
    const host = $('dgTradingViewFeedList');
    if (!host) return;
    host.replaceChildren();
    const item = document.createElement('p');
    item.className = 'dg-tv-empty';
    item.textContent = message;
    host.append(item);
  }
  function render(payload) {
    const events = Array.isArray(payload?.events) ? payload.events.filter(e =>
      e && e.evidenceStatus === 'INDICATOR_REPORTED' &&
      e.symbol === 'XAUUSD' && Object.hasOwn(labels, e.eventType)).slice(0, 12) : [];
    const host = $('dgTradingViewFeedList');
    host.replaceChildren();
    status(events.length ? events.length + ' GEMELDET' : '0 EREIGNISSE',
      events.length ? 'reported' : 'empty');
    if (!events.length) {
      notice('Noch keine echten TradingView-Ereignisse empfangen. Der Feed zeigt keine simulierten Alarme.');
      return;
    }
    for (const event of events) {
      const row = document.createElement('article');
      row.className = 'dg-tv-event';
      const top = document.createElement('div');
      top.className = 'dg-tv-event-top';
      const title = document.createElement('strong');
      title.textContent = labels[event.eventType];
      const tag = document.createElement('span');
      tag.textContent = 'VON TRADINGVIEW GEMELDET';
      top.append(title, tag);
      const desc = document.createElement('p');
      const price = formatPrice(event.price);
      const level = event.level == null ? '' : ' · Level ' + formatPrice(event.level);
      desc.textContent = String(event.timeframe || '—') + ' · Kurs ' + price + level;
      const stamp = document.createElement('small');
      stamp.textContent = 'Kerzenzeit ' + formatTime(event.eventAt) +
        ' · empfangen ' + formatTime(event.receivedAt);
      row.append(top, desc, stamp);
      host.append(row);
    }
  }
  let inflight = false;
  let lastRequest = 0;
  async function refresh(force = false) {
    if (inflight || document.hidden || document.body.dataset.dgosRoute !== 'trading') return;
    if (!force && Date.now() - lastRequest < 15000) return;
    const token = readToken();
    if (!token) {
      status('GERÄT NICHT GEKOPPELT', 'waiting');
      notice('Um private TradingView-Ereignisse zu sehen, verbinde dieses Gerät im Jarvis-Bereich mit Telegram.');
      return;
    }
    inflight = true;
    lastRequest = Date.now();
    status('FEED PRÜFEN', 'loading');
    try {
      const response = await fetch(endpoint + '?limit=12', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(9000)
      });
      if (response.status === 401) {
        status('KOPPLUNG ERFORDERLICH', 'waiting');
        notice('Deine Geräteverbindung ist abgelaufen. Bitte Jarvis erneut mit Telegram koppeln.');
        window.dispatchEvent(new Event('dgos-device-session-invalid'));
        return;
      }
      if (!response.ok) throw Error('HTTP ' + response.status);
      const data = await response.json();
      if (data?.source !== 'TradingView Webhook' ||
          data?.evidenceStatus !== 'INDICATOR_REPORTED' || !Array.isArray(data.events))
        throw Error('invalid_feed');
      render(data);
    } catch {
      status('FEED NICHT ERREICHBAR', 'waiting');
      notice('Der private TradingView-Feed ist momentan nicht erreichbar. Keine gemeldeten Ereignisse sind hier als bestätigt zu verstehen.');
    } finally { inflight = false; }
  }
  $('dgTradingViewFeedRefresh')?.addEventListener('click', () => refresh(true));
  const visibleRefresh = () => refresh(false);
  window.addEventListener('focus', visibleRefresh);
  window.addEventListener('hashchange', visibleRefresh);
  window.addEventListener('popstate', visibleRefresh);
  document.addEventListener('visibilitychange', visibleRefresh);
  window.addEventListener('dgos-device-session', () => refresh(true));
  setInterval(visibleRefresh, 15000);
  visibleRefresh();
})();
