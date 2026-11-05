-- DG OS Jarvis personal trading coach: explicit, owner-rated SMC examples ONLY.
-- The owner never exposes broker credentials, unverified profits or trade automation.
-- There is no direct client grant or public RLS policy: access is exclusively
-- through an Edge Function that validates the existing paired-device token.
CREATE TABLE IF NOT EXISTS public.dgos_trading_coach_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_chat_id text NOT NULL CHECK (char_length(owner_chat_id) BETWEEN 1 AND 100),
  symbol text NOT NULL DEFAULT 'XAUUSD' CHECK (symbol = 'XAUUSD'),
  label text NOT NULL CHECK (label IN ('good','avoid','missed')),
  side text NOT NULL CHECK (side IN ('buy','sell','watch')),
  session text NOT NULL CHECK (session IN ('asia','london','new_york','zvieri','other')),
  timeframe text NOT NULL CHECK (timeframe IN ('m1','m5','m15','h1','h4','d1')),
  liquidity text NOT NULL CHECK (liquidity IN ('sweep','touch','none','unknown')),
  zone text NOT NULL CHECK (zone IN ('fvg','order_block','ote','breaker','none','unknown')),
  confirmation text NOT NULL CHECK (confirmation IN ('m5_engulfing','m1_structure','bos_choch','rejection','none','unknown')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 800),
  result_r numeric(7,2) NULL CHECK (result_r BETWEEN -20 AND 100),
  source text NOT NULL DEFAULT 'owner_manual' CHECK (source = 'owner_manual'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dgos_trading_coach_owner_time_idx
  ON public.dgos_trading_coach_examples (owner_chat_id, created_at DESC);
ALTER TABLE public.dgos_trading_coach_examples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dgos_trading_coach_examples FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.dgos_trading_coach_examples TO service_role;
COMMENT ON TABLE public.dgos_trading_coach_examples IS
 'Private Jarvis SMC setup reviews. User preferences and self-reported R are NOT independently verified performance or actual orders.';
