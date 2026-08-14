'use strict';

// ---------------------------------------------------------------------------
// TwelveData WebSocket client — Phase C of the Always-On Market Server.
//
// Server-side port of the connection/reconnect logic that already existed
// client-side in app.js's openTdSocket() (browser-only, dies when the tab
// closes). Same protocol, same reconnect-with-backoff behavior — moved to a
// long-running Node process so DG OS can receive price ticks independent of
// any open browser. Uses Node's built-in WebSocket (Node 22, no dependency
// added).
//
// Security: the API key is passed in by the caller (read from
// process.env.TWELVEDATA_API_KEY in server/index.js) and is used only to
// build the connection URL — never logged, never included in any emitted
// event payload, never reachable from outside this module.
// ---------------------------------------------------------------------------

const TD_WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const HEARTBEAT_MS = 10000;
const MAX_RECONNECT_DELAY_MS = 30000;

class TwelveDataSocket {
  // wsUrl is injectable for tests (point at a local mock WS server instead
  // of the real TwelveData endpoint) — same pattern as twelveDataRest.js's
  // baseUrl.
  constructor({ apiKey, symbol = 'XAU/USD', wsUrl = TD_WS_URL, onPrice, onStatusChange }) {
    this.apiKey = apiKey;
    this.symbol = symbol;
    this.wsUrl = wsUrl;
    this.onPrice = onPrice || (() => {});
    this.onStatusChange = onStatusChange || (() => {});

    this.ws = null;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'streaming'
    this.lastPrice = null;
    this.lastTickAt = null;
    this.closedByUser = false;
  }

  setStatus(status) {
    this.status = status;
    this.onStatusChange(status);
  }

  connect() {
    this.closedByUser = false;
    this.setStatus('connecting');
    const ws = new WebSocket(`${this.wsUrl}?apikey=${encodeURIComponent(this.apiKey)}`);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: this.symbol } }));
      this.stopHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'heartbeat' }));
      }, HEARTBEAT_MS);
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (err) { return; }

      if (msg.event === 'subscribe-status') {
        if (msg.status === 'ok') this.setStatus('connected');
        return;
      }

      if (msg.event === 'price' && typeof msg.price === 'number') {
        this.lastPrice = msg.price;
        this.lastTickAt = new Date();
        this.setStatus('streaming');
        this.onPrice({ price: msg.price, at: this.lastTickAt });
      }
    });

    ws.addEventListener('close', () => {
      this.stopHeartbeat();
      if (this.ws !== ws) return; // a newer socket already superseded this one
      this.setStatus('disconnected');
      if (this.closedByUser) return;
      this.reconnectAttempts++;
      const delay = Math.min(3000 * this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
      this.reconnectTimer = setTimeout(() => { if (this.ws === ws) this.connect(); }, delay);
    });

    ws.addEventListener('error', () => { try { ws.close(); } catch (err) {} });
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopHeartbeat();
    if (this.ws) { try { this.ws.close(); } catch (err) {} }
    this.setStatus('disconnected');
  }

  // Public snapshot — exactly the fields Phase D needs, nothing that could
  // leak the key (apiKey is intentionally not included).
  getStatus() {
    return {
      status: this.status,
      lastPrice: this.lastPrice,
      lastTickAt: this.lastTickAt ? this.lastTickAt.toISOString() : null
    };
  }
}

module.exports = { TwelveDataSocket, TD_WS_URL };
