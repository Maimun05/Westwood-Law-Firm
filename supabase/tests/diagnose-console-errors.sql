-- ============================================================================
-- DIAGNOSTIC — "why is the portal showing 403 / 400?"
-- ============================================================================
-- Paste into the Supabase SQL Editor and send back the result grids.
--
-- Every lookup here is existence-safe: a missing table, function, sequence or
-- schema reports as *** MISSING *** rather than raising 42883 and killing the
-- rest of the script. (The first version of this file called
-- has_function_privilege() directly, which raises when the object is absent —
-- so it told us nothing except that something was missing.)
--
-- Sections A, B, C, D are read-only and can be run together.
-- PROBE 1 and PROBE 2 are separate: run each on its own. Both are wrapped in
-- BEGIN / ROLLBACK, so neither leaves anything behind.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. Which migrations actually reached this database
-- ----------------------------------------------------------------------------
-- APPLY_PENDING_MIGRATIONS.sql does not include every file in
-- supabase/migrations/. These objects are the fingerprints of the ones that are
-- easy to miss, and each is created by exactly one migration.
SELECT 'A' AS section, m.migration, m.fingerprint,
       CASE WHEN m.present IS NULL THEN '*** MISSING ***' ELSE 'present' END AS state
FROM (VALUES
  ('20260916_add_soft_delete_support', 'function public.soft_delete_profile(uuid)',      to_regprocedure('public.soft_delete_profile(uuid)')::text),
  ('20260916_add_soft_delete_support', 'column profiles.is_active',                      (SELECT 'x' FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active')),
  ('20260917_fix_profiles_and_notif',  'column inquiries.preferred_contact_method',      (SELECT 'x' FROM information_schema.columns WHERE table_schema='public' AND table_name='inquiries' AND column_name='preferred_contact_method')),
  ('20260918_content_tables',          'table public.practice_areas',                    to_regclass('public.practice_areas')::text),
  ('20260919_seed_content',            'rows in public.practice_areas (approx)',         (SELECT reltuples::bigint::text FROM pg_class WHERE oid = to_regclass('public.practice_areas'))),
  ('20260928_fix_admin_profile_write', 'policy profiles.profiles_admin_write_policy',    (SELECT 'x' FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_admin_write_policy')),
  ('20260929_documents_and_notif',     'function private.user_can_access_matter_path',   to_regprocedure('private.user_can_access_matter_path(text)')::text),
  ('20260929_documents_and_notif',     'function private.can_upload_document',           to_regprocedure('private.can_upload_document(uuid, public.access_level)')::text),
  ('20261001_consolidated_access',     'table public.matter_notes',                      to_regclass('public.matter_notes')::text),
  ('20261001_consolidated_access',     'view public.public_lawyers',                     to_regclass('public.public_lawyers')::text),
  ('20261002_database_cleanup',        'table public.lawyers_legacy',                    to_regclass('public.lawyers_legacy')::text),
  ('20261003_integrity_hardening',     'column audit_logs.source',                       (SELECT 'x' FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='source')),
  ('20261004_client_messaging',        'policy matter_notes.matter_notes_insert_client', (SELECT 'x' FROM pg_policies WHERE schemaname='public' AND tablename='matter_notes' AND policyname='matter_notes_insert_client')),
  ('20261005_security_advisor_fixes',  'RLS on lawyers_legacy',                          (SELECT 'x' FROM pg_class WHERE oid = to_regclass('public.lawyers_legacy') AND relrowsecurity))
) AS m(migration, fingerprint, present);


-- ----------------------------------------------------------------------------
-- B. Table privileges for the roles the API uses
-- ----------------------------------------------------------------------------
-- `authenticated` needs SELECT/INSERT/UPDATE/DELETE on every table the portal
-- reads. Supabase grants these by default, but only for objects created by the
-- roles it configured that default for — a table created by a different role
-- comes out with no grants at all, and RLS never even gets a chance to run.
SELECT 'B' AS section, c.relname AS table_name,
       has_table_privilege('anon',          c.oid, 'SELECT') AS anon_sel,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_ins,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_upd,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_del
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('matter_members', 'matter_notes', 'matter_events',
                    'confidential_access_grants', 'matters', 'documents',
                    'notifications', 'appointments', 'inquiries')
ORDER BY c.relname;


-- ----------------------------------------------------------------------------
-- C. Schema, function and sequence access
-- ----------------------------------------------------------------------------
-- Every RLS policy on the matter tables calls a function in the `private`
-- schema. Policy expressions are evaluated with the CALLER's privileges, so a
-- missing EXECUTE grant — or a missing USAGE on the schema itself — makes the
-- whole query fail with 42501, which PostgREST reports as 403 on a plain
-- SELECT rather than as an empty result.
SELECT 'C' AS section, x.what,
       CASE WHEN x.oid IS NULL THEN '*** MISSING ***'
            ELSE has_function_privilege('authenticated', x.oid, 'EXECUTE')::text END AS authenticated_may
FROM (VALUES
  ('EXECUTE private.user_can_access_matter',      to_regprocedure('private.user_can_access_matter(uuid)')),
  ('EXECUTE private.user_can_access_matter_path', to_regprocedure('private.user_can_access_matter_path(text)')),
  ('EXECUTE private.is_matter_lawyer_team',       to_regprocedure('private.is_matter_lawyer_team(uuid)')),
  ('EXECUTE private.is_admin',                    to_regprocedure('private.is_admin()')),
  ('EXECUTE private.is_lawyer_or_admin',          to_regprocedure('private.is_lawyer_or_admin()')),
  ('EXECUTE private.get_user_role',               to_regprocedure('private.get_user_role()')),
  ('EXECUTE private.can_read_document_content',   to_regprocedure('private.can_read_document_content(uuid)')),
  ('EXECUTE private.can_upload_document',         to_regprocedure('private.can_upload_document(uuid, public.access_level)')),
  ('EXECUTE public.break_glass_open_document',    to_regprocedure('public.break_glass_open_document(uuid, text)')),
  ('EXECUTE public.convert_inquiry_to_matter',    to_regprocedure('public.convert_inquiry_to_matter(uuid, uuid, text, public.priority_level)'))
) AS x(what, oid)
UNION ALL
SELECT 'C', 'USAGE on schema private',
       CASE WHEN to_regnamespace('private') IS NULL THEN '*** MISSING ***'
            ELSE has_schema_privilege('authenticated', 'private', 'USAGE')::text END
UNION ALL
SELECT 'C', 'anon EXECUTE public.generate_inquiry_number',
       CASE WHEN to_regprocedure('public.generate_inquiry_number()') IS NULL THEN '*** MISSING ***'
            ELSE has_function_privilege('anon', to_regprocedure('public.generate_inquiry_number()'), 'EXECUTE')::text END
UNION ALL
SELECT 'C', 'anon USAGE on public.inquiry_number_seq',
       CASE WHEN to_regclass('public.inquiry_number_seq') IS NULL THEN '*** MISSING ***'
            ELSE has_sequence_privilege('anon', to_regclass('public.inquiry_number_seq'), 'USAGE')::text END;


-- ----------------------------------------------------------------------------
-- D. The policies actually in force
-- ----------------------------------------------------------------------------
SELECT 'D' AS section, tablename, policyname, cmd, permissive,
       array_to_string(roles, '/') AS roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('matter_members', 'matter_notes', 'matter_events', 'inquiries', 'documents')
ORDER BY tablename, cmd, policyname;


-- ============================================================================
-- PROBE 1 — run this block ON ITS OWN.
-- Reproduces an anonymous contact-form submission. The error text, if any, is
-- the answer to the 400 on POST /rest/v1/inquiries.
-- ============================================================================
BEGIN;
  SET LOCAL ROLE anon;
  INSERT INTO public.inquiries
    (name, email, phone, practice_area, preferred_contact_method, message, subject, status)
  VALUES
    ('Diagnostic', 'diagnostic@example.com', '', 'labor', 'Email',
     'diagnostic only — rolled back', 'General', 'New');
ROLLBACK;


-- ============================================================================
-- PROBE 2 — run this block ON ITS OWN.
-- Replace the UUID with the id of the account you were signed in as when the
-- 403s appeared. Find it with:
--   SELECT id, email, role FROM public.profiles WHERE email = 'you@example.com';
-- ============================================================================
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = 'PASTE-YOUR-USER-ID-HERE';
  SELECT count(*) AS visible_matter_members
    FROM public.matter_members
   WHERE matter_id = '6342c67d-3025-440a-8ffc-9d5866caf381';
ROLLBACK;
