-- ============================================================================
-- 20261014  Audit log writes from the browser
-- ============================================================================
-- Reported 2026-10-05, from the signed-in portal:
--
--   POST /rest/v1/audit_logs?select=*  ->  403
--   audit.ts:101  Error logging audit event
--
-- src/lib/services/audit.ts writes with .insert(...).select().single(), i.e.
-- PostgREST runs INSERT ... RETURNING. That single statement needs FOUR things,
-- and the live project is missing all of the ones the chain never supplied:
--
--   1. INSERT privilege for authenticated            (grant)
--   2. an INSERT policy whose WITH CHECK passes      (RLS)
--   3. SELECT privilege for the RETURNING clause     (grant)
--   4. a SELECT policy that can see the new row      (RLS)
--
-- Why live is missing them: the project was built from the ad-hoc
-- schema-production.sql, which enables RLS on audit_logs with SELECT policies
-- only and grants SELECT alone. The two files that add the INSERT path —
-- 20260916_create_audit_logs_table.sql (grants + policies) and
-- 20260918_fix_all_rls_policies.sql (policy rewrite) — are NOT part of the
-- apply chain and never reached the live project. This is the same class of
-- gap 20261007 fixed for the content tables.
--
-- End state, and why each policy looks the way it does:
--   * INSERT  — the browser writes rows attributed to itself (auth.uid()), or
--               unattributed (user_id NULL) for pre-auth events. 20261003's
--               stamp_audit_source trigger decides provenance separately, so
--               this policy does not try to.
--   * SELECT  — own rows, plus every row for an ACTIVE admin. The admin policy
--               goes through private.is_admin() rather than an inline role
--               subquery so a deactivated or soft-deleted account loses the
--               ability (the point of 20261003 §2).
--   * The legacy policy names from schema-production.sql and 20260916 are
--     dropped so the table has exactly one rule per action; leaving the old
--     admin policy in place would OR around the is_active check.
--
-- Safe to re-run: every statement is DROP IF EXISTS or idempotent.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Grants
-- ----------------------------------------------------------------------------
-- PUBLIC and anon get nothing: the audit trail is staff-only. authenticated
-- gets exactly the two privileges the browser path uses, and nothing else —
-- the trail is append-only for users (no UPDATE, no DELETE, no TRUNCATE).
-- service_role gets the lot (it bypasses RLS but still needs the privilege).
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;


-- ----------------------------------------------------------------------------
-- 2. Retire the legacy policies
-- ----------------------------------------------------------------------------
-- From schema-production.sql (select own / select admin) and 20260916
-- (view own / admins view all / authenticated insert).
DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_own ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;


-- ----------------------------------------------------------------------------
-- 3. The policies the browser path needs
-- ----------------------------------------------------------------------------
-- INSERT: users log their own actions. user_id IS NULL is kept from 20260918
-- for the pre-auth events (failed logins etc.) the auth service records.
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
CREATE POLICY audit_logs_insert_policy ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

-- SELECT: own rows — this is also what makes INSERT ... RETURNING visible to
-- the writer, so the .select().single() in audit.ts can read the row back.
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
CREATE POLICY audit_logs_select_policy ON public.audit_logs
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- SELECT: an active admin sees the whole trail. The portal's account-history
-- screen relies on this (getMyAuditLogs does not filter by user for admins).
DROP POLICY IF EXISTS audit_logs_select_admin_policy ON public.audit_logs;
CREATE POLICY audit_logs_select_admin_policy ON public.audit_logs
FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));


-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE v_missing TEXT := '';
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT') THEN
    v_missing := v_missing || ' authenticated-lacks-INSERT';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') THEN
    v_missing := v_missing || ' authenticated-lacks-SELECT';
  END IF;
  IF has_table_privilege('anon', 'public.audit_logs', 'SELECT') THEN
    v_missing := v_missing || ' anon-can-read';
  END IF;
  IF has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.audit_logs', 'DELETE') THEN
    v_missing := v_missing || ' authenticated-can-mutate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'audit_logs'
                   AND policyname = 'audit_logs_insert_policy') THEN
    v_missing := v_missing || ' no-insert-policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'audit_logs'
                   AND policyname = 'audit_logs_select_policy') THEN
    v_missing := v_missing || ' no-select-policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'audit_logs'
                   AND policyname = 'audit_logs_select_admin_policy') THEN
    v_missing := v_missing || ' no-admin-select-policy';
  END IF;

  IF v_missing = '' THEN
    RAISE NOTICE 'audit_logs browser writes: OK (grants + 3 policies in place)';
  ELSE
    RAISE WARNING 'audit_logs browser writes: INCOMPLETE —%', v_missing;
  END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
