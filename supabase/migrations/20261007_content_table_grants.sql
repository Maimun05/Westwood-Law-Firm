-- ============================================================================
-- CONTENT TABLE GRANTS — the live "Admin access is required" failure
-- ============================================================================
-- Reported 2026-09-30: signed in as an admin, every write on Website Content
-- answered "You do not have permission to change this. Admin access is
-- required." That string comes from friendlyError(), which fires on both
-- "row-level security" and "permission denied". The live project answers
--
--   POST /rest/v1/articles  ->  42501 "permission denied for table articles"
--                               hint: GRANT INSERT ON public.articles TO anon
--
-- i.e. a GRANT-level denial, not an RLS one. The eight content tables were
-- created by 20260918, which is not part of the apply chain, and the project's
-- blanket default privileges did not cover them. §11 of 20261005 already fixed
-- this same class of gap for the four 20261001 tables; these are the rest.
--
-- Note what the local harness can and cannot see: it sets
-- ALTER DEFAULT PRIVILEGES, so every table IT creates is granted
-- automatically and this bug is invisible there. The end state is therefore
-- asserted the hard way in scripts/local-pg-validate.sh — revoke the grants,
-- re-apply THIS file alone, and require them back.
--
-- RLS is still the gate. anon may only read what the public select policies
-- allow, and every write policy on these tables still requires an active
-- admin (or the row's author, for articles). These grants only let the
-- policies run at all.

-- ----------------------------------------------------------------------------
-- 1. Table grants
-- ----------------------------------------------------------------------------
-- anon  : SELECT only — the public site reads published/active rows.
-- authed: full DML — the admin Content Manager writes; RLS filters the rest.
-- Guarded with to_regclass so a database where a table is absent (or was
-- renamed) still completes the paste instead of dying half way.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'practice_areas', 'articles', 'specialists', 'corporate_clients',
    'faqs', 'seminar_events', 'retainer_packages', 'profile_practice_areas'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Re-assert the admin write policies
-- ----------------------------------------------------------------------------
-- Belt and braces for the other half of friendlyError(): if the failure was
-- RLS rather than the grant, it is because the policy is missing or stale on
-- the live project. DROP + CREATE makes the end state deterministic either
-- way, and switches the inline `role = 'admin'` subquery for the hardened
-- private.is_admin() helper that 20261003 installs (active, not deleted).
--
-- Only the write policies are touched. The public select policies are
-- demonstrably in force on the live project — anon reads the content tables
-- today — and rewriting them would change nothing.

DROP POLICY IF EXISTS practice_areas_admin_all ON public.practice_areas;
CREATE POLICY practice_areas_admin_all
ON public.practice_areas FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS articles_author_admin_all ON public.articles;
CREATE POLICY articles_author_admin_all
ON public.articles FOR ALL
TO authenticated
USING (author_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
WITH CHECK (author_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS specialists_admin_all ON public.specialists;
CREATE POLICY specialists_admin_all
ON public.specialists FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS corporate_clients_admin_all ON public.corporate_clients;
CREATE POLICY corporate_clients_admin_all
ON public.corporate_clients FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS faqs_admin_all ON public.faqs;
CREATE POLICY faqs_admin_all
ON public.faqs FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS seminar_events_admin_all ON public.seminar_events;
CREATE POLICY seminar_events_admin_all
ON public.seminar_events FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS retainer_packages_admin_all ON public.retainer_packages;
CREATE POLICY retainer_packages_admin_all
ON public.retainer_packages FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS profile_practice_areas_admin_all ON public.profile_practice_areas;
CREATE POLICY profile_practice_areas_admin_all
ON public.profile_practice_areas FOR ALL
TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));
