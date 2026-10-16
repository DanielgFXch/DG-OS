-- DG Jarvis Vantage chart snapshots: INDICATOR REPORTED, NEVER verified fact or trade.
-- Created separately from the existing dgos_tradingview_events, which remains unchanged.
create table if not exists public.dgos_vantage_snapshots (
  event_key text primary key,
  event_type text not null check (event_type in ('SESSION_LEVELS','HTF_BAR_CLOSED')),
  symbol text not null check (symbol = 'VANTAGE:XAUUSD'),
  timeframe text not null,
  session_name text check (session_name is null or session_name in ('ASIA','LONDON','NY')),
  session_day date,
  phase text check (phase is null or phase in ('FORMING','FINAL')),
  high_price numeric not null check (high_price > 0),
  low_price numeric not null check (low_price > 0 and low_price <= high_price),
  open_price numeric,
  close_price numeric,
  candle_start_at timestamptz,
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  source_type text not null default 'TRADINGVIEW_INDICATOR'
    check (source_type = 'TRADINGVIEW_INDICATOR'),
  evidence_status text not null default 'INDICATOR_REPORTED'
    check (evidence_status = 'INDICATOR_REPORTED'),
  session_timezone text not null default 'Europe/Zurich'
    check (session_timezone = 'Europe/Zurich'),
  constraint dgos_vantage_snapshot_shape check (
     (event_type = 'SESSION_LEVELS' and session_name is not null and session_day is not null
       and phase is not null and open_price is null and close_price is null and candle_start_at is null)
  or (event_type = 'HTF_BAR_CLOSED' and session_name is null and session_day is null
       and phase is null and open_price is not null and close_price is not null
       and candle_start_at is not null and open_price between low_price and high_price
       and close_price between low_price and high_price)
  )
);
create index if not exists dgos_vantage_snapshots_recent
  on public.dgos_vantage_snapshots (event_at desc);
create index if not exists dgos_vantage_snapshots_session
  on public.dgos_vantage_snapshots (session_day desc, session_name, phase);
comment on table public.dgos_vantage_snapshots is
  'Private TradingView Vantage bridge snapshots. These are unverified indicator observations, not DG-verified prices and never orders.';
alter table public.dgos_vantage_snapshots enable row level security;
revoke all on public.dgos_vantage_snapshots from anon, authenticated;
grant select, insert, update, delete on public.dgos_vantage_snapshots to service_role;
-- No public RLS policies: private service-role-only snapshots.
