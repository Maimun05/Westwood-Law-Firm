-- ============================================================================
-- 20261005  Security advisor fixes
-- ============================================================================
-- Triage of the Supabase Database Linter report. Each section names the
-- advisory it clears and says whether the finding was a real problem or a
-- by-design pattern the linter cannot see the intent behind.
--
-- REAL PROBLEMS FIXED HERE
--   * rls_disabled_in_public (x3)          legacy tables readable by anyone
--   * public_execute_security_definer      anon could deactivate any account
--   * function_search_path_mutable (x3)    hijackable function bodies
--   * public_bucket_allows_listing         lawyer-photos could be enumerated
--   * rls_policy_always_true (x3)          forged inquiries, open draft reads,
--                                          inquiries_insert_public leftover
--   * auth_rls_initplan (x30+)             per-row auth.uid() re-evaluation
--   * unindexed_foreign_keys (x9)          seq-scan on every parent delete
--
-- DELIBERATELY NOT "FIXED" — see section 13 for the reasoning
--   * security_definer_view (public_lawyers)  it IS the public boundary
--   * multiple_permissive_policies            pairs that encode two rules
--   * unused_index                            no traffic history to judge on
--   * leaked_password_protection              an Auth dashboard setting
--
-- Safe to re-run: every statement is guarded or idempotent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. rls_disabled_in_public — the *_legacy tables
-- ----------------------------------------------------------------------------
-- 20261002 renamed these out of the way and then DISABLED RLS on them "so they
-- stop interfering with policy audits". Disabling RLS does not restrict
-- anything: Supabase grants anon/authenticated blanket table privileges, and
-- RLS is the only gate. So every anonymous visitor could read the old lawyer
-- roster, the old favourites, and the old consultation requests.
--
-- They are kept as a read-only backup, so they are locked down rather than
-- dropped. Nothing in src/ has ever read them.
--
-- To reclaim the space once the backup is no longer wanted:
--   DROP TABLE public.lawyers_legacy, public.saved_lawyers_legacy, public.consultations_legacy;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lawyers_legacy', 'saved_lawyers_legacy', 'consultations_legacy'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- Belt and braces: if a policy is ever added back by accident, RLS is
      -- still on and there is still no grant for the API roles to use.
      RAISE NOTICE 'Locked down public.%', t;
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Retire a resurrected public.consultations
-- ----------------------------------------------------------------------------
-- 20261002 renamed public.consultations to consultations_legacy. But
-- 20260917 declares `CREATE TABLE IF NOT EXISTS public.consultations`, so any
-- run of the full migration chain AFTER that rename re-creates the table from
-- scratch — empty, but carrying consultations_insert_policy (anon INSERT,
-- WITH CHECK true). The owner only ever pastes the combined file, which does
-- not include 20260917, so the live project is unaffected. This closes the
-- hole for anyone who ever replays the whole chain.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.consultations') IS NOT NULL THEN
    FOR pol IN SELECT policyname FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'consultations'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.consultations', pol.policyname);
    END LOOP;
    REVOKE ALL ON TABLE public.consultations FROM anon, authenticated;
    ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
    COMMENT ON TABLE public.consultations IS
      'RESURRECTED BY A MIGRATION REPLAY. Superseded by inquiries + appointments; do not use.';
    RAISE NOTICE 'Retired a resurrected public.consultations';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3. Function search_path
-- ----------------------------------------------------------------------------
-- update_updated_at was declared without a pinned search_path in
-- schema-production.sql. It is not SECURITY DEFINER, but it runs inside the
-- transaction of whoever fired the trigger, so a caller-controlled search_path
-- still decides how NOW() resolves. Pin it.
--
-- NOW() keeps working with an empty path: pg_catalog is always searched
-- implicitly, first.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;


-- ----------------------------------------------------------------------------
-- 4. soft_delete_profile / reactivate_profile — anon could deactivate anyone
-- ----------------------------------------------------------------------------
-- Both are SECURITY DEFINER, both update public.profiles, and neither checked
-- who was calling. They were created with no explicit ACL, so PostgreSQL's
-- default applied: EXECUTE to PUBLIC. In this schema PUBLIC includes anon.
--
--   POST /rest/v1/rpc/soft_delete_profile  {"user_id": "<any uuid>"}
--
-- was therefore a working, unauthenticated "deactivate this account" call for
-- every account in the firm — including admins. reactivate_profile had the
-- mirror problem: it could bring a deliberately disabled account back.
--
-- Nothing in src/ calls either one; they exist for the SQL editor.
--
-- GUARDED ON EXISTENCE, and that matters. These two come from
-- 20260916_add_soft_delete_support.sql, which is NOT part of
-- APPLY_PENDING_MIGRATIONS.sql. Probing the live project confirms it:
--
--   POST /rest/v1/rpc/soft_delete_profile  ->  404 PGRST202 (no such function)
--   POST /rest/v1/rpc/cleanup_old_audit_logs -> 401 42501 (exists, denied)
--
-- A bare CREATE OR REPLACE here would therefore have ADDED two unused,
-- account-mutating functions to a database that did not have them. They are
-- hardened only where they already exist, so a replay of the full migration
-- chain closes the hole and the live project is left alone.
DO $$
BEGIN
  IF to_regprocedure('public.soft_delete_profile(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.soft_delete_profile(user_id UUID)
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
      BEGIN
        -- auth.uid() IS NULL means the SQL editor or service_role, same
        -- convention as cleanup_old_audit_logs.
        IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
          RAISE EXCEPTION 'Only an administrator can deactivate an account';
        END IF;

        UPDATE public.profiles
           SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW()
         WHERE id = user_id;
      END $body$;
    $fn$;
    -- REVOKE ... FROM PUBLIC is the one that matters: the EXECUTE anon
    -- inherited came from the PUBLIC pseudo-role, not from a grant to anon.
    REVOKE ALL ON FUNCTION public.soft_delete_profile(UUID) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.soft_delete_profile(UUID) TO authenticated, service_role;
    RAISE NOTICE 'Hardened public.soft_delete_profile()';
  END IF;

  IF to_regprocedure('public.reactivate_profile(uuid)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.reactivate_profile(user_id UUID)
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
      BEGIN
        IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
          RAISE EXCEPTION 'Only an administrator can reactivate an account';
        END IF;

        UPDATE public.profiles
           SET is_active = TRUE, deleted_at = NULL, updated_at = NOW()
         WHERE id = user_id;
      END $body$;
    $fn$;
    REVOKE ALL ON FUNCTION public.reactivate_profile(UUID) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.reactivate_profile(UUID) TO authenticated, service_role;
    RAISE NOTICE 'Hardened public.reactivate_profile()';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 5. log_auth_event — trigger function exposed over the API
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER, in the public schema, therefore callable as
-- POST /rest/v1/rpc/log_auth_event. It is a trigger function so a direct call
-- errors out harmlessly, but there is no reason for it to be reachable at all.
--
-- Revoking EXECUTE does NOT stop the trigger from firing: PostgreSQL checks
-- EXECUTE when the trigger is CREATED, not each time it fires. Section 10
-- asserts that audit rows still appear after this revoke.
REVOKE ALL ON FUNCTION public.log_auth_event() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. public_bucket_allows_listing — lawyer-photos
-- ----------------------------------------------------------------------------
-- A public bucket serves objects over its public URL without consulting RLS,
-- so the SELECT policy bought nothing except the ability to enumerate every
-- file in the bucket. Nothing in src/ reads or writes this bucket at all, and
-- profiles.profile_image already points at plain URLs, so the policy is simply
-- removed rather than narrowed.
--
-- If a photo manager is ever built, add it back as:
--   CREATE POLICY lawyer_photos_select ON storage.objects FOR SELECT
--     TO authenticated USING (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));
DROP POLICY IF EXISTS lawyer_photos_select ON storage.objects;


-- ----------------------------------------------------------------------------
-- 7. rls_policy_always_true — inquiries INSERT
-- ----------------------------------------------------------------------------
-- WITH CHECK (true) let an anonymous visitor write any value into any column,
-- not just the ones the contact form sends. Two of those columns are not
-- harmless:
--   * assigned_to — insert an inquiry pre-assigned to a partner
--   * client_id   — insert an inquiry into ANOTHER user's portal, where it
--                   shows up as if the firm had logged it for them
--
-- The form (src/utils/api.ts) sends status 'New', no assigned_to, and
-- client_id either null or the signed-in user's own id. The policy now says
-- exactly that. (Only client_id: live inquiries has no user_id column, and an
-- earlier draft of this policy failed on the live project with
-- `42703 column "user_id" does not exist`.)
DROP POLICY IF EXISTS inquiries_insert_policy ON public.inquiries;
CREATE POLICY inquiries_insert_policy ON public.inquiries
FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'New'
  AND assigned_to IS NULL
  AND (client_id IS NULL OR client_id = (SELECT auth.uid()))
);


-- ----------------------------------------------------------------------------
-- 8. Redundant and always-true policies
-- ----------------------------------------------------------------------------
-- articles_authenticated_select (SELECT, authenticated, USING true) let any
-- signed-in client read unpublished drafts. It was also redundant: the
-- admin/author policy already covers everyone who should see a draft, and
-- articles_public_select covers the published ones. Dropping it clears both
-- rls_policy_always_true and the articles multiple-permissive-policies group.
DROP POLICY IF EXISTS articles_authenticated_select ON public.articles;

-- profile_practice_areas_public_select (SELECT, public, USING true) was for the
-- "Our Lawyers" page, but that page reads the public_lawyers view, and a view
-- runs with its owner's rights — it never consults this policy. The only
-- readers left are the admin and own-row policies below it.
DROP POLICY IF EXISTS profile_practice_areas_public_select ON public.profile_practice_areas;

-- inquiries_insert_public (INSERT, anon+authenticated, WITH CHECK true) is a
-- leftover from the ad-hoc schema the live project was built from. 20260918
-- drops it, but 20260918 is not part of this chain and never reached the live
-- project, and no other migration names it. It matters twice over: it trips
-- rls_policy_always_true, and because permissive policies OR together it
-- silently voids section 7 above — anyone could still write any status /
-- assigned_to / client_id into the inquiry queue. The live verification grid
-- caught it ("no always-true policy remains" = FAIL).
DROP POLICY IF EXISTS inquiries_insert_public ON public.inquiries;

-- Sweep anything else with a literal `true` predicate. The verification grid
-- asserts zero of these in public, so this enforces that invariant; on a
-- database built from this chain alone it is a no-op.
DO $$ DECLARE pol RECORD; n INT := 0; BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Dropped always-true policy %.%', pol.tablename, pol.policyname;
    n := n + 1;
  END LOOP;
  IF n > 0 THEN RAISE NOTICE 'Dropped % always-true policy(ies)', n; END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 9. auth_rls_initplan — wrap auth.uid() so it is evaluated once, not per row
-- ----------------------------------------------------------------------------
-- A policy that calls auth.uid() directly is re-evaluated for every row the
-- planner considers. Wrapping it as (SELECT auth.uid()) turns it into an
-- InitPlan evaluated once per query. On a table of a few hundred rows this is
-- a rounding error; the reason to fix it anyway is that the rewrite is purely
-- mechanical and the linter output stays readable for the findings that matter.
--
-- Rewriting from pg_policies rather than from the migration files means the
-- live definitions are what gets fixed, so the result cannot drift from the
-- source the way a hand-copied CREATE POLICY would.
CREATE OR REPLACE FUNCTION private.wrap_auth_calls(p_expr TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v TEXT := p_expr;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  -- Park the already-wrapped forms behind markers. Without this, the
  -- bare-call replacement below would rewrite (SELECT auth.uid()) into
  -- (SELECT (SELECT auth.uid())) — still correct, but it never converges and
  -- the migration would keep reporting changes on every run.
  v := replace(v, 'SELECT auth.uid()',  E'\x01');
  v := replace(v, 'SELECT auth.jwt()',  E'\x02');
  v := replace(v, 'SELECT auth.role()', E'\x03');
  v := replace(v, 'auth.uid()',  '(SELECT auth.uid())');
  v := replace(v, 'auth.jwt()',  '(SELECT auth.jwt())');
  v := replace(v, 'auth.role()', '(SELECT auth.role())');
  v := replace(v, E'\x01', 'SELECT auth.uid()');
  v := replace(v, E'\x02', 'SELECT auth.jwt()');
  v := replace(v, E'\x03', 'SELECT auth.role()');
  RETURN v;
END $$;

DO $$
DECLARE
  pol     RECORD;
  v_qual  TEXT;
  v_check TEXT;
  v_roles TEXT;
  v_sql   TEXT;
  n       INT := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_qual  := private.wrap_auth_calls(pol.qual);
    v_check := private.wrap_auth_calls(pol.with_check);

    IF v_qual IS NOT DISTINCT FROM pol.qual
       AND v_check IS NOT DISTINCT FROM pol.with_check THEN
      CONTINUE;  -- already wrapped, or uses no auth helper at all
    END IF;

    -- pg_policies gives the deparsed predicate, so recreating the policy from
    -- it is a rename of the same expression, not a re-derivation of the rule.
    v_roles := (SELECT string_agg(quote_ident(r), ', ' ORDER BY r)
                FROM unnest(pol.roles) AS r);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    pol.policyname, pol.tablename, pol.permissive, pol.cmd, v_roles);
    IF v_qual  IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;

    EXECUTE v_sql;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Rewrote % policy/policies to evaluate auth helpers once per query', n;
END $$;

DROP FUNCTION IF EXISTS private.wrap_auth_calls(TEXT);


-- ----------------------------------------------------------------------------
-- 10. unindexed_foreign_keys
-- ----------------------------------------------------------------------------
-- Every FK whose columns are not the leading columns of an index. The parent
-- side of ON DELETE then seq-scans the child table. Discovered from the
-- catalogue rather than listed by hand so it also covers whatever the live
-- project has that the migration chain does not.
DO $$
DECLARE
  fk      RECORD;
  v_name  TEXT;
  v_cols  TEXT;
  n       INT := 0;
BEGIN
  FOR fk IN
    SELECT c.conname,
           n.nspname,
           cl.relname,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c
    JOIN pg_class     cl ON cl.oid = c.conrelid
    JOIN pg_namespace n  ON n.oid  = cl.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indisvalid
          -- indkey is an int2vector, which casts to a ZERO-based array.
          -- Slicing it as [1:n] silently yields {} and every FK looks
          -- unindexed, so normalise through array_agg first.
          AND (SELECT array_agg(k ORDER BY ord)
               FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS t(k, ord))
              [1:array_length(c.conkey, 1)] = c.conkey
      )
  LOOP
    v_name := left('idx_fk_' || fk.conname, 63);
    v_cols := fk.cols;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class ic
      JOIN pg_namespace inn ON inn.oid = ic.relnamespace
      WHERE ic.relname = v_name AND inn.nspname = fk.nspname
    ) THEN
      EXECUTE format('CREATE INDEX %I ON %I.%I (%s)',
                     v_name, fk.nspname, fk.relname, v_cols);
      n := n + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Created % missing foreign-key index(es)', n;
END $$;


-- ----------------------------------------------------------------------------
-- 11. Explicit grants, so the chain stops depending on project defaults
-- ----------------------------------------------------------------------------
-- Supabase grants anon/authenticated blanket table privileges through
-- ALTER DEFAULT PRIVILEGES, but that only covers objects created by the roles
-- it was configured for. Every table and function here then relies on a
-- project-level setting that is invisible from the migrations and impossible to
-- reproduce locally — and when it is not in force the failure is confusing:
-- a missing GRANT on a table the policies DO cover shows up as 42501
-- "permission denied for table", which PostgREST reports as **403 on a plain
-- SELECT** rather than as an empty result.
--
-- These grants are already implied on a correctly-configured project, so on
-- most databases this section changes nothing. It exists so the chain is
-- self-sufficient. RLS is still the gate — these grants only let it run.

-- 11a. The four tables 20261001 creates. It revokes them from anon but leaves
-- the grant to authenticated to the project default.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.matter_members, public.matter_notes, public.matter_events,
     public.confidential_access_grants
  TO authenticated, service_role;
REVOKE ALL ON public.matter_members, public.matter_notes, public.matter_events,
  public.confidential_access_grants FROM anon;

-- 11b. The public contact form is anonymous. inquiries_insert_policy is
-- TO anon, authenticated, and src/utils/api.ts deliberately does NOT send
-- inquiry_number — it relies on the column DEFAULT. A DEFAULT expression runs
-- as the inserting role, so an anonymous submission needs EXECUTE on the
-- function and USAGE on the sequence it draws from. schema-production.sql
-- grants both to authenticated only.
--
-- Guarded, because these come from schema-production.sql, which is the live
-- database's original base rather than part of this chain.
DO $$
BEGIN
  IF to_regprocedure('public.generate_inquiry_number()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.generate_inquiry_number() TO anon, authenticated;
  END IF;
  IF to_regclass('public.inquiry_number_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.inquiry_number_seq TO anon, authenticated;
  END IF;

  -- Same shape for matters, for symmetry: generate_matter_number() is only
  -- reachable by admins, who are authenticated, but the sequence grant is the
  -- same class of hidden dependency.
  IF to_regprocedure('public.generate_matter_number()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.generate_matter_number() TO authenticated, service_role;
  END IF;
  IF to_regclass('public.matter_number_seq') IS NOT NULL THEN
    GRANT USAGE, SELECT ON SEQUENCE public.matter_number_seq TO authenticated, service_role;
  END IF;
END $$;

-- 11c. The `private` schema itself. 20261001 creates it with CREATE SCHEMA IF
-- NOT EXISTS and grants nothing on it, and PostgreSQL gives a new schema to its
-- owner only — PUBLIC gets nothing. Every policy on matters, documents and the
-- three matter tables calls a private.* helper, and resolving that call
-- requires USAGE on the schema, so without this grant the tables answer
-- 42501 "permission denied for schema private", which PostgREST reports as 403.
--
-- Only schema-production.sql grants it today. That file is the live database's
-- original base rather than part of this chain (see 11b), so the chain must not
-- rely on it: a fresh database built from migrations alone would break here.
DO $$
BEGIN
  IF to_regnamespace('private') IS NOT NULL THEN
    REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
    GRANT USAGE ON SCHEMA private TO authenticated, service_role;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 12. Verify what is now in force
-- ----------------------------------------------------------------------------
-- Read the output of this block: it is the answer to "did the paste work".
DO $$
DECLARE
  v_leaky    TEXT;
  v_definer  TEXT;
  v_true     TEXT;
  v_mutable  TEXT;
  v_listable TEXT;
  v_audited  INT;
  v_schema   TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_leaky
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    AND (has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT'));

  SELECT string_agg(p.proname, ', ') INTO v_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_true
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (btrim(COALESCE(qual, '')) = 'true' OR btrim(COALESCE(with_check, '')) = 'true');

  SELECT string_agg(p.proname, ', ') INTO v_mutable
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS c
                    WHERE c LIKE 'search_path=%');

  SELECT string_agg(b.id, ', ') INTO v_listable
  FROM storage.buckets b
  JOIN pg_policies p ON p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
  WHERE b.public AND p.roles && ARRAY['anon', 'public']::name[]
    AND (COALESCE(p.qual, '') NOT LIKE '%bucket_id%'
      OR COALESCE(p.qual, '') LIKE '%' || b.id || '%');

  SELECT count(*) INTO v_audited FROM public.audit_logs WHERE event_type = 'ACCOUNT_CREATED';

  SELECT CASE
           WHEN to_regnamespace('private') IS NULL THEN 'schema missing'
           WHEN NOT has_schema_privilege('authenticated', 'private', 'USAGE') THEN 'authenticated cannot USE it'
           WHEN has_schema_privilege('anon', 'private', 'USAGE') THEN 'anon can USE it'
         END INTO v_schema;

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'RLS off and API-readable (want NULL)      : %', COALESCE(v_leaky,   'NULL');
  RAISE NOTICE 'anon-executable SECURITY DEFINER (NULL)   : %', COALESCE(v_definer, 'NULL');
  RAISE NOTICE 'always-true policies (want NULL)          : %', COALESCE(v_true,    'NULL');
  RAISE NOTICE 'mutable search_path functions (want NULL) : %', COALESCE(v_mutable, 'NULL');
  RAISE NOTICE 'public listable buckets (want NULL)       : %', COALESCE(v_listable,'NULL');
  RAISE NOTICE 'ACCOUNT_CREATED audit rows (must be > 0)  : %', v_audited;
  RAISE NOTICE 'private schema access (want NULL)         : %', COALESCE(v_schema,  'NULL');
  RAISE NOTICE '--------------------------------------------------------------';
END $$;


-- ----------------------------------------------------------------------------
-- 13. Findings left in place, on purpose
-- ----------------------------------------------------------------------------
-- These still appear in the dashboard after this migration. They are recorded
-- here so the next person reading the linter does not re-open them.
--
-- security_definer_view — public.public_lawyers
--   The view is the deliberate boundary between the public website and the
--   profiles table. Visitors cannot read profiles at all, so the "Our Lawyers"
--   page reads this view, which runs as its owner and selects ONLY the columns
--   the firm already publishes: name, position, bio, education, work email,
--   photo, city, and practice areas. No phone, address, or birthday.
--
--   Switching it to security_invoker would require granting anon a row policy
--   on profiles, which exposes every other column of every lawyer's profile.
--   That is strictly worse. If the linter result must be empty, the alternative
--   is to materialise the view into a table refreshed by trigger — more moving
--   parts than a marketing page is worth.
--
-- multiple_permissive_policies — 7 groups
--   Each group is two policies that encode two different rules for the same
--   action, not a duplicate that should have been dropped. Merging them with OR
--   would save one policy evaluation per row on tables with tens of rows.
--   Examples:
--     matters UPDATE      admin may edit anything; the assigned lawyer may
--                         advance their own matter (the guard trigger is what
--                         stops a lawyer reassigning it)
--     matter_notes INSERT a lawyer may write internal notes; a client may only
--                         write client-visible notes on their own matter
--   The one true duplicate, articles_authenticated_select, is dropped in
--   section 8.
--
-- unused_index — ~20 indexes
--   This is the one advisory that cannot be judged from the schema. "Unused"
--   means pg_stat_user_indexes has recorded no scans, which is also what a
--   freshly-reset counter or a low-traffic month looks like. Dropping an index
--   that is genuinely load-bearing is far more expensive than keeping one that
--   is not, and these are small tables. Revisit only with real traffic data.
--
-- leaked_password_protection — Auth setting, not a database object
--   Dashboard -> Authentication -> Sign In / Providers -> Email ->
--   "Prevent use of leaked passwords" -> ON. It checks new passwords against
--   HaveIBeenPwned. It costs one request per signup and cannot be set from SQL.
--
-- Related, found while checking the above and worth knowing:
--   schema-production.sql creates idx_profiles_role ON public.profiles(role),
--   and 20260918_content_tables.sql then tries to create a BETTER partial index
--   under the SAME name — `(role) WHERE role IN ('lawyer','admin')`. Because
--   the name was taken, IF NOT EXISTS made that a silent no-op and the partial
--   index was never created. Harmless (the plain index still serves the
--   queries) but the intent did not survive. To claim it:
--     DROP INDEX public.idx_profiles_role;
--     CREATE INDEX idx_profiles_role ON public.profiles(role) WHERE role IN ('lawyer','admin');
