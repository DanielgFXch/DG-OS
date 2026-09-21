'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const GOOGLE_SCOPES = Object.freeze([GMAIL_SCOPE, CALENDAR_EVENTS_SCOPE, CALENDAR_LIST_SCOPE]);

const ACCOUNTS = Object.freeze({
  business: Object.freeze({ id: 'business', label: 'Business', email: 'imdanielgomes@gmail.com' }),
  private: Object.freeze({ id: 'private', label: 'Privat', email: 'gomesdani1999@gmail.com' })
});

function parseEncryptionKey(value) {
  if (!value || typeof value !== 'string') return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch (_) {
    return null;
  }
}

function b64url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buf.toString('base64url');
}

function fromB64url(value) {
  return Buffer.from(String(value), 'base64url');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function safeEqual(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a);
  if (!Buffer.isBuffer(b)) b = Buffer.from(b);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sanitizeHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBodyData(data) {
  if (!data) return '';
  try { return Buffer.from(data, 'base64url').toString('utf8'); }
  catch (_) { return ''; }
}

function extractMessageBody(payload) {
  const plain = [];
  const html = [];

  function walk(part) {
    if (!part || typeof part !== 'object') return;
    const mime = String(part.mimeType || '').toLowerCase();
    const data = part.body && part.body.data;
    if (data && mime === 'text/plain') plain.push(decodeBodyData(data));
    else if (data && mime === 'text/html') html.push(decodeBodyData(data));
    else if (data && !part.parts && (!mime || mime === 'text/plain')) plain.push(decodeBodyData(data));
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  }

  walk(payload);
  const plainText = plain.join('\n\n').trim();
  if (plainText) return plainText;
  return htmlToText(html.join('\n\n'));
}

function headersToMap(headers) {
  const map = {};
  for (const header of Array.isArray(headers) ? headers : []) {
    if (!header || !header.name) continue;
    map[String(header.name).toLowerCase()] = String(header.value || '');
  }
  return map;
}

function classifyNewsletter(message, headerMap) {
  const labels = Array.isArray(message && message.labelIds) ? message.labelIds : [];
  const precedence = String((headerMap && headerMap.precedence) || '').toLowerCase();
  return labels.includes('CATEGORY_PROMOTIONS') ||
    Boolean(headerMap && headerMap['list-unsubscribe']) ||
    Boolean(headerMap && headerMap['list-id']) ||
    precedence === 'bulk' || precedence === 'list';
}

function buildRawMessage(input) {
  const to = sanitizeHeader(input && input.to);
  const subject = sanitizeHeader(input && input.subject);
  const body = String((input && input.body) || '').replace(/\r?\n/g, '\r\n');
  if (!to || !to.includes('@')) throw new Error('invalid_recipient');
  if (!subject) throw new Error('invalid_subject');

  const lines = [
    'To: ' + to,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit'
  ];
  const inReplyTo = sanitizeHeader(input && input.inReplyTo);
  const references = sanitizeHeader(input && input.references);
  if (inReplyTo) lines.push('In-Reply-To: ' + inReplyTo);
  if (references) lines.push('References: ' + references);
  lines.push('', body);
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

class EncryptedTokenStore {
  constructor(filePath, key) {
    this.filePath = filePath;
    this.key = key;
  }

  read() {
    if (!this.key || !this.filePath || !fs.existsSync(this.filePath)) return {};
    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!stored || stored.v !== 1 || !stored.iv || !stored.tag || !stored.data) return {};
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, fromB64url(stored.iv));
      decipher.setAuthTag(fromB64url(stored.tag));
      const clear = Buffer.concat([decipher.update(fromB64url(stored.data)), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(clear);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  write(value) {
    if (!this.key || !this.filePath) throw new Error('token_store_not_configured');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const payload = JSON.stringify({
      v: 1,
      iv: b64url(iv),
      tag: b64url(cipher.getAuthTag()),
      data: b64url(encrypted)
    });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temp = this.filePath + '.tmp';
    fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }
}

async function mapLimit(items, limit, worker) {
  const list = Array.from(items || []);
  const output = new Array(list.length);
  let index = 0;
  async function next() {
    while (index < list.length) {
      const current = index++;
      output[current] = await worker(list[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, next));
  return output;
}

class GmailIntegration {
  constructor(env) {
    env = env || process.env;
    this.clientId = env.GOOGLE_GMAIL_CLIENT_ID || '';
    this.clientSecret = env.GOOGLE_GMAIL_CLIENT_SECRET || '';
    this.publicBaseUrl = String(env.DGOS_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    this.appUrl = String(env.DGOS_APP_URL || this.publicBaseUrl || '').replace(/\/+$/, '');
    this.key = parseEncryptionKey(env.DGOS_GMAIL_ENCRYPTION_KEY || '');
    const privateDir = env.DGOS_PRIVATE_DATA_DIR || path.resolve(process.cwd(), 'private');
    this.store = new EncryptedTokenStore(path.join(privateDir, 'gmail-tokens.enc.json'), this.key);
    this.tokens = this.store.read();
    this.accessCache = new Map();
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret && this.publicBaseUrl && this.appUrl && this.key);
  }

  get redirectUri() {
    return this.publicBaseUrl + '/api/gmail/oauth/callback';
  }

  _account(accountId) {
    const account = ACCOUNTS[accountId];
    if (!account) throw new Error('unknown_account');
    return account;
  }

  _signed(payload) {
    if (!this.key) throw new Error('gmail_not_configured');
    const body = b64url(JSON.stringify(payload));
    return body + '.' + b64url(hmac(this.key, body));
  }

  _verifySigned(value) {
    if (!this.key || typeof value !== 'string') return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const expected = hmac(this.key, parts[0]);
    let actual;
    try { actual = fromB64url(parts[1]); } catch (_) { return null; }
    if (!safeEqual(expected, actual)) return null;
    try {
      const payload = JSON.parse(fromB64url(parts[0]).toString('utf8'));
      if (!payload || !payload.exp || payload.exp < Date.now()) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  sessionCookie() {
    const token = this._signed({ kind: 'owner', exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    const secure = this.publicBaseUrl.startsWith('https://') ? '; Secure' : '';
    return 'dgos_mail_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' + secure;
  }

  clearSessionCookie() {
    const secure = this.publicBaseUrl.startsWith('https://') ? '; Secure' : '';
    return 'dgos_mail_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure;
  }

  isAuthorized(req) {
    const cookie = String((req && req.headers && req.headers.cookie) || '');
    const match = cookie.match(/(?:^|;\s*)dgos_mail_session=([^;]+)/);
    const payload = match ? this._verifySigned(match[1]) : null;
    return Boolean(payload && payload.kind === 'owner');
  }

  status(req) {
    const authorized = this.configured && this.isAuthorized(req);
    return {
      configured: this.configured,
      authenticated: authorized,
      sameOriginRequired: true,
      accounts: Object.values(ACCOUNTS).map(account => {
        const stored = this.tokens[account.id] || {};
        const connected = authorized ? Boolean(stored.refreshToken) : false;
        const scopes = String(stored.scope || '').split(/\s+/).filter(Boolean);
        const legacyGmailToken = connected && scopes.length === 0;
        return {
          id: account.id,
          label: account.label,
          email: account.email,
          connected,
          gmailConnected: connected && (legacyGmailToken || scopes.includes(GMAIL_SCOPE)),
          calendarConnected: connected && scopes.includes(CALENDAR_EVENTS_SCOPE) && scopes.includes(CALENDAR_LIST_SCOPE)
        };
      })
    };
  }

  authorizationUrl(accountId) {
    if (!this.configured) throw new Error('gmail_not_configured');
    const account = this._account(accountId);
    const state = this._signed({
      kind: 'oauth',
      account: account.id,
      nonce: b64url(crypto.randomBytes(18)),
      exp: Date.now() + 10 * 60 * 1000
    });
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: GOOGLE_SCOPES.join(' '),
      login_hint: account.email,
      state
    });
    return GOOGLE_AUTH_URL + '?' + params.toString();
  }

  async handleOAuthCallback(code, state) {
    if (!this.configured) throw new Error('gmail_not_configured');
    const payload = this._verifySigned(state);
    if (!payload || payload.kind !== 'oauth') throw new Error('invalid_oauth_state');
    const account = this._account(payload.account);
    if (!code) throw new Error('missing_oauth_code');

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      })
    });
    if (!tokenResponse.ok) throw new Error('oauth_token_exchange_failed');
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('oauth_access_token_missing');

    const profileResponse = await fetch(GMAIL_API + '/profile', {
      headers: { Authorization: 'Bearer ' + token.access_token }
    });
    if (!profileResponse.ok) throw new Error('gmail_profile_failed');
    const profile = await profileResponse.json();
    if (String(profile.emailAddress || '').toLowerCase() !== account.email.toLowerCase()) {
      throw new Error('wrong_google_account');
    }

    const previous = this.tokens[account.id] || {};
    const refreshToken = token.refresh_token || previous.refreshToken;
    if (!refreshToken) throw new Error('oauth_refresh_token_missing');
    this.tokens[account.id] = {
      email: account.email,
      refreshToken,
      scope: String(token.scope || previous.scope || ''),
      connectedAt: new Date().toISOString()
    };
    this.store.write(this.tokens);
    this.accessCache.set(account.id, {
      token: token.access_token,
      expiresAt: Date.now() + Math.max(60, Number(token.expires_in || 3600) - 60) * 1000
    });
    return account;
  }

  async _accessToken(accountId, forceRefresh) {
    this._account(accountId);
    const cached = this.accessCache.get(accountId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
    const stored = this.tokens[accountId];
    if (!stored || !stored.refreshToken) throw new Error('account_not_connected');

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: stored.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    if (!response.ok) throw new Error('oauth_refresh_failed');
    const data = await response.json();
    if (!data.access_token) throw new Error('oauth_access_token_missing');
    const entry = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000
    };
    this.accessCache.set(accountId, entry);
    return entry.token;
  }

  async accessToken(accountId) {
    return this._accessToken(accountId, false);
  }

  async _gmailFetch(accountId, resource, options, retried) {
    const accessToken = await this._accessToken(accountId, Boolean(retried));
    const request = Object.assign({}, options || {});
    request.headers = Object.assign({}, request.headers || {}, { Authorization: 'Bearer ' + accessToken });
    const response = await fetch(GMAIL_API + resource, request);
    if (response.status === 401 && !retried) return this._gmailFetch(accountId, resource, options, true);
    if (!response.ok) throw new Error('gmail_api_failed_' + response.status);
    if (response.status === 204) return {};
    return response.json();
  }

  async _metadata(accountId, id) {
    const params = new URLSearchParams({ format: 'metadata' });
    ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Message-ID', 'References']
      .forEach(name => params.append('metadataHeaders', name));
    const message = await this._gmailFetch(accountId, '/messages/' + encodeURIComponent(id) + '?' + params.toString());
    const headers = headersToMap(message.payload && message.payload.headers);
    return {
      id: message.id,
      threadId: message.threadId,
      from: headers.from || 'Unbekannter Absender',
      to: headers.to || '',
      subject: headers.subject || '(Kein Betreff)',
      date: headers.date || '',
      internalDate: message.internalDate || null,
      snippet: message.snippet || '',
      unread: Array.isArray(message.labelIds) && message.labelIds.includes('UNREAD'),
      newsletter: classifyNewsletter(message, headers),
      messageIdHeader: headers['message-id'] || '',
      references: headers.references || ''
    };
  }

  async listMessages(accountId, options) {
    this._account(accountId);
    options = options || {};
    const filter = ['inbox', 'unread', 'newsletters'].includes(options.filter) ? options.filter : 'inbox';
    const userQuery = String(options.query || '').trim().slice(0, 180);
    const queryParts = ['in:inbox'];
    if (filter === 'unread') queryParts.push('is:unread');
    if (userQuery) queryParts.push(userQuery);

    const maxResults = filter === 'newsletters' ? 60 : 25;
    const params = new URLSearchParams({
      q: queryParts.join(' '),
      maxResults: String(maxResults),
      includeSpamTrash: 'false'
    });
    if (options.pageToken) params.set('pageToken', String(options.pageToken).slice(0, 500));
    const list = await this._gmailFetch(accountId, '/messages?' + params.toString());
    const refs = Array.isArray(list.messages) ? list.messages : [];
    const messages = await mapLimit(refs, 6, ref => this._metadata(accountId, ref.id));
    const filtered = filter === 'newsletters' ? messages.filter(message => message.newsletter) : messages;
    return {
      filter,
      messages: filtered,
      nextPageToken: list.nextPageToken || null,
      newsletterRule: 'Gmail Promotions oder Mailinglisten-Metadaten (List-Unsubscribe/List-Id/Precedence)'
    };
  }

  async getMessage(accountId, messageId) {
    this._account(accountId);
    const message = await this._gmailFetch(accountId, '/messages/' + encodeURIComponent(messageId) + '?format=full');
    const headers = headersToMap(message.payload && message.payload.headers);
    const body = extractMessageBody(message.payload);
    const hasAttachments = (function scan(part) {
      if (!part || typeof part !== 'object') return false;
      if (part.filename && part.body && part.body.attachmentId) return true;
      return Array.isArray(part.parts) && part.parts.some(scan);
    })(message.payload);
    return {
      id: message.id,
      threadId: message.threadId,
      from: headers.from || 'Unbekannter Absender',
      to: headers.to || '',
      subject: headers.subject || '(Kein Betreff)',
      date: headers.date || '',
      body: body || message.snippet || '',
      unread: Array.isArray(message.labelIds) && message.labelIds.includes('UNREAD'),
      newsletter: classifyNewsletter(message, headers),
      messageIdHeader: headers['message-id'] || '',
      references: headers.references || '',
      hasAttachments
    };
  }

  async trashMessages(accountId, messageIds) {
    this._account(accountId);
    const ids = Array.from(new Set(Array.isArray(messageIds) ? messageIds : []))
      .filter(id => typeof id === 'string' && id.length > 0 && id.length < 200)
      .slice(0, 50);
    if (!ids.length) throw new Error('no_messages_selected');
    await mapLimit(ids, 5, id => this._gmailFetch(accountId, '/messages/' + encodeURIComponent(id) + '/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }));
    return { trashed: ids.length };
  }

  async sendMessage(accountId, input) {
    this._account(accountId);
    const raw = buildRawMessage(input || {});
    const payload = { raw };
    if (input && input.threadId) payload.threadId = String(input.threadId).slice(0, 200);
    const sent = await this._gmailFetch(accountId, '/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { id: sent.id, threadId: sent.threadId };
  }
}

module.exports = {
  GmailIntegration,
  ACCOUNTS,
  GMAIL_SCOPE,
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_LIST_SCOPE,
  GOOGLE_SCOPES,
  classifyNewsletter,
  extractMessageBody,
  buildRawMessage,
  htmlToText
};
