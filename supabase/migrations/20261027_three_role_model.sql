-- ============================================================================
-- 20261027  Back to three roles: client, admin, lawyer
-- ============================================================================
-- Run AFTER 20261026. Safe to re-run.
--
-- The firm has three kinds of account and no others:
--   client — their own matters, documents, appointments, inquiries.
--   lawyer — casework: assigned matters, the inquiry queue, document
--            authorship (incl. Confidential), matter teams.
--   admin  — the firm administrator: staff accounts, the audit trail, the
--            intake queue, website content, reports, every matter (view only
--            on documents, unchanged since 20261012).
--
-- 20261023 had split that into six (managing_partner, system_admin,
-- legal_assistant, paralegal). This file folds them back:
--   managing_partner, system_admin, legal_assistant -> admin
--   paralegal                                       -> lawyer
-- and deletes the three demo staff accounts those roles were trialled with
-- (sysadmin@, intake@, paralegal@). Real client and lawyer accounts are
-- untouched.
--
-- WHY THE TEMP-TYPE SWAP (same reason as 20261023): the owner pastes this into
-- the SQL Editor as one run, and a value removed from an enum cannot be dropped
-- while anything references it. So: build user_role_new with the three values,
-- move the column with a CASE that folds the old names, drop the old type,
-- rename the new one.
--
-- WHAT THE OLD TYPE DRAGS DOWN (the same set 20261023 found with pg_depend):
--   * column profiles.role + its default        -> handled by ALTER COLUMN TYPE
--   * function private.get_user_role()          -> return type is its identity
--   * policy profiles_update_own / profiles_update_policy (one per database
--     shape: the live project has the first, a replayed chain the second)
--   * policy inquiries_select_assigned_lawyer / inquiries_update_assigned_lawyer
--   * the public_lawyers view's stored rule
--   * policies lawyer_photos_insert / lawyer_photos_update / lawyer_photos_delete
--     (storage.objects): the live project's dashboard-era copies compare
--     profiles.role DIRECTLY — a column dependency, which ALTER COLUMN TYPE
--     refuses with 0A000. They are dropped and rebuilt against is_admin().
--   Everything else names roles inside function bodies, which CREATE OR REPLACE
--   re-parses. The helper functions keep their names, so the ~30 policies that
--   call private.is_admin() and friends keep working without being recreated.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Delete the three demo staff accounts
-- ----------------------------------------------------------------------------
-- They were created on 2026-10-13 to trial the roles that no longer exist.
-- auth.users is the root: profiles.id cascades from it. The RESTRICT-bound
-- columns (documents.uploaded_by, matter_notes.author_id, inquiry_messages.
-- author_id, tasks.assigned_to, task_reviews.reviewer_id) are re-anchored to
-- the surviving admin first, so a database where one of these accounts did
-- leave work behind still deletes cleanly. Each table is guarded by
-- to_regclass(): a project that never ran the migration owning it has no table,
-- and a missing table must not stop the cleanup.
DO $cleanup$
DECLARE
  demo_emails TEXT[] := ARRAY[
    'sysadmin@westwoodlaw.ph',
    'intake@westwoodlaw.ph',
    'paralegal@westwoodlaw.ph'
  ];
  victims UUID[];
  anchor  UUID;
  moved   BIGINT;
BEGIN
  SELECT array_agg(p.id) INTO victims
  FROM public.profiles p
  WHERE lower(p.email) = ANY (demo_emails);

  IF victims IS NULL THEN
    RAISE NOTICE 'No demo staff accounts left — nothing to delete.';
    RETURN;
  END IF;

  -- The admin who inherits anything they authored.
  SELECT p.id INTO anchor
  FROM public.profiles p
  WHERE p.role::TEXT IN ('admin', 'managing_partner')
    AND NOT (p.id = ANY (victims))
    AND COALESCE(p.is_active, TRUE)
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF anchor IS NULL THEN
    RAISE EXCEPTION
      'No surviving admin to re-anchor documents, notes, messages and tasks to — aborting before deleting anything.';
  END IF;

  IF to_regclass('public.documents') IS NOT NULL THEN
    EXECUTE 'UPDATE public.documents SET uploaded_by = $1 WHERE uploaded_by = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'documents re-anchored: %', moved;
  END IF;

  IF to_regclass('public.matter_notes') IS NOT NULL THEN
    EXECUTE 'UPDATE public.matter_notes SET author_id = $1 WHERE author_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'matter notes re-anchored: %', moved;
  END IF;

  IF to_regclass('public.inquiry_messages') IS NOT NULL THEN
    EXECUTE 'UPDATE public.inquiry_messages SET author_id = $1 WHERE author_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'inquiry messages re-anchored: %', moved;
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    EXECUTE 'UPDATE public.tasks SET assigned_to = $1 WHERE assigned_to = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'tasks re-anchored: %', moved;
  END IF;

  IF to_regclass('public.task_reviews') IS NOT NULL THEN
    EXECUTE 'UPDATE public.task_reviews SET reviewer_id = $1 WHERE reviewer_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'task reviews re-anchored: %', moved;
  END IF;

  DELETE FROM auth.users u WHERE u.id = ANY (victims);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'auth users deleted: %', moved;

  -- Belt and braces: a project whose profiles.id never got the cascade would
  -- otherwise keep an orphan row that still shows up in the staff list.
  DELETE FROM public.profiles p WHERE p.id = ANY (victims);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'orphan profiles deleted: %', moved;
END
$cleanup$;


-- ----------------------------------------------------------------------------
-- 2. Drop the objects the enum swap drags down with it
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
DROP POLICY IF EXISTS inquiries_select_assigned_lawyer ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_assigned_lawyer ON public.inquiries;

-- The live project's dashboard-era lawyer-photos policies compare
-- public.profiles.role DIRECTLY (schema-production.sql's copies call
-- private.is_admin()). A policy dependency on the column blocks ALTER COLUMN
-- TYPE with 0A000, so they are dropped here and rebuilt in step 5.
DROP POLICY IF EXISTS lawyer_photos_insert ON storage.objects;
DROP POLICY IF EXISTS lawyer_photos_update ON storage.objects;
DROP POLICY IF EXISTS lawyer_photos_delete ON storage.objects;

-- get_user_role() returns the enum by value, so its return type is part of its
-- identity: DROP is the only way to change it. The view's stored rule holds a
-- direct reference to the old type, so it has to be rebuilt too.
DROP FUNCTION IF EXISTS private.get_user_role();
DROP VIEW IF EXISTS public.public_lawyers;


-- ----------------------------------------------------------------------------
-- 3. Swap the enum
-- ----------------------------------------------------------------------------
-- The column default is an expression over the OLD type, and there is no
-- implicit cast between two enum types, so ALTER COLUMN TYPE refuses to carry
-- it. Drop it, move the column, put it back against the new type.
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

DROP TYPE IF EXISTS public.user_role_new;
CREATE TYPE public.user_role_new AS ENUM ('client', 'lawyer', 'admin');

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING (
    CASE role::TEXT
      WHEN 'managing_partner' THEN 'admin'
      WHEN 'system_admin'     THEN 'admin'
      WHEN 'legal_assistant'  THEN 'admin'
      WHEN 'paralegal'        THEN 'lawyer'
      ELSE role::TEXT
    END
  )::public.user_role_new;

-- Fails loudly (the whole paste rolls back) if any dependent was missed — by
-- design, so a half-swapped database can never exist.
DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'client'::public.user_role;


-- ----------------------------------------------------------------------------
-- 4. Recreate the helpers against the new type
-- ----------------------------------------------------------------------------
-- The ::TEXT comparisons make this file re-runnable: the literal is never cast
-- to the enum, so nothing can fail to fold on a second pass.

CREATE FUNCTION private.get_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
    AND COALESCE(p.is_active, TRUE)
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

-- The firm administrator.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT = 'admin'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

-- Kept as a name even though the role is gone: profiles_update_system_admin and
-- audit_logs_select_system_admin call it, and the admin is now the one who
-- manages accounts and reads the audit trail.
CREATE OR REPLACE FUNCTION private.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.is_admin();
$$;

-- Staff account management: the admin.
CREATE OR REPLACE FUNCTION private.is_staff_account_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.is_admin();
$$;

-- Firm staff = everyone except clients. Used for the staff-facing surfaces
-- (staff directory, lawyer directory, inquiry attachments).
CREATE OR REPLACE FUNCTION private.is_lawyer_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT IN ('lawyer', 'admin')
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

-- Intake is admin work now: inquiries_select_intake calls this.
CREATE OR REPLACE FUNCTION private.is_intake()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.is_admin();
$$;

REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Recreate the policies the swap forced us to drop
-- ----------------------------------------------------------------------------
CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK (
  (SELECT auth.uid()) = id
  AND role = (SELECT private.get_user_role())
);

CREATE POLICY inquiries_select_assigned_lawyer ON public.inquiries
FOR SELECT TO authenticated
USING (
  assigned_to = (SELECT auth.uid())
  AND (SELECT private.get_user_role()) = 'lawyer'::public.user_role
);

CREATE POLICY inquiries_update_assigned_lawyer ON public.inquiries
FOR UPDATE TO authenticated
USING (
  assigned_to = (SELECT auth.uid())
  AND (SELECT private.get_user_role()) = 'lawyer'::public.user_role
)
WITH CHECK (
  assigned_to = (SELECT auth.uid())
  AND (SELECT private.get_user_role()) = 'lawyer'::public.user_role
);

-- The lawyer-photos write policies, rebuilt against the helper. lawyer_photos_
-- select stays dropped: 20261005 removed it so the public bucket cannot be
-- enumerated.
CREATE POLICY lawyer_photos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));

CREATE POLICY lawyer_photos_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()))
WITH CHECK (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));

CREATE POLICY lawyer_photos_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'lawyer-photos' AND (SELECT private.is_admin()));


-- ----------------------------------------------------------------------------
-- 6. Rebuild the public lawyer directory view
-- ----------------------------------------------------------------------------
-- Definition identical to 20261001 (a SECURITY DEFINER view on purpose — it IS
-- the public boundary; see the accepted advisor finding security_definer_view).
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
WHERE p.role = 'lawyer' AND COALESCE(p.is_active, TRUE) AND p.deleted_at IS NULL;
GRANT SELECT ON public.public_lawyers TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Functions whose bodies hard-coded the old role names
-- ----------------------------------------------------------------------------
-- plpgsql bodies are resolved at run time, so these would have kept parsing
-- after the swap — and then failed the first time they ran. Rewritten here.

-- The firm must always keep at least one active admin.
CREATE OR REPLACE FUNCTION private.guard_last_admin() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  IF OLD.role::TEXT = 'admin'
     AND COALESCE(OLD.is_active, TRUE)
     AND (NEW.role::TEXT IS DISTINCT FROM 'admin'
          OR NOT COALESCE(NEW.is_active, TRUE)
          OR NEW.deleted_at IS NOT NULL) THEN

    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role::TEXT = 'admin'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active admin. Promote another account before changing this one.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.guard_last_admin_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  IF OLD.role::TEXT = 'admin' AND COALESCE(OLD.is_active, TRUE) THEN
    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role::TEXT = 'admin'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active admin and cannot be deleted. Promote another account first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END $$;

-- Document metadata visibility. 'Staff Shared' is firm-internal (lawyers and
-- the admin); every other level is the lawyer team, with the admin seeing
-- metadata for the rest.
CREATE OR REPLACE FUNCTION private.can_access_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := (SELECT auth.uid()); v_role public.user_role; v_client UUID;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  SELECT m.client_id INTO v_client FROM public.matters m WHERE m.id = p_matter_id;
  RETURN CASE p_access_level
    WHEN 'Public'       THEN TRUE
    WHEN 'Staff Shared' THEN v_role::TEXT IN ('lawyer', 'admin')
    WHEN 'Client & Assigned Lawyer' THEN v_uid = v_client OR private.is_matter_team(p_matter_id) OR v_role::TEXT = 'admin'
    WHEN 'Lawyer Only'  THEN private.is_matter_lawyer_team(p_matter_id) OR v_role::TEXT = 'admin'
    WHEN 'Confidential' THEN private.is_matter_lawyer_team(p_matter_id) OR v_role::TEXT = 'admin'  -- admin: metadata only
    ELSE FALSE END;
END $$;

-- Who may author a document. The admin stays view-only (20261012).
CREATE OR REPLACE FUNCTION private.can_upload_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.user_can_access_matter(p_matter_id) THEN RETURN FALSE; END IF;
  RETURN CASE private.get_user_role()
    WHEN 'admin' THEN FALSE           -- view-only: the admin never authors documents
    WHEN 'lawyer' THEN private.is_matter_lawyer_team(p_matter_id)
                       AND p_access_level IN ('Client & Assigned Lawyer','Staff Shared','Lawyer Only','Confidential')
    WHEN 'client' THEN p_access_level = 'Client & Assigned Lawyer'
    ELSE FALSE END;
END $$;

-- Matter teams accept lawyers only. Everyone else is refused.
CREATE OR REPLACE FUNCTION private.on_matter_member_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.matter_members; v_assigned UUID;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT lawyer_id INTO v_assigned FROM public.matters WHERE id = r.matter_id;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.lawyer_id AND role::TEXT = 'lawyer') THEN
      RAISE EXCEPTION 'Only lawyers can be added to a matter team';
    END IF;
    NEW.added_by := auth.uid();
  END IF;
  PERFORM private.write_audit('MATTER_TEAM_' || TG_OP, 'Matter team member ' || lower(TG_OP), 'matter', r.matter_id::TEXT,
    jsonb_build_object('lawyer_id', r.lawyer_id));
  IF v_assigned IS NOT NULL AND v_assigned IS DISTINCT FROM auth.uid() THEN
    PERFORM private.create_notification(v_assigned, 'Matter team changed',
      'A team member was ' || CASE WHEN TG_OP='INSERT' THEN 'added to' ELSE 'removed from' END || ' one of your matters.', 'info', 'matters');
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- New client inquiries ring the bell for the admin, who owns intake.
CREATE OR REPLACE FUNCTION private.notify_admins_new_inquiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin   UUID;
  v_who     TEXT;
  v_subject TEXT;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_who := COALESCE(NULLIF(btrim(NEW.name), ''), 'A client');
  v_subject := NULLIF(btrim(NEW.subject), '');

  FOR v_admin IN
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.role::TEXT = 'admin'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  LOOP
    PERFORM private.create_notification(
      v_admin,
      'New client inquiry',
      v_who || ' submitted ' || NEW.inquiry_number || COALESCE(' — ' || v_subject, ''),
      'info',
      'intake'
    );
  END LOOP;

  RETURN NEW;
END $$;


-- ----------------------------------------------------------------------------
-- 8. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_values  TEXT;
  v_count   INT;
  v_missing TEXT := '';
  v_admins  INT;
  v_demo    INT;
BEGIN
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_values
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'user_role';
  SELECT count(*) INTO v_count FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'user_role';

  IF v_count <> 3
     OR EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typname = 'user_role'
                  AND e.enumlabel IN ('managing_partner','system_admin','legal_assistant','paralegal')) THEN
    v_missing := v_missing || ' enum-not-swapped(' || v_values || ')';
  END IF;
  IF to_regprocedure('private.get_user_role()') IS NULL THEN
    v_missing := v_missing || ' no-get_user_role';
  END IF;
  IF to_regclass('public.public_lawyers') IS NULL THEN
    v_missing := v_missing || ' no-public_lawyers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'inquiries'
                   AND policyname = 'inquiries_select_assigned_lawyer') THEN
    v_missing := v_missing || ' no-assigned-lawyer-policy';
  END IF;

  SELECT count(*) INTO v_admins FROM public.profiles
  WHERE role::TEXT = 'admin' AND COALESCE(is_active, TRUE) AND deleted_at IS NULL;
  SELECT count(*) INTO v_demo FROM public.profiles
  WHERE lower(email) IN ('sysadmin@westwoodlaw.ph','intake@westwoodlaw.ph','paralegal@westwoodlaw.ph');

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'user_role values (want client,lawyer,admin) : %', v_values;
  RAISE NOTICE 'active admins                               : %', v_admins;
  RAISE NOTICE 'demo staff accounts left                    : %', v_demo;
  RAISE NOTICE '--------------------------------------------------------------';
  IF v_missing = '' AND v_demo = 0 THEN
    RAISE NOTICE 'three-role model: OK';
  ELSE
    RAISE WARNING 'three-role model: INCOMPLETE —%', v_missing;
  END IF;
  IF v_admins = 0 THEN
    RAISE WARNING 'There is no active admin. Promote one before anyone signs in.';
  END IF;
END $$;
