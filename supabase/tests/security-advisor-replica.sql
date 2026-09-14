-- ============================================================================
-- Local replica of the Supabase Database Linter
-- ============================================================================
-- The dashboard linter is the source of truth, but it only runs against the
-- live project, which means "did my fix work?" otherwise costs a paste into
-- the SQL Editor and a page refresh. This reproduces the same checks against
-- the throwaway cluster in scripts/local-pg-validate.sh so a fix can be proven
-- before it is handed over.
--
--   psql -f supabase/tests/security-advisor-replica.sql
--
-- Every row returned is a finding. Zero rows = the linter is clean.
--
-- Checks NOT covered here, on purpose:
--   * unused_index          — needs pg_stat_user_indexes history; a freshly
--                             built cluster has no usage data, so everything
--                             would look unused.
--   * leaked_password_protection — an Auth setting, not a database object.
-- ============================================================================

WITH
-- ---------------------------------------------------------------------------
-- 1. rls_disabled_in_public
--    A table in `public` with RLS off that anon/authenticated can still SELECT.
-- ---------------------------------------------------------------------------
rls_disabled AS (
  SELECT 'rls_disabled_in_public' AS check_name,
         c.relname              AS object,
         'anon or authenticated holds SELECT and RLS is off' AS detail
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND (has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT'))
),

-- ---------------------------------------------------------------------------
-- 2. security_definer_view
--    A view that runs with its owner's rights, so it reads the underlying
--    tables past their RLS policies.
-- ---------------------------------------------------------------------------
definer_views AS (
  SELECT 'security_definer_view',
         c.relname,
         'runs as owner; underlying RLS is bypassed'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}'::text[])) AS o
      WHERE o = 'security_invoker=true'
    )
),

-- ---------------------------------------------------------------------------
-- 3. auth_rls_initplan
--    A policy that calls auth.uid()/jwt()/role() directly. Postgres then
--    re-evaluates it once per row instead of once per query. The fix is to
--    wrap the call as (SELECT auth.uid()) so it becomes an InitPlan.
--
--    Detection: the deparser renders a wrapped call as `( SELECT auth.uid()
--    AS uid)`, so strip `SELECT auth.uid()` (no parens) rather than
--    `(SELECT auth.uid())`, then look for a leftover bare call.
-- ---------------------------------------------------------------------------
policy_exprs AS (
  SELECT tablename, policyname,
         COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS expr
  FROM pg_policies
  WHERE schemaname = 'public'
),
initplan AS (
  SELECT 'auth_rls_initplan',
         tablename || '.' || policyname,
         left(btrim(expr), 90)
  FROM policy_exprs
  WHERE replace(replace(replace(expr,
            'SELECT auth.uid()',  'SELECT x'),
            'SELECT auth.jwt()',  'SELECT x'),
            'SELECT auth.role()', 'SELECT x') ~ 'auth\.(uid|jwt|role)\(\)'
),

-- ---------------------------------------------------------------------------
-- 4. function_search_path_mutable
--    A function without a pinned search_path can be hijacked by creating a
--    same-named object in a schema earlier in the caller's path.
-- ---------------------------------------------------------------------------
mutable_path AS (
  SELECT 'function_search_path_mutable',
         p.proname,
         pg_get_function_identity_arguments(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    -- Extension members (pgcrypto's uuid_ns_*, digest, ...) land in whatever
    -- schema the extension was installed into and are not ours to pin.
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
    )
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS c
      WHERE c LIKE 'search_path=%'
    )
),

-- ---------------------------------------------------------------------------
-- 5. multiple_permissive_policies
--    Two permissive policies for the same action on the same table are both
--    evaluated for every row.
-- ---------------------------------------------------------------------------
multi_policies AS (
  SELECT 'multiple_permissive_policies',
         tablename || ' / ' || cmd,
         string_agg(policyname, ', ' ORDER BY policyname)
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
  GROUP BY tablename, cmd, roles
  HAVING count(*) > 1
),

-- ---------------------------------------------------------------------------
-- 6. unindexed_foreign_keys
--    An FK whose columns are not the leading columns of any valid index, so
--    every delete on the parent has to seq-scan the child.
-- ---------------------------------------------------------------------------
unindexed_fks AS (
  SELECT 'unindexed_foreign_keys',
         c.conrelid::regclass::text,
         c.conname || ' (' || pg_get_constraintdef(c.oid) || ')'
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.connamespace = 'public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND i.indisvalid
        -- indkey is int2vector, which casts to a 0-based array. Slicing it
        -- with [1:n] silently returns {} and every FK looks unindexed, so
        -- normalise through array_agg first.
        AND (SELECT array_agg(k ORDER BY ord)
             FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS t(k, ord))
            [1:array_length(c.conkey, 1)] = c.conkey
    )
),

-- ---------------------------------------------------------------------------
-- 7. public_bucket_allows_listing
--    A public bucket with a SELECT policy on storage.objects. Public URLs
--    work without any policy, so the policy only adds the ability to
--    enumerate every file in the bucket.
-- ---------------------------------------------------------------------------
listable_buckets AS (
  SELECT 'public_bucket_allows_listing',
         b.id,
         'SELECT policy "' || p.policyname || '" lets ' || array_to_string(p.roles, '/') || ' list the bucket'
  FROM storage.buckets b
  JOIN pg_policies p
    ON p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
  WHERE b.public
    AND (p.roles && ARRAY['anon', 'authenticated', 'public']::name[])
    -- A policy only exposes THIS bucket if it does not mention bucket_id at
    -- all, or mentions this bucket's id. Without this, the private-bucket
    -- policy (bucket_id = 'documents') reads as if it opened every bucket.
    AND (COALESCE(p.qual, '') NOT LIKE '%bucket_id%'
      OR COALESCE(p.qual, '') LIKE '%' || b.id || '%')
),

-- ---------------------------------------------------------------------------
-- 8. public_execute_security_definer
--    A SECURITY DEFINER function in `public` that anon can execute. These run
--    with the definer's rights, so an accidental one is a privilege bypass.
-- ---------------------------------------------------------------------------
anon_definer AS (
  SELECT 'public_execute_security_definer',
         p.proname,
         'executable by anon (proacl ' || COALESCE(p.proacl::text, 'NULL = default PUBLIC EXECUTE') || ')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
),

-- ---------------------------------------------------------------------------
-- 9. rls_policy_always_true
--    A policy with a literal `true` predicate, i.e. no restriction at all.
-- ---------------------------------------------------------------------------
always_true AS (
  SELECT 'rls_policy_always_true',
         tablename || '.' || policyname,
         'cmd=' || cmd || ' roles=' || array_to_string(roles, '/')
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (btrim(COALESCE(qual, '')) = 'true' OR btrim(COALESCE(with_check, '')) = 'true')
)

SELECT * FROM rls_disabled
UNION ALL SELECT * FROM definer_views
UNION ALL SELECT * FROM initplan
UNION ALL SELECT * FROM mutable_path
UNION ALL SELECT * FROM multi_policies
UNION ALL SELECT * FROM unindexed_fks
UNION ALL SELECT * FROM listable_buckets
UNION ALL SELECT * FROM anon_definer
UNION ALL SELECT * FROM always_true
ORDER BY 1, 2;
