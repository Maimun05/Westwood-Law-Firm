-- ============================================================================
-- 20261023  Role expansion: the six-role model
-- ============================================================================
-- Run AFTER 20261022. Safe to re-run (verified twice by
-- scripts/local-pg-validate.sh).
--
-- The firm outgrew three roles. The single 'admin' role becomes two —
--   * managing_partner : inherits every power the old admin had
--   * system_admin     : technical role; manages accounts + reads the audit
--                        trail, but no legal work (no matters, notes,
--                        documents, break-glass)
-- and three new working roles join 'lawyer':
--   * legal_assistant  : intake. Sees the inquiry queue and is notified about
--                        new client inquiries, together with the managing
--                        partner.
--   * paralegal        : can be added to a matter team. Sees the matter,
--                        internal notes, timeline and non-confidential
--                        documents; cannot change matter status, reassign
--                        lawyers, or open Confidential documents.
--
-- Decisions implemented (from the owner, 2026-10-13):
--   * Extend the role enum; keep RLS-policy enforcement (no permissions table).
--   * Existing admins migrate to managing_partner.
--   * Managing partner AND system admin manage staff accounts.
--   * Paralegals join matter teams (with the Confidential limits above).
--   * Intake + managing partner both get the new-inquiry bell.
--
-- WHY THE TEMP-TYPE SWAP (and not ALTER TYPE ... ADD VALUE):
--   The owner applies this file by pasting it into the Supabase SQL Editor as
--   one run, and a value added by ALTER TYPE ... ADD VALUE cannot be USED in
--   the same run. So: create user_role_new, move the column with a CASE that
--   maps admin -> managing_partner, drop the old type, rename the new one.
--
-- WHAT THE OLD TYPE PULLED WITH IT (found with pg_depend, not by guessing):
--   * column profiles.role + its default        -> handled by ALTER COLUMN TYPE
--   * function private.get_user_role()          -> return type changes, must
--                                                  be dropped and recreated
--   * policy profiles_update_own / profiles_update_policy (one per database
--     shape: the live project has the first, a replayed chain the second)
--   * policy inquiries_select_assigned_lawyer / inquiries_update_assigned_lawyer
--   * the public_lawyers view's rule
--   Everything else that mentions the old role names lives inside function
--   bodies, which CREATE OR REPLACE re-parses — so the ~30 policies calling
--   private.is_admin() and friends keep working untouched, as long as the
--   function is recreated under the same name (OIDs are preserved).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Drop the objects the old type drags down with it
-- ----------------------------------------------------------------------------
-- The "own-row UPDATE, role unchanged" rule exists under two names depending
-- on how the database was built: profiles_update_own (schema-production.sql,
-- i.e. the live project) or profiles_update_policy (20260918, i.e. a database
-- that replayed every migration file). Each shape has exactly one. Both are
-- dropped, and step 4 recreates the single canonical name
-- (profiles_update_own) on either shape — identical rule, no extra policy.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
DROP POLICY IF EXISTS inquiries_select_assigned_lawyer ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_assigned_lawyer ON public.inquiries;

-- get_user_role() returns the enum by value, so its return type is part of its
-- identity: DROP is the only way to change it. The view's stored rule holds a
-- direct reference to the old type, so it has to be rebuilt too.
DROP FUNCTION IF EXISTS private.get_user_role();
DROP VIEW IF EXISTS public.public_lawyers;


-- ----------------------------------------------------------------------------
-- 2. Swap the enum
-- ----------------------------------------------------------------------------
-- The column default is an expression over the OLD type, and there is no
-- implicit cast between two enum types, so ALTER COLUMN TYPE refuses to carry
-- it. Drop it, move the column, put it back against the new type.
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

DROP TYPE IF EXISTS public.user_role_new;
CREATE TYPE public.user_role_new AS ENUM
  ('client', 'lawyer', 'legal_assistant', 'paralegal', 'managing_partner', 'system_admin');

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING (CASE role::TEXT WHEN 'admin' THEN 'managing_partner' ELSE role::TEXT END)::public.user_role_new;

-- Fails loudly (the whole paste rolls back) if any dependent was missed — by
-- design, so a half-swapped database can never exist.
DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'client'::public.user_role;


-- ----------------------------------------------------------------------------
-- 3. Recreate the helpers against the new type
-- ----------------------------------------------------------------------------
-- is_admin() keeps its name and now means "managing partner" — the role that
-- inherited every power the old admin had. Every policy written against
-- is_admin() therefore keeps exactly the access it had, with zero policy
-- churn. The ::TEXT comparisons also make this file re-runnable: on a second
-- pass the literal is never cast to the enum, so nothing can fail to fold.

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

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT = 'managing_partner'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT = 'system_admin'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

-- Staff account management: the managing partner and the system admin.
CREATE OR REPLACE FUNCTION private.is_staff_account_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT IN ('managing_partner', 'system_admin')
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

-- Firm staff = everyone except clients. Used for the staff-facing surfaces
-- (staff directory, lawyer directory, inquiry attachments). The system admin
-- is trusted IT and belongs here; the legal-work boundaries are enforced by
-- is_admin()/team checks elsewhere, where the system admin does NOT appear.
CREATE OR REPLACE FUNCTION private.is_lawyer_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT IN ('lawyer', 'legal_assistant', 'paralegal', 'managing_partner', 'system_admin')
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_intake()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role::TEXT = 'legal_assistant'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_active_lawyer(p_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_id
      AND p.role::TEXT = 'lawyer'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

-- The lawyer team = assigned lawyer + team members whose profile role is
-- 'lawyer'. UNCHANGED in meaning: paralegals may now be matter_members, but
-- they are deliberately NOT in this set — Confidential content, break-glass
-- scope and status transitions stay lawyer-only.
CREATE OR REPLACE FUNCTION private.is_matter_lawyer_team(p_matter_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.matters m WHERE m.id = p_matter_id AND m.lawyer_id = (SELECT auth.uid()))
      OR EXISTS (SELECT 1 FROM public.matter_members mm
                 JOIN public.profiles p ON p.id = mm.lawyer_id
                 WHERE mm.matter_id = p_matter_id
                   AND mm.lawyer_id = (SELECT auth.uid())
                   AND p.role::TEXT = 'lawyer');
$$;

-- The full matter team = assigned lawyer + any member (lawyer OR paralegal).
-- Used where case support should count: matter access, notes, timeline.
CREATE OR REPLACE FUNCTION private.is_matter_team(p_matter_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.matters m WHERE m.id = p_matter_id AND m.lawyer_id = (SELECT auth.uid()))
      OR EXISTS (SELECT 1 FROM public.matter_members mm
                 WHERE mm.matter_id = p_matter_id AND mm.lawyer_id = (SELECT auth.uid()));
$$;

-- Anyone connected to the matter: client, matter team (incl. paralegals), MP.
CREATE OR REPLACE FUNCTION private.user_can_access_matter(p_matter_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.matters m WHERE m.id = p_matter_id AND m.client_id = (SELECT auth.uid()))
      OR private.is_matter_team(p_matter_id)
      OR (SELECT private.is_admin());
$$;

REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_system_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff_account_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_lawyer_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_intake() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_active_lawyer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_matter_lawyer_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_matter_team(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_can_access_matter(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff_account_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_lawyer_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_intake() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_lawyer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_matter_lawyer_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_matter_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_access_matter(UUID) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Recreate the policies the swap forced us to drop
-- ----------------------------------------------------------------------------
-- Texts match what each database had (auth.uid() stays wrapped as
-- (SELECT auth.uid()) so the auth_rls_initplan advisor stays quiet). The
-- profile policy is recreated under the canonical name on every shape — see
-- the note in step 1.
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


-- ----------------------------------------------------------------------------
-- 5. Rebuild the public lawyer directory view
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
-- 6. Functions whose bodies hard-coded the old role names
-- ----------------------------------------------------------------------------
-- plpgsql bodies are resolved at run time, so these would have kept parsing
-- after the swap — and then failed the first time they ran. Rewritten here.

-- The firm must always keep at least one active managing partner. (The system
-- admin pool is not guarded: a managing partner can always recreate it, so
-- demoting the last system admin can never lock the firm out.)
CREATE OR REPLACE FUNCTION private.guard_last_admin() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  IF OLD.role::TEXT = 'managing_partner'
     AND COALESCE(OLD.is_active, TRUE)
     AND (NEW.role::TEXT IS DISTINCT FROM 'managing_partner'
          OR NOT COALESCE(NEW.is_active, TRUE)
          OR NEW.deleted_at IS NOT NULL) THEN

    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role::TEXT = 'managing_partner'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active managing partner. Promote another account before changing this one.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.guard_last_admin_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  IF OLD.role::TEXT = 'managing_partner' AND COALESCE(OLD.is_active, TRUE) THEN
    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role::TEXT = 'managing_partner'
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active managing partner and cannot be deleted. Promote another account first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END $$;

-- Role/status/position changes: managing partner OR system admin (decision
-- 2026-10-13: both manage staff accounts).
CREATE OR REPLACE FUNCTION private.guard_profile_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > CURRENT_DATE OR NEW.date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'Birthday must be a real past date';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Email addresses cannot be changed from the app. Contact the firm.';
  END IF;

  IF auth.uid() IS NULL OR private.is_staff_account_admin() THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW.display_order IS DISTINCT FROM OLD.display_order THEN
    RAISE EXCEPTION 'You cannot change role, email, status, position or display order. Contact the firm.';
  END IF;
  RETURN NEW;
END $$;

-- Document metadata visibility. Paralegals see their matters' documents at
-- every level EXCEPT Confidential (lawyer team only, metadata for the MP);
-- 'Staff Shared' is firm-internal and includes paralegals; intake and the
-- system admin see no matter documents at all.
CREATE OR REPLACE FUNCTION private.can_access_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := (SELECT auth.uid()); v_role public.user_role; v_client UUID;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  SELECT m.client_id INTO v_client FROM public.matters m WHERE m.id = p_matter_id;
  RETURN CASE p_access_level
    WHEN 'Public'       THEN TRUE
    WHEN 'Staff Shared' THEN v_role::TEXT IN ('lawyer', 'paralegal', 'managing_partner')
    WHEN 'Client & Assigned Lawyer' THEN v_uid = v_client OR private.is_matter_team(p_matter_id) OR v_role::TEXT = 'managing_partner'
    WHEN 'Lawyer Only'  THEN private.is_matter_lawyer_team(p_matter_id) OR v_role::TEXT = 'managing_partner'
    WHEN 'Confidential' THEN private.is_matter_lawyer_team(p_matter_id) OR v_role::TEXT = 'managing_partner'  -- MP: metadata only
    ELSE FALSE END;
END $$;

-- Who may author a document. The managing partner stays view-only (20261012).
-- Paralegals may file on matters they are on, but never author Confidential.
CREATE OR REPLACE FUNCTION private.can_upload_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.user_can_access_matter(p_matter_id) THEN RETURN FALSE; END IF;
  RETURN CASE private.get_user_role()
    WHEN 'managing_partner' THEN FALSE           -- view-only: the MP never authors documents
    WHEN 'lawyer' THEN private.is_matter_lawyer_team(p_matter_id)
                       AND p_access_level IN ('Client & Assigned Lawyer','Staff Shared','Lawyer Only','Confidential')
    WHEN 'paralegal' THEN private.is_matter_team(p_matter_id)
                       AND p_access_level IN ('Client & Assigned Lawyer','Staff Shared','Lawyer Only')
    WHEN 'client' THEN p_access_level = 'Client & Assigned Lawyer'
    ELSE FALSE END;
END $$;

-- Matter teams accept lawyers AND paralegals. Everyone else is still refused.
CREATE OR REPLACE FUNCTION private.on_matter_member_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.matter_members; v_assigned UUID;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT lawyer_id INTO v_assigned FROM public.matters WHERE id = r.matter_id;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.lawyer_id AND role::TEXT IN ('lawyer', 'paralegal')) THEN
      RAISE EXCEPTION 'Only lawyers and paralegals can be added to a matter team';
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

-- New client inquiries ring the bell for the managing partner AND intake
-- (decision 2026-10-13: intake owns first response).
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
    WHERE p.role::TEXT IN ('managing_partner', 'legal_assistant')
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

-- A matter's assigned lawyer must be a lawyer — the old body also accepted
-- 'admin', which no longer exists and was never exercised by the app
-- (convert_inquiry_to_matter validates role = 'lawyer' already).
CREATE OR REPLACE FUNCTION private.validate_matter_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.lawyer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = NEW.lawyer_id
      AND p.role::TEXT = 'lawyer'
  ) THEN
    RAISE EXCEPTION 'lawyer_id must reference a lawyer profile';
  END IF;

  RETURN NEW;
END $$;


-- ----------------------------------------------------------------------------
-- 7. Policy updates that the paralegal team membership requires
-- ----------------------------------------------------------------------------
-- Internal notes + timeline: the full matter team (lawyers and paralegals)
-- reads and writes internal notes; client-visible updates remain lawyer-
-- authored (and the MP's client-visible path is unchanged); clients keep the
-- 20261004 insert policy of their own.

DROP POLICY IF EXISTS matter_notes_select ON public.matter_notes;
CREATE POLICY matter_notes_select ON public.matter_notes FOR SELECT TO authenticated
  USING ((SELECT private.is_matter_team(matter_id))
      OR (visibility = 'client' AND (SELECT private.user_can_access_matter(matter_id))));

DROP POLICY IF EXISTS matter_notes_insert ON public.matter_notes;
CREATE POLICY matter_notes_insert ON public.matter_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid())
    AND ((SELECT private.is_matter_lawyer_team(matter_id))
      OR ((SELECT private.is_matter_team(matter_id)) AND visibility = 'internal')
      OR (visibility = 'client' AND (SELECT private.is_admin()))));

DROP POLICY IF EXISTS matter_events_select ON public.matter_events;
CREATE POLICY matter_events_select ON public.matter_events FOR SELECT TO authenticated
  USING ((visible_to_client AND (SELECT private.user_can_access_matter(matter_id)))
      OR (SELECT private.is_matter_team(matter_id)) OR (SELECT private.is_admin()));


-- ----------------------------------------------------------------------------
-- 8. New surfaces for the new roles
-- ----------------------------------------------------------------------------
-- Intake works the inquiry queue: SELECT on every inquiry (their first-response
-- list). Acting on one still runs through the existing guards — the assigned-
-- lawyer policy and guard_inquiry_update() are untouched.
DROP POLICY IF EXISTS inquiries_select_intake ON public.inquiries;
CREATE POLICY inquiries_select_intake ON public.inquiries
FOR SELECT TO authenticated
USING ((SELECT private.is_intake()));

-- The system admin manages accounts: full UPDATE on profiles, still bounded by
-- guard_profile_update() (which allows role/status edits for account admins)
-- and by the last-managing-partner guard.
DROP POLICY IF EXISTS profiles_update_system_admin ON public.profiles;
CREATE POLICY profiles_update_system_admin ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT private.is_system_admin()))
WITH CHECK ((SELECT private.is_system_admin()));

-- The system admin reviews the audit trail.
DROP POLICY IF EXISTS audit_logs_select_system_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_system_admin ON public.audit_logs
FOR SELECT TO authenticated
USING ((SELECT private.is_system_admin()));


-- ----------------------------------------------------------------------------
-- 9. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_values    TEXT;
  v_count     INT;
  v_missing   TEXT := '';
  v_mps       INT;
BEGIN
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_values
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'user_role';
  SELECT count(*) INTO v_count FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'user_role';

  IF v_count <> 6
     OR EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'admin') THEN
    v_missing := v_missing || ' enum-not-swapped(' || v_values || ')';
  END IF;
  IF to_regprocedure('private.get_user_role()') IS NULL THEN
    v_missing := v_missing || ' no-get_user_role';
  END IF;
  IF to_regprocedure('private.is_system_admin()') IS NULL THEN
    v_missing := v_missing || ' no-is_system_admin';
  END IF;
  IF to_regprocedure('private.is_staff_account_admin()') IS NULL THEN
    v_missing := v_missing || ' no-is_staff_account_admin';
  END IF;
  IF to_regprocedure('private.is_matter_team(uuid)') IS NULL THEN
    v_missing := v_missing || ' no-is_matter_team';
  END IF;
  IF to_regclass('public.public_lawyers') IS NULL THEN
    v_missing := v_missing || ' no-public_lawyers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'inquiries'
                   AND policyname = 'inquiries_select_intake') THEN
    v_missing := v_missing || ' no-intake-policy';
  END IF;

  SELECT count(*) INTO v_mps FROM public.profiles
  WHERE role::TEXT = 'managing_partner' AND COALESCE(is_active, TRUE) AND deleted_at IS NULL;

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'user_role values (want 6, no admin)     : %', v_values;
  RAISE NOTICE 'active managing partners                : %', v_mps;
  RAISE NOTICE '--------------------------------------------------------------';
  IF v_missing = '' THEN
    RAISE NOTICE 'role expansion: OK';
  ELSE
    RAISE WARNING 'role expansion: INCOMPLETE —%', v_missing;
  END IF;
  IF v_mps = 0 THEN
    RAISE WARNING 'There is no active managing partner. Promote one (a managing partner or system admin can do it from Staff Management).';
  END IF;
END $$;
