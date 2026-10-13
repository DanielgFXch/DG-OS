-- DG OS TradingView alert transport. Inbound alerts are indicator claims,
-- not confirmed market facts, entry signals or trading orders.
create table if not exists public.dgos_tradingview_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  symbol text not null check (symbol = 'XAUUSD'),
  timeframe text not null,
  event_type text not null check (event_type in (
    'ASIA_HIGH_TOUCHED','ASIA_LOW_TOUCHED','ASIA_HIGH_SWEPT','ASIA_LOW_SWEPT',
    'LONDON_HIGH_TOUCHED','LONDON_LOW_TOUCHED','LONDON_HIGH_SWEPT','LONDON_LOW_SWEPT',
    'NY_HIGH_TOUCHED','NY_LOW_TOUCHED','NY_HIGH_SWEPT','NY_LOW_SWEPT'
  )),
  price numeric not null check (price > 0),
  level_price numeric check (level_price is null or level_price > 0),
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  origin text not null default 'tradingview' check (origin = 'tradingview'),
  evidence_status text not null default 'INDICATOR_REPORTED'
    check (evidence_status = 'INDICATOR_REPORTED'),
  detector text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists dgos_tv_events_recent
  on public.dgos_tradingview_events (event_at desc);
comment on table public.dgos_tradingview_events is
  'DG OS received TradingView indicator alerts. They are unverified reports, never automatic orders.';
alter table public.dgos_tradingview_events enable row level security;
revoke all on public.dgos_tradingview_events from anon, authenticated;
grant select, insert, update, delete on public.dgos_tradingview_events to service_role;
-- Intentionally NO RLS policies for anon/authenticated. Only the server-side
-- service_role (in Supabase Edge Function environment) may access events.
