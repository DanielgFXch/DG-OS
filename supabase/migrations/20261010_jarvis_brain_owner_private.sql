-- Jarvis Brain backend for the EXISTING DG-OS production project.
-- Supabase Auth has no users, so the old preparation tables requiring
-- auth.users FK cannot yet serve the Telegram-paired Jarvis owner.
-- Read/write access is ONLY via jarvis-brain Edge Function, checking the
-- existing paired device hash AND the owner Telegram chat ID.
CREATE TABLE IF NOT EXISTS public.dgos_jarvis_brain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_chat_id text NOT NULL CHECK (char_length(owner_chat_id) BETWEEN 1 AND 100),
  category text NOT NULL CHECK (category IN ('profile','preference','goal','project','routine','note')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  content text NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 2000),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dgos_jarvis_brain_owner_idx ON public.dgos_jarvis_brain (owner_chat_id, updated_at DESC);
ALTER TABLE public.dgos_jarvis_brain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dgos_jarvis_brain FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dgos_jarvis_brain TO service_role;
COMMENT ON TABLE public.dgos_jarvis_brain IS 'Owner-confirmed personal Jarvis memories, only via Telegram device pairing; never changes trading strategy.';
