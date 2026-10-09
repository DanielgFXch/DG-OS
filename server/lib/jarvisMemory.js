'use strict';

// DG-OS personal memory adapter. Never uses service_role or touches trading rules.
const PROJECT_REF = 'jzvnmhfhyvmmbontsoej';
const API_BASE = 'https://' + PROJECT_REF + '.supabase.co';
const CATEGORIES = new Set(['profile','preference','goal','project','routine','person','knowledge','note','other']);

class MemoryError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
class JarvisMemory {
  constructor(env = process.env, request = fetch) {
    this.key = env.DGOS_SUPABASE_PUBLISHABLE_KEY || '';
    this.request = request;
    this.configured = Boolean(this.key && /^(sb_publishable_|eyJ)/.test(this.key));
  }
  async identity(req) {
    if (!this.configured) throw new MemoryError('memory_not_configured', 503);
    const header = String(req.headers.authorization || '');
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
    if (!match) throw new MemoryError('memory_auth_required', 401);
    const token = match[1];
    const response = await this.request(API_BASE + '/auth/v1/user', {
      headers: { apikey: this.key, Authorization: 'Bearer ' + token }
    });
    if (!response.ok) throw new MemoryError('memory_auth_required', 401);
    const user = await response.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(user.id || '')) || user.is_anonymous) {
      throw new MemoryError('memory_auth_required', 401);
    }
    return { userId: user.id, token };
  }
  async rest(identity, endpoint, method = 'GET', payload) {
    const response = await this.request(API_BASE + '/rest/v1/' + endpoint, {
      method,
      headers: {
        apikey: this.key,
        Authorization: 'Bearer ' + identity.token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    if (!response.ok) throw new MemoryError('memory_database_error', 502);
    return response.json();
  }
  async list(identity, { category, query, limit = 30 } = {}) {
    if (category && !CATEGORIES.has(category)) throw new MemoryError('invalid_category', 400);
    const params = new URLSearchParams({
      select: 'id,category,title,content,importance,confidence,status,confirmed_by_user,created_at,updated_at',
      owner_id: 'eq.' + identity.userId,
      status: 'eq.active',
      order: 'updated_at.desc',
      limit: String(Math.min(100, Math.max(1, Number(limit) || 30)))
    });
    if (category) params.set('category', 'eq.' + category);
    // Avoid injecting user expressions into PostgREST filters; search can be done client-side.
    const items = await this.rest(identity, 'dgos_memory_items?' + params);
    const needle = String(query || '').trim().toLocaleLowerCase();
    return needle ? items.filter(i => (i.title + ' ' + i.content).toLocaleLowerCase().includes(needle)) : items;
  }
  async create(identity, data = {}) {
    const title = String(data.title || '').trim();
    const content = String(data.content || '').trim();
    if (!CATEGORIES.has(data.category) || !title || title.length > 240 || !content || content.length > 20000)
      throw new MemoryError('invalid_memory', 400);
    // Strategy rules are immutable in rules/strategy.md; reject attempts to treat memories as strategy.
    if (data.category === 'trading_strategy' || data.proposed_change || data.strategy_override)
      throw new MemoryError('strategy_changes_not_allowed', 400);
    const result = await this.rest(identity, 'dgos_memory_items', 'POST', {
      owner_id: identity.userId,
      category: data.category,
      title,
      content,
      importance: 3,
      confirmed_by_user: data.confirmed_by_user === true
    });
    return result[0];
  }
}
module.exports = { JarvisMemory, MemoryError };
