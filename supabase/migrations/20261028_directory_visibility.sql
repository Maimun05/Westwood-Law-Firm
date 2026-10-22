-- ============================================================================
-- 20261028 — Public directory visibility
-- ============================================================================
-- The firm lists one lawyer: Atty. Ernesto "Boyet" Tabao. A second lawyer
-- account exists (the owner's own login, seeded as "Sample Lawyer") so the
-- four-eyes task review and the matter-team rules can be exercised. It is not
-- a directory entry: it has no bio or photo and its display name is a
-- placeholder, but 20261026 left every role = 'lawyer' row in the view.
--
-- Rather than special-casing an email inside the view, profiles gets an
-- explicit flag. TRUE by default, so a lawyer appears in the directory unless
-- someone turns it off; the account keeps working exactly as before.
--
-- Safe to run twice. The UPDATE only matches rows that are still listed, and
-- ADD COLUMN IF NOT EXISTS is a no-op on the second run.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_directory BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.show_in_directory IS
  'When false the profile is hidden from the public Our Lawyers directory. The account still signs in and works normally.';

-- ----------------------------------------------------------------------------
-- 1. Hide the placeholder second-lawyer account
-- ----------------------------------------------------------------------------
-- Matched by email, not id: ids differ between projects, emails are what the
-- seed created and what the live project holds.
UPDATE public.profiles
SET show_in_directory = FALSE,
    updated_at = NOW()
WHERE lower(email) = 'flores.augosteras.gapasin@gmail.com'
  AND show_in_directory;

-- ----------------------------------------------------------------------------
-- 2. Rebuild the directory view so it honours the flag
-- ----------------------------------------------------------------------------
-- Same column list as 20261023/20261026 — only the WHERE clause changes, so
-- CREATE OR REPLACE is legal and the existing GRANT survives.
CREATE OR REPLACE VIEW public.public_lawyers AS
SELECT p.id, p.email, p.honorific, p.first_name, p.nickname, p.middle_name, p.last_name, p.suffix, p.full_name,
       p.position, p.bio, p.education, p.bar_admissions, p.experience_years, p.profile_image,
       p.linkedin_url, p.display_order, p.city,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'name', pa.name, 'slug', pa.slug, 'icon', pa.icon)
                                  ORDER BY pa.display_order)
                 FROM public.profile_practice_areas ppa
                 JOIN public.practice_areas pa ON pa.id = ppa.practice_area_id AND pa.is_active
                 WHERE ppa.profile_id = p.id), '[]'::JSONB) AS practice_areas
FROM public.profiles p
WHERE p.role = 'lawyer'
  AND COALESCE(p.is_active, TRUE)
  AND p.deleted_at IS NULL
  AND p.show_in_directory;

GRANT SELECT ON public.public_lawyers TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Verification — read the grid
-- ----------------------------------------------------------------------------
-- expect: 2 lawyers, 1 directory row, 1 hidden, and the one row is Atty. Tabao.
SELECT 'lawyers'                AS metric, count(*)::TEXT AS value
FROM public.profiles WHERE role = 'lawyer'
UNION ALL
SELECT 'public_lawyers rows',   count(*)::TEXT
FROM public.public_lawyers
UNION ALL
SELECT 'hidden from directory', count(*)::TEXT
FROM public.profiles WHERE role = 'lawyer' AND NOT show_in_directory
UNION ALL
SELECT 'listed',                COALESCE(string_agg(full_name, ', ' ORDER BY display_order), '(none)')
FROM public.public_lawyers;
