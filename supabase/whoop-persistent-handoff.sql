-- DG OS v0.56.1 — WHOOP cross-context device handoff
-- Applied to Supabase project jzvnmhfhyvmmbontsoej.
-- Service-only table used to transfer a WHOOP session from an OAuth callback
-- in Safari back into the original installed DG OS PWA/native web context.

create table if not exists public.dgos_whoop_device_claims (
  state_hash text primary key,
  claim_hash text not null unique,
  session_cipher text,
  session_iv text,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists dgos_whoop_device_claims_expiry_idx
  on public.dgos_whoop_device_claims (expires_at);

alter table public.dgos_whoop_device_claims enable row level security;

revoke all on public.dgos_whoop_device_claims from anon, authenticated;
grant select, insert, update, delete on public.dgos_whoop_device_claims to service_role;
