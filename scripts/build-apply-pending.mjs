// ============================================================================
// Regenerate supabase/APPLY_PENDING_MIGRATIONS.sql
// ============================================================================
// The owner applies migrations by pasting ONE file into the Supabase SQL
// Editor, so the individual migrations have to be concatenated in order. This
// script does that so the combined file never drifts from its sources.
//
//   node scripts/build-apply-pending.mjs
//
// Add a migration by appending to MIGRATIONS below, in the order it must run.
// The individual files in supabase/migrations/ remain the source of truth.
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "supabase", "APPLY_PENDING_MIGRATIONS.sql");

// Order matters. Each entry says why it sits where it does.
const MIGRATIONS = [
  {
    file: "20260919_seed_content.sql",
    note: "content: practice areas, articles, FAQs, specialists, seminars, retainers",
  },
  {
    file: "20260928_fix_admin_profile_write_access.sql",
    note: "profiles_admin_write_policy: without it an admin can only UPDATE their own profile row",
  },
  {
    file: "20260929_documents_and_notifications.sql",
    note: "document/storage policies + the helpers they call; notifications",
  },
  {
    file: "20261001_consolidated_access_control.sql",
    note: "composite names, confidential documents, matter rules, public_lawyers view",
  },
  {
    file: "20261002_database_cleanup.sql",
    note: "renames legacy tables, links lawyers to practice areas",
  },
  {
    file: "20261003_integrity_hardening.sql",
    note: "last-admin guard, is_active enforcement, audit provenance, audit-prune lockdown",
  },
  {
    file: "20261004_client_messaging.sql",
    note: "clients can post client-visible notes; the lawyer team is notified",
  },
  {
    file: "20261005_security_advisor_fixes.sql",
    note: "locks down legacy tables, anon-callable admin functions, and missing FK indexes",
  },
  {
    file: "20261006_public_inquiry_rpc.sql",
    note: "public.submit_inquiry() so the contact form works for signed-out visitors",
  },
  {
    file: "20261007_content_table_grants.sql",
    note: 'the live "Admin access is required" bug: explicit grants + admin policies on the content tables',
  },
  {
    file: "20261008_inquiry_attachments.sql",
    note: "inquiry-attachments bucket + table + attach_inquiry_files() for the form attachments",
  },
  {
    file: "20261009_firm_contact_email.sql",
    note: "public contact email: updates the seeded FAQ answer to westwoodlawfirm1@gmail.com",
  },
  {
    file: "20261010_inquiry_firm_notified.sql",
    note: "firm_notified_at claim for emailing signed-out inquiries to the firm",
  },
  {
    file: "20261011_inquiries_service_role_grant.sql",
    note: "service_role SELECT/UPDATE on inquiries — without it notify-inquiry dies with 42501",
  },
  {
    file: "20261012_admin_view_only_documents.sql",
    note: "admins become view-only on documents: no table or storage uploads, deletes uploader-only",
  },
  {
    file: "20261013_seminar_registrations.sql",
    note: "seminar registrations get inquiries.seminar_id + submit_inquiry(p_seminar_id); seminar_email_log for the admin bulk email",
  },
  {
    file: "20261014_audit_log_browser_writes.sql",
    note: "the live audit_logs 403: grants + INSERT/SELECT policies for the browser audit path",
  },
  {
    file: "20261015_matter_notes_encryption.sql",
    note: "encrypt matter_notes.body at rest via Vault; read via public.matter_notes_thread",
  },
];

const ORDER_NOTE = `-- ORDER MATTERS: 20261001 links each seeded lawyer to the practice areas created
-- by 20260919, so 20260919 must run first. 20261003 supersedes functions that
-- earlier files create, so it must run after 20261001/20261002. 20261004
-- replaces private.on_matter_note_insert(), which 20261001 creates. 20261005
-- rewrites the policies the earlier files leave behind. 20261007 swaps the
-- content tables' admin policies for the private.is_admin() helper, so it runs
-- after 20261003 installs it. 20261008 references public.inquiries, which
-- 20261006's RPC populates, and private.is_lawyer_or_admin(), so it runs last
-- of the originals. 20261013 replaces the submit_inquiry that 20261006 creates,
-- so it runs after 20261006, and it backfills from the rows that RPC wrote.
-- 20261014 re-asserts the audit_logs policies for the browser write path and
-- calls private.is_admin(), so it runs after 20261003 installs that helper.
-- 20261015 encrypts matter_notes.body and replaces private.on_matter_note_insert()
-- once more (20261001 creates it, 20261004 rewrites it), so it runs after
-- 20261004 and after 20261005's grants.`;

const VERIFICATION = `-- ############################################################################
-- ## VERIFICATION  —  read the result grid, not the "Success" toast
-- ############################################################################
-- Every row in the first result should say present = true.
-- The second result shows row counts; content tables must not be 0.
-- The last row of the second result counts seminar registrations that the
-- backfill managed to link — 0 is fine if the seminars were never registered
-- for, or if no message text matched a listed title exactly.
-- The third result is security checks; every one must read PASS.

SELECT 'public_lawyers view'        AS object, to_regclass('public.public_lawyers')                IS NOT NULL AS present
UNION ALL SELECT 'matter_members table',        to_regclass('public.matter_members')                IS NOT NULL
UNION ALL SELECT 'matter_notes table',          to_regclass('public.matter_notes')                  IS NOT NULL
UNION ALL SELECT 'matter_events table',         to_regclass('public.matter_events')                 IS NOT NULL
UNION ALL SELECT 'confidential_access_grants',  to_regclass('public.confidential_access_grants')    IS NOT NULL
UNION ALL SELECT 'lawyers renamed to _legacy',  to_regclass('public.lawyers_legacy')                IS NOT NULL
UNION ALL SELECT 'profiles.first_name column',  EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='profiles'
                                                   AND column_name='first_name')
UNION ALL SELECT 'profiles.position column',    EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='profiles'
                                                   AND column_name='position')
UNION ALL SELECT 'audit_logs.source column',    EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='audit_logs'
                                                   AND column_name='source')
UNION ALL SELECT 'break_glass_open_document()', to_regprocedure('public.break_glass_open_document(uuid,text)') IS NOT NULL
UNION ALL SELECT 'convert_inquiry_to_matter()', to_regprocedure('public.convert_inquiry_to_matter(uuid,uuid,text,public.priority_level)') IS NOT NULL
UNION ALL SELECT 'inquiry_attachments table',   to_regclass('public.inquiry_attachments')            IS NOT NULL
UNION ALL SELECT 'attach_inquiry_files()',      to_regprocedure('public.attach_inquiry_files(text,jsonb)') IS NOT NULL
UNION ALL SELECT 'inquiry-attachments bucket',  EXISTS (SELECT 1 FROM storage.buckets
                                                 WHERE id = 'inquiry-attachments' AND public = FALSE)
UNION ALL SELECT 'inquiries.firm_notified_at',  EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='inquiries'
                                                   AND column_name='firm_notified_at')
UNION ALL SELECT 'service_role UPDATE inquiries', has_table_privilege('service_role', 'public.inquiries', 'UPDATE')
UNION ALL SELECT 'inquiries.seminar_id column',  EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='inquiries'
                                                   AND column_name='seminar_id')
UNION ALL SELECT 'inquiries_seminar_id_idx',     to_regclass('public.inquiries_seminar_id_idx')      IS NOT NULL
UNION ALL SELECT 'submit_inquiry() 8-arg',       to_regprocedure('public.submit_inquiry(text,text,text,text,text,text,text,text)') IS NOT NULL
UNION ALL SELECT 'old 7-arg submit_inquiry gone', to_regprocedure('public.submit_inquiry(text,text,text,text,text,text,text)') IS NULL
UNION ALL SELECT 'audit_logs insert policy',     EXISTS (SELECT 1 FROM pg_policies
                                                 WHERE schemaname='public' AND tablename='audit_logs'
                                                   AND policyname='audit_logs_insert_policy')
UNION ALL SELECT 'audit_logs own-rows select',   EXISTS (SELECT 1 FROM pg_policies
                                                 WHERE schemaname='public' AND tablename='audit_logs'
                                                   AND policyname='audit_logs_select_policy')
UNION ALL SELECT 'audit_logs admin select',      EXISTS (SELECT 1 FROM pg_policies
                                                 WHERE schemaname='public' AND tablename='audit_logs'
                                                   AND policyname='audit_logs_select_admin_policy')
UNION ALL SELECT 'seminar_email_log table',      to_regclass('public.seminar_email_log')             IS NOT NULL
UNION ALL SELECT 'matter_notes_thread view',     to_regclass('public.matter_notes_thread')           IS NOT NULL
UNION ALL SELECT 'matter_notes.body_encrypted',  EXISTS (SELECT 1 FROM information_schema.columns
                                                 WHERE table_schema='public' AND table_name='matter_notes'
                                                   AND column_name='body_encrypted')
UNION ALL SELECT 'matter_notes_encrypt trigger', EXISTS (SELECT 1 FROM pg_trigger
                                                 WHERE tgname='matter_notes_encrypt')
UNION ALL SELECT 'private.matter_note_key()',    to_regprocedure('private.matter_note_key()')         IS NOT NULL;

SELECT 'practice_areas' AS table_name, count(*) AS rows FROM public.practice_areas
UNION ALL SELECT 'articles',            count(*) FROM public.articles
UNION ALL SELECT 'specialists',         count(*) FROM public.specialists
UNION ALL SELECT 'faqs',                count(*) FROM public.faqs
UNION ALL SELECT 'seminar_events',      count(*) FROM public.seminar_events
UNION ALL SELECT 'corporate_clients',   count(*) FROM public.corporate_clients
UNION ALL SELECT 'retainer_packages',   count(*) FROM public.retainer_packages
UNION ALL SELECT 'profiles (lawyers)',  count(*) FROM public.profiles WHERE role = 'lawyer'
UNION ALL SELECT 'public_lawyers view', count(*) FROM public.public_lawyers
UNION ALL SELECT 'inquiries linked to a seminar', count(*) FROM public.inquiries WHERE seminar_id IS NOT NULL;

-- Security checks: every row must read PASS.
--
-- has_function_privilege() with a LITERAL signature RAISES 42883 when the
-- function is absent; it does not return false. That killed the paste of
-- 2026-09-30 on its very last statement, because soft_delete_profile /
-- reactivate_profile do not exist on the live project (20260916 is not part of
-- this file, and section 4 of 20261005 only hardens them where they already
-- exist). Every named-function check therefore branches on to_regprocedure()
-- first: absent function = nothing to call = PASS.
SELECT 'anon cannot prune the audit trail' AS check,
       CASE WHEN to_regprocedure('public.cleanup_old_audit_logs(integer)') IS NULL THEN 'PASS'
            WHEN has_function_privilege('anon', 'public.cleanup_old_audit_logs(integer)', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END AS result
UNION ALL SELECT 'authenticated cannot prune the audit trail',
       CASE WHEN to_regprocedure('public.cleanup_old_audit_logs(integer)') IS NULL THEN 'PASS'
            WHEN has_function_privilege('authenticated', 'public.cleanup_old_audit_logs(integer)', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'last-admin guards are installed',
       CASE WHEN (SELECT count(*) FROM pg_trigger
                   WHERE tgname IN ('profiles_last_admin','profiles_last_admin_delete')) = 2
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'audit source cannot be forged by a client',
       CASE WHEN (SELECT count(*) FROM pg_trigger
                   WHERE tgname = 'audit_logs_stamp_source') = 1
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'clients can post client-visible matter notes',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'public' AND tablename = 'matter_notes'
                           AND policyname = 'matter_notes_insert_client')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'anon cannot deactivate an account',
       CASE WHEN to_regprocedure('public.soft_delete_profile(uuid)') IS NULL THEN 'PASS'
            WHEN has_function_privilege('anon', 'public.soft_delete_profile(uuid)', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'anon cannot reactivate an account',
       CASE WHEN to_regprocedure('public.reactivate_profile(uuid)') IS NULL THEN 'PASS'
            WHEN has_function_privilege('anon', 'public.reactivate_profile(uuid)', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'anon cannot call log_auth_event',
       CASE WHEN to_regprocedure('public.log_auth_event()') IS NULL THEN 'PASS'
            WHEN has_function_privilege('anon', 'public.log_auth_event()', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'legacy tables are not API-readable',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname LIKE '%\\_legacy'
                           AND NOT c.relrowsecurity
                           AND (has_table_privilege('anon', c.oid, 'SELECT')
                             OR has_table_privilege('authenticated', c.oid, 'SELECT')))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'lawyer-photos cannot be listed anonymously',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'storage' AND tablename = 'objects'
                           AND policyname = 'lawyer_photos_select'
                           AND roles && ARRAY['anon','public']::name[])
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'no unexpected SECURITY DEFINER function is anon-executable',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.prosecdef
                           -- submit_inquiry and attach_inquiry_files are the
                           -- public contact form: anon MUST be able to call
                           -- them, and each validates its own input.
                           AND p.proname NOT IN ('submit_inquiry', 'attach_inquiry_files')
                           AND has_function_privilege('anon', p.oid, 'EXECUTE'))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'the content tables are granted to authenticated and anon can read them',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public'
                AND c.relname IN ('practice_areas','articles','specialists','corporate_clients',
                                  'faqs','seminar_events','retainer_packages','profile_practice_areas')
                AND NOT (has_table_privilege('authenticated', c.oid, 'SELECT')
                     AND has_table_privilege('authenticated', c.oid, 'INSERT')
                     AND has_table_privilege('authenticated', c.oid, 'UPDATE')
                     AND has_table_privilege('authenticated', c.oid, 'DELETE')
                     AND has_table_privilege('anon', c.oid, 'SELECT')))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'anon cannot read inquiry attachments',
       CASE WHEN has_table_privilege('anon', 'public.inquiry_attachments', 'SELECT')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'the attachment upload policy is insert-only for visitors',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'storage' AND tablename = 'objects'
                           AND policyname = 'inquiry_attachments_storage_insert'
                           AND cmd = 'INSERT'
                           AND with_check LIKE '%inquiry-attachments%')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'authenticated can use the private schema, anon cannot',
       CASE WHEN to_regnamespace('private') IS NULL THEN 'FAIL'
            WHEN has_schema_privilege('authenticated', 'private', 'USAGE')
             AND NOT has_schema_privilege('anon', 'private', 'USAGE')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'the four matter tables are granted to authenticated, not anon',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public'
                AND c.relname IN ('matter_members','matter_notes','matter_events',
                                  'confidential_access_grants')
                AND NOT (has_table_privilege('authenticated', c.oid, 'SELECT')
                     AND has_table_privilege('authenticated', c.oid, 'INSERT')
                     AND NOT has_table_privilege('anon', c.oid, 'SELECT')))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'no function has a mutable search_path',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.prokind = 'f'
                           AND NOT EXISTS (SELECT 1 FROM pg_depend d
                                           WHERE d.objid = p.oid AND d.deptype = 'e')
                           AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}'::text[])) c
                                           WHERE c LIKE 'search_path=%'))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'no always-true policy remains',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'public'
                           AND (btrim(COALESCE(qual,'')) = 'true' OR btrim(COALESCE(with_check,'')) = 'true'))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'every foreign key is indexed',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint c
              JOIN pg_class cl ON cl.oid = c.conrelid
              JOIN pg_namespace n ON n.oid = cl.relnamespace
              WHERE c.contype = 'f' AND n.nspname = 'public'
                AND NOT EXISTS (
                  SELECT 1 FROM pg_index i
                  WHERE i.indrelid = c.conrelid AND i.indisvalid
                    AND (SELECT array_agg(k ORDER BY ord)
                         FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS t(k, ord))
                        [1:array_length(c.conkey, 1)] = c.conkey))
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'no policy re-evaluates auth.uid() per row',
       CASE WHEN EXISTS (
              SELECT 1 FROM pg_policies
              WHERE schemaname = 'public'
                AND replace(replace(replace(
                      COALESCE(qual,'') || ' ' || COALESCE(with_check,''),
                      'SELECT auth.uid()', 'SELECT x'), 'SELECT auth.jwt()', 'SELECT x'),
                      'SELECT auth.role()', 'SELECT x') ~ 'auth\\.(uid|jwt|role)\\(\\)')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'admins are view-only: can_upload_document refuses them',
       CASE WHEN (SELECT prosrc FROM pg_proc
                   WHERE oid = to_regprocedure('private.can_upload_document(uuid,public.access_level)'))
                 ~ 'admin''\\s+THEN FALSE'
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'the documents bucket refuses admin uploads',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'storage' AND tablename = 'objects'
                           AND policyname = 'documents_storage_insert'
                           AND with_check LIKE '%is_admin%')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'anon can still submit inquiries',
       CASE WHEN to_regprocedure('public.submit_inquiry(text,text,text,text,text,text,text,text)') IS NULL THEN 'FAIL'
            WHEN has_function_privilege('anon', 'public.submit_inquiry(text,text,text,text,text,text,text,text)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'seminar_email_log is admin-read-only',
       CASE WHEN to_regclass('public.seminar_email_log') IS NULL THEN 'FAIL'
            WHEN NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.seminar_email_log')) THEN 'FAIL'
            WHEN has_table_privilege('anon', 'public.seminar_email_log', 'SELECT') THEN 'FAIL'
            WHEN has_table_privilege('authenticated', 'public.seminar_email_log', 'INSERT') THEN 'FAIL'
            WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                             WHERE schemaname = 'public' AND tablename = 'seminar_email_log'
                               AND policyname = 'seminar_email_log_select_admin')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'the audit trail accepts browser writes and is append-only for users',
       CASE WHEN NOT (has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
                   AND has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'))
            THEN 'FAIL'
            WHEN has_table_privilege('anon', 'public.audit_logs', 'SELECT') THEN 'FAIL'
            WHEN has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
              OR has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'no matter message is stored as plain text',
       CASE WHEN EXISTS (SELECT 1 FROM public.matter_notes WHERE NOT body_encrypted)
            THEN 'FAIL' ELSE 'PASS' END
UNION ALL SELECT 'the matter read view is security_invoker',
       CASE WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'public' AND c.relname = 'matter_notes_thread'
                           AND EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}'::text[])) o
                                       WHERE o = 'security_invoker=true'))
            THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'a client cannot read the matter-notes key',
       CASE WHEN to_regprocedure('private.matter_note_key()') IS NULL THEN 'FAIL'
            WHEN has_function_privilege('authenticated', 'private.matter_note_key()', 'EXECUTE')
            THEN 'FAIL' ELSE 'PASS' END;
`;

const bar = (ch) => ch.repeat(76);

// Every banner line must be a SQL comment. Emitting a bare '####' row makes
// Postgres read it as an operator and fail with "operator too long" before it
// has run a single statement.
const comment = (line) => `-- ${line}`;

const sections = MIGRATIONS.map((m, i) => {
  const sql = readFileSync(join(migrationsDir, m.file), "utf8").replace(/\s+$/, "");
  const rule = comment(bar("#"));
  return `${rule}\n${comment(`## ${i + 1}/${MIGRATIONS.length}  ${m.file}`)}\n${rule}\n${sql}\n`;
});

const header = `-- ${bar("=")}
-- WESTWOOD LAW FIRM  —  APPLY ALL PENDING MIGRATIONS
-- ${bar("=")}
-- Generated ${new Date().toISOString().slice(0, 10)} by scripts/build-apply-pending.mjs.
-- Do not edit this file by hand — edit supabase/migrations/ and regenerate.
--
-- This file is the concatenation, in the required order, of the migrations that
-- are still missing from the live Supabase project (labwmffshjaywmattmen):
--
${MIGRATIONS.map((m, i) => `--   ${i + 1}. ${m.file.padEnd(44)} (${m.note})`).join("\n")}
--
${ORDER_NOTE}
--
-- HOW TO RUN
--   1. Open https://supabase.com/dashboard  ->  your project  ->  SQL Editor
--   2. Click "New query"
--   3. Paste this ENTIRE file
--   4. Click "Run"
--   5. Read the result grid at the very bottom — not the "Success" toast.
--
-- Every statement is idempotent, so it is safe to run this more than once.
-- The individual migration files remain the source of truth.
-- ${bar("=")}
`;

writeFileSync(outFile, `${header}\n\n\n${sections.join("\n\n")}\n\n${VERIFICATION}`, "utf8");

const lines = readFileSync(outFile, "utf8").split("\n").length;
console.log(`Wrote ${outFile}`);
console.log(`  ${MIGRATIONS.length} migrations, ${lines} lines`);
