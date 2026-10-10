-- Historic WHOOP sleep analytics. Never expose private health rows over anon REST.
-- User-accessible reads/writes occur ONLY via the authenticated WHOOP edge function.
CREATE TABLE IF NOT EXISTS public.dgos_whoop_sleep_history (
  sleep_date date PRIMARY KEY,
  sleep_start timestamptz,
  wake_time timestamptz,
  duration_min integer NOT NULL CHECK (duration_min BETWEEN 1 AND 1500),
  in_bed_min integer CHECK (in_bed_min BETWEEN 0 AND 1800),
  deep_min integer CHECK (deep_min BETWEEN 0 AND 1500),
  rem_min integer CHECK (rem_min BETWEEN 0 AND 1500),
  light_min integer CHECK (light_min BETWEEN 0 AND 1500),
  awake_min integer CHECK (awake_min BETWEEN 0 AND 1500),
  needed_min integer CHECK (needed_min BETWEEN 0 AND 1800),
  performance integer CHECK (performance BETWEEN 0 AND 100),
  efficiency integer CHECK (efficiency BETWEEN 0 AND 100),
  consistency integer CHECK (consistency BETWEEN 0 AND 100),
  respiratory_rate numeric(5,2),
  source text NOT NULL DEFAULT 'export' CHECK (source IN ('export','whoop_live')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dgos_whoop_sleep_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dgos_whoop_sleep_history FROM anon,authenticated;
CREATE INDEX IF NOT EXISTS dgos_whoop_sleep_history_updated_at_idx
  ON public.dgos_whoop_sleep_history(updated_at DESC);
COMMENT ON TABLE public.dgos_whoop_sleep_history IS
  'Private WHOOP history; no browser table access. Edge function enforces the signed WHOOP owner session.';
