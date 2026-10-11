-- DG OS WHOOP: keep rotating user-authorized WHOOP tokens without an open browser.
-- Does NOT change/delete existing WHOOP sessions, token ciphertext or 481+ sleep records.
-- Requires extensions already installed: pg_cron, pg_net, pgcrypto and Supabase Vault.

CREATE TABLE IF NOT EXISTS public.dgos_whoop_keepalive (
  id text PRIMARY KEY CHECK(id='primary'),
  secret_hash text NOT NULL,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_result text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dgos_whoop_keepalive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dgos_whoop_keepalive FROM PUBLIC, anon, authenticated;
GRANT SELECT,UPDATE ON TABLE public.dgos_whoop_keepalive TO service_role;

-- Create the opaque bearer in encrypted Vault; store ONLY a one-way digest
-- for the Supabase Edge Function to verify. Never write the key in cron.job.
DO $create_keepalive_secret$
DECLARE
  generated_secret text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.dgos_whoop_keepalive WHERE id='primary') THEN
    IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='dgos_whoop_keepalive_v1') THEN
      RAISE EXCEPTION 'Existing WHOOP keepalive Vault key cannot be safely overwritten';
    END IF;
    generated_secret=encode(extensions.gen_random_bytes(32),'hex');
    PERFORM vault.create_secret(
      generated_secret,
      'dgos_whoop_keepalive_v1',
      'DG OS WHOOP hourly OAuth refresh: internal cron-only credential'
    );
    INSERT INTO public.dgos_whoop_keepalive(id,secret_hash)
      VALUES ('primary',replace(translate(encode(extensions.digest('dgos-whoop-keepalive:'||generated_secret,'sha256'),'base64'),'+/','-_'),'=',''));
  END IF;
END
$create_keepalive_secret$;

-- The PostgreSQL-owned function is callable by Cron but NOT public clients.
-- Vault decrypts the key only in the server; no secret appears in job SQL,
-- in GitHub, in frontend assets, or in API results.
CREATE OR REPLACE FUNCTION public.dgos_whoop_keepalive_invoke()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $keepalive$
DECLARE
  private_key text;
BEGIN
  SELECT decrypted_secret INTO private_key
  FROM vault.decrypted_secrets
  WHERE name='dgos_whoop_keepalive_v1';
  IF private_key IS NULL THEN
    RAISE EXCEPTION 'WHOOP keepalive Vault secret missing';
  END IF;
  PERFORM net.http_post(
    url:='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/whoop/maintenance',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-DGOS-Keepalive',private_key
    ),
    body:='{}'::jsonb
  );
END;
$keepalive$;
REVOKE ALL ON FUNCTION public.dgos_whoop_keepalive_invoke() FROM PUBLIC, anon, authenticated;

-- Refresh check every 30 minutes even while DG OS is closed. The Edge
-- Function only exchanges WHOOP tokens when within 31 minutes of expiry,
-- and retains the already-existing database rotation lock.
SELECT cron.schedule(
  'dgos-whoop-silent-refresh',
  '*/30 * * * *',
  'SELECT public.dgos_whoop_keepalive_invoke();'
);
