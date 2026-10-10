-- WHOOP rotates its refresh token for every successful exchange.
-- Protect concurrent Edge Function isolates against simultaneous refreshes.
-- Existing encrypted tokens and sessions remain untouched.
ALTER TABLE public.dgos_whoop_tokens
  ADD COLUMN IF NOT EXISTS refresh_lock_id text,
  ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz;

COMMENT ON COLUMN public.dgos_whoop_tokens.refresh_lock_id IS
  'Short-lived opaque exclusive lease for WHOOP refresh-token rotation';
COMMENT ON COLUMN public.dgos_whoop_tokens.refresh_lock_until IS
  'Expiration of exclusive WHOOP refresh lease; cleared after refresh';
