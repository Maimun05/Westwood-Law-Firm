-- ============================================================================
-- 20261021 — Law Library: public Philippine jurisprudence
-- ============================================================================
-- Adds `court_decisions`, a public library of Supreme Court decisions rendered
-- on the site's "Law Library" page (mirroring the reference firm site's
-- structure). It is a content table in the same family as `articles`/`faqs`:
-- a TEXT id derived from the slug, an `is_published` gate, and admin CRUD from
-- the portal's Website Content manager. Visitors read published rows only.
--
-- Deliberately TWO policies (one public SELECT, one admin FOR ALL) rather than
-- the three the older `articles` table carries. The extra
-- `articles_authenticated_select` policy is what produces the
-- `multiple_permissive_policies` advisor finding the linter triage has to
-- accept; admin SELECT is already covered by the FOR ALL policy here.
--
-- The GRANTs are explicit on purpose. The live project's default privileges
-- did NOT cover the 20260918 content tables (the "Admin access is required"
-- failure fixed by 20261007), and the local harness cannot reproduce that gap
-- because it sets ALTER DEFAULT PRIVILEGES. Assert the end state the hard way
-- in scripts/local-pg-validate.sh.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.court_decisions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  gr_no         TEXT NOT NULL,
  division      TEXT,
  decision_date DATE NOT NULL,
  ponente       TEXT,
  category      TEXT,
  summary       TEXT NOT NULL,
  full_text     TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  view_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.court_decisions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Policies
-- ----------------------------------------------------------------------------
-- Visitors read published decisions only.
DROP POLICY IF EXISTS court_decisions_public_select ON public.court_decisions;
CREATE POLICY court_decisions_public_select
ON public.court_decisions FOR SELECT
TO public
USING (is_published = true);

-- Admins manage every row. FOR ALL also grants admin SELECT.
DROP POLICY IF EXISTS court_decisions_admin_all ON public.court_decisions;
CREATE POLICY court_decisions_admin_all
ON public.court_decisions FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

-- ----------------------------------------------------------------------------
-- 3. Indexes + updated_at trigger
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_court_decisions_published
  ON public.court_decisions(is_published, decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_court_decisions_category
  ON public.court_decisions(category);

DROP TRIGGER IF EXISTS court_decisions_updated_at ON public.court_decisions;
CREATE TRIGGER court_decisions_updated_at BEFORE UPDATE ON public.court_decisions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Grants
-- ----------------------------------------------------------------------------
-- anon  : SELECT only — the public site reads published rows.
-- authed: full DML — the admin Content Manager writes; RLS filters the rest.
GRANT SELECT ON public.court_decisions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.court_decisions TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Realtime (guarded, mirrors 20261020)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication not found — skipping realtime registration';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'court_decisions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.court_decisions;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Starter entries
-- ----------------------------------------------------------------------------
-- Three landmark decisions so the page renders on first load. Citations were
-- checked against the Supreme Court E-Library / LawPhil; the summaries are
-- short, factual descriptions of the rulings, and full_text is left NULL for
-- the firm to paste from the official report. Review and replace before the
-- library goes public — an inaccurate citation on a law firm's site is a real
-- liability. ON CONFLICT DO NOTHING keeps this idempotent.
INSERT INTO public.court_decisions
  (id, title, slug, gr_no, division, decision_date, category, summary, is_published, published_at)
VALUES
  (
    'oposa-v-factoran',
    'Oposa v. Factoran, Jr.',
    'oposa-v-factoran',
    'G.R. No. 101083',
    'EN BANC',
    '1993-07-30',
    'Environmental Law',
    'Landmark ruling that allowed minors, represented by their parents, to sue on behalf of themselves and succeeding generations, and recognized the right to a balanced and healthful ecology as enforceable against the State.',
    TRUE,
    NOW()
  ),
  (
    'manila-prince-hotel-v-gsis',
    'Manila Prince Hotel v. Government Service Insurance System',
    'manila-prince-hotel-v-gsis',
    'G.R. No. 122156',
    'EN BANC',
    '1997-02-03',
    'Constitutional Law',
    'Held that the Filipino First policy in the 1987 Constitution is self-executing and that the Manila Hotel forms part of the national patrimony, so the government''s shares could not be sold to a foreign bidder.',
    TRUE,
    NOW()
  ),
  (
    'serrano-v-gallant-maritime-services',
    'Serrano v. Gallant Maritime Services, Inc.',
    'serrano-v-gallant-maritime-services',
    'G.R. No. 167614',
    'EN BANC',
    '2009-03-24',
    'Labor Law',
    'Struck down as unconstitutional the clause in the POEA Standard Employment Contract that capped a seafarer''s disability compensation at twenty percent (20%) of the remaining contract term.',
    TRUE,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_total    INTEGER;
  v_policies INTEGER;
  v_realtime INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM public.court_decisions;
  SELECT count(*) INTO v_policies FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'court_decisions';
  SELECT count(*) INTO v_realtime FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'court_decisions';
  RAISE NOTICE 'court_decisions: % row(s), % policy(ies), realtime=%',
    v_total, v_policies, v_realtime;
END $$;
