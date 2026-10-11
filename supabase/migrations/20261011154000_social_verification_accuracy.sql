-- DG OS Social accuracy: keep historical export counts immutable.
-- Owner-reported Instagram counts are not authenticated live API metrics.
ALTER TABLE public.dgos_social_accounts
  ADD COLUMN IF NOT EXISTS reported_following_count integer
    CHECK (reported_following_count IS NULL OR reported_following_count BETWEEN 0 AND 1000000),
  ADD COLUMN IF NOT EXISTS reported_following_at timestamptz;
-- A person can be present in an old Instagram export without being followed now.
-- Do not misclassify them as an Instagram unfollowing or a protected/kept account.
ALTER TABLE public.dgos_social_relationships
  DROP CONSTRAINT IF EXISTS dgos_social_relationships_decision_check;
ALTER TABLE public.dgos_social_relationships
  ADD CONSTRAINT dgos_social_relationships_decision_check
    CHECK (decision IS NULL OR decision IN ('keep','removed','later','not_following'));
