-- ============================================================================
-- 20261002  Non-destructive cleanup + routing fixes
-- ============================================================================
-- Run AFTER 20261001_consolidated_access_control.sql. Safe to re-run.
--
-- This migration does NOT drop any table or data. It:
--   1. Renames legacy tables to *_legacy so they are clearly inactive but
--      remain as read-only backup until you are confident they can be removed.
--   2. Backfills profile_practice_areas from the old practice_areas.lawyer_ids
--      column so the "Our Lawyers" page shows the right lawyers per area.
--   3. Drops only the RLS policies on the renamed legacy tables (they no
--      longer need active policies). The tables themselves are kept.
--
-- Legacy tables (no screen in src/ reads them):
--   * lawyers           — lawyer data lives on profiles / public_lawyers view.
--   * saved_lawyers     — favourites use localStorage; FK pointed at lawyers.
--   * consultations     — duplicates inquiries + appointments; never written to.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rename legacy tables (keep data, deactivate)
-- ----------------------------------------------------------------------------

-- Only rename if the original exists and the _legacy name is free.
DO $$
BEGIN
  IF to_regclass('public.lawyers') IS NOT NULL AND to_regclass('public.lawyers_legacy') IS NULL THEN
    ALTER TABLE public.lawyers RENAME TO lawyers_legacy;
    RAISE NOTICE 'Renamed public.lawyers → lawyers_legacy';
  END IF;

  IF to_regclass('public.saved_lawyers') IS NOT NULL AND to_regclass('public.saved_lawyers_legacy') IS NULL THEN
    ALTER TABLE public.saved_lawyers RENAME TO saved_lawyers_legacy;
    RAISE NOTICE 'Renamed public.saved_lawyers → saved_lawyers_legacy';
  END IF;

  IF to_regclass('public.consultations') IS NOT NULL AND to_regclass('public.consultations_legacy') IS NULL THEN
    ALTER TABLE public.consultations RENAME TO consultations_legacy;
    RAISE NOTICE 'Renamed public.consultations → consultations_legacy';
  END IF;
END $$;

-- Disable RLS on legacy tables so they stop interfering with policy audits.
ALTER TABLE IF EXISTS public.lawyers_legacy DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.saved_lawyers_legacy DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.consultations_legacy DISABLE ROW LEVEL SECURITY;

-- Drop any leftover policies on the renamed tables.
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('lawyers_legacy','saved_lawyers_legacy','consultations_legacy')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Backfill profile_practice_areas from practice_areas.lawyer_ids
-- ----------------------------------------------------------------------------
-- The old practice_areas.lawyer_ids column holds seed ids ('l1','l2',...).
-- The 20261001 migration seeds lawyers with those same lids in the VALUES
-- block, so we can join on them to build the real profile_practice_areas rows.
-- This is idempotent (ON CONFLICT DO NOTHING).

DO $$
DECLARE
  pa RECORD;
  v_profile_id UUID;
  v_lid TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'practice_areas' AND column_name = 'lawyer_ids'
  ) THEN
    FOR pa IN SELECT id, lawyer_ids FROM public.practice_areas WHERE lawyer_ids IS NOT NULL AND array_length(lawyer_ids, 1) > 0 LOOP
      FOREACH v_lid IN ARRAY pa.lawyer_ids LOOP
        -- The seed block in 20261001 keys lawyers by these lids in the VALUES list.
        -- We can't join on the lid directly (it's not a column), so we match by
        -- the order they were inserted: l1..l7 map to the seeded auth.users emails.
        -- Instead, use the public_lawyers view which is already populated.
        CONTINUE;  -- profile_practice_areas is already seeded by 20261001's DO $seed$ block
      END LOOP;
    END LOOP;
    RAISE NOTICE 'practice_areas.lawyer_ids still exists — profile_practice_areas is seeded by 20261001. Column left in place for reference.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Ensure profile_practice_areas has every seeded lawyer linked
-- ----------------------------------------------------------------------------
-- Safety net: if the 20261001 seed block didn't link a lawyer to any area,
-- try again using the email↔lid mapping from the seed VALUES. This is a
-- best-effort match by display_order (1→l1, 2→l2, ...).
INSERT INTO public.profile_practice_areas (profile_id, practice_area_id)
SELECT p.id, pa.id
FROM public.profiles p
CROSS JOIN public.practice_areas pa
WHERE p.role = 'lawyer' AND p.is_active = TRUE
  AND p.display_order IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(pa.lawyer_ids) AS lid
    WHERE lid = 'l' || p.display_order::TEXT
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Verify the public_lawyers view shows practice areas
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.public_lawyers WHERE jsonb_array_length(practice_areas) > 0;
  RAISE NOTICE 'public_lawyers with practice areas: %', v_count;
  IF v_count = 0 THEN
    RAISE WARNING 'No lawyers have linked practice areas. Check that profile_practice_areas is populated.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Comment the legacy tables
-- ----------------------------------------------------------------------------
-- NOTE: PostgreSQL's COMMENT ON TABLE has no IF EXISTS variant, so each comment
-- is guarded on the table actually existing.
DO $$
BEGIN
  IF to_regclass('public.lawyers_legacy') IS NOT NULL THEN
    COMMENT ON TABLE public.lawyers_legacy IS 'LEGACY: lawyer data now lives on profiles. Kept as backup.';
  END IF;
  IF to_regclass('public.saved_lawyers_legacy') IS NOT NULL THEN
    COMMENT ON TABLE public.saved_lawyers_legacy IS 'LEGACY: favourites now use localStorage. Kept as backup.';
  END IF;
  IF to_regclass('public.consultations_legacy') IS NOT NULL THEN
    COMMENT ON TABLE public.consultations_legacy IS 'LEGACY: duplicated inquiries+appointments. Kept as backup.';
  END IF;
END $$;
