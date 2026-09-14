-- ============================================================================
-- 20261003  Integrity hardening
-- ============================================================================
-- Run AFTER 20261001_consolidated_access_control.sql. Safe to re-run.
--
-- Closes six holes found in the role audit:
--
--   1. Last-admin guard. Nothing stopped an admin demoting or deactivating
--      their own account, which could leave the firm with no administrator
--      and no way back in (there is no reactivation screen).
--   2. Deactivation was cosmetic. signIn() never checked is_active, so a
--      "deactivated" user could still log in and still hold their role in
--      every RLS policy. The role helpers now return nothing for inactive
--      accounts, so the database itself denies them.
--   3. The audit trail was half-forgeable. Trigger-written rows (break-glass,
--      matter transitions, profile edits) are trustworthy; rows written from
--      the browser are self-reported. They were indistinguishable. Rows are
--      now stamped with their source.
--   4. profiles.email could be changed by an admin from the browser console
--      while auth.users.email stayed stale, silently breaking login.
--   5. The audit trail could be erased outright. cleanup_old_audit_logs() was
--      SECURITY DEFINER and granted to PUBLIC (which includes anon), so any
--      visitor could run cleanup_old_audit_logs(0) and delete the whole
--      history, break-glass records included.
--   6. (application-side) see the matching UI guards in ClientPortal.tsx.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Audit rows carry their source
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'client';

DO $$ BEGIN
  ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_source_check CHECK (source IN ('trigger', 'client'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.audit_logs.source IS
  'trigger = written by a database trigger via private.write_audit (trustworthy). '
  'client = written by the browser (self-reported, cannot be verified).';

-- Re-create the audit writer so its rows are stamped as trigger-written.
CREATE OR REPLACE FUNCTION private.write_audit(
  p_event TEXT, p_desc TEXT, p_type TEXT, p_id TEXT,
  p_meta JSONB DEFAULT NULL, p_success BOOLEAN DEFAULT TRUE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid UUID := auth.uid(); v_email TEXT; v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;  -- SQL editor / service role
  SELECT p.email, p.role::TEXT INTO v_email, v_role FROM public.profiles p WHERE p.id = v_uid;
  -- Declares this write as trigger-originated. private.stamp_audit_source()
  -- reads and clears it; a browser cannot set it.
  PERFORM set_config('app.audit_source', 'trigger', TRUE);
  INSERT INTO public.audit_logs
    (user_id, user_email, user_role, event_type, event_description, resource_type, resource_id, metadata, success, source)
  VALUES (v_uid, v_email, v_role, p_event, p_desc, p_type, p_id, p_meta, p_success, 'trigger');
EXCEPTION WHEN OTHERS THEN
  -- Audit logging must never block the operation being audited (a profile edit,
  -- a matter update, ...). If audit_logs has drifted from the expected shape we
  -- warn loudly and let the caller continue.
  RAISE WARNING 'audit row skipped: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.write_audit(TEXT,TEXT,TEXT,TEXT,JSONB,BOOLEAN) FROM PUBLIC;

-- There is a SECOND audit writer. log_auth_event() (from 20260916) fires on
-- every insert/update of public.profiles and writes ACCOUNT_CREATED,
-- ROLE_CHANGED and ACCOUNT_DEACTIVATED rows with a bare INSERT, so those rows
-- were landing as source='client' and would have been displayed as
-- "self-reported by the browser" in the admin audit screen. Re-create it
-- stamped as trigger-written.
--
-- It deliberately does NOT route through private.write_audit(): that function
-- returns early when auth.uid() IS NULL, and profile rows are created by
-- handle_new_user() running as the service role, so ACCOUNT_CREATED would be
-- lost entirely.
--
-- private.stamp_audit_source() clears the flag after every row, so each insert
-- below has to declare itself again.
CREATE OR REPLACE FUNCTION public.log_auth_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM set_config('app.audit_source', 'trigger', TRUE);
    INSERT INTO public.audit_logs
      (user_id, user_email, event_type, event_description, success, source)
    VALUES
      (NEW.id, NEW.email, 'ACCOUNT_CREATED',
       'User account created: ' || NEW.email, TRUE, 'trigger');
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      PERFORM set_config('app.audit_source', 'trigger', TRUE);
      INSERT INTO public.audit_logs
        (user_id, user_email, user_role, event_type, event_description,
         resource_type, resource_id, metadata, success, source)
      VALUES
        (NEW.id, NEW.email, NEW.role::TEXT, 'ROLE_CHANGED',
         'User role changed from ' || OLD.role || ' to ' || NEW.role,
         'user', NEW.id::TEXT,
         jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role),
         TRUE, 'trigger');
    END IF;

    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
      PERFORM set_config('app.audit_source', 'trigger', TRUE);
      INSERT INTO public.audit_logs
        (user_id, user_email, user_role, event_type, event_description,
         resource_type, resource_id, success, source)
      VALUES
        (NEW.id, NEW.email, NEW.role::TEXT, 'ACCOUNT_DEACTIVATED',
         'User account deactivated: ' || NEW.email,
         'user', NEW.id::TEXT, TRUE, 'trigger');
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Backfill: the browser never writes ROLE_CHANGED or ACCOUNT_DEACTIVATED
-- (checked against src/lib/services/audit.ts and every call site), so any such
-- row that predates this migration came from the trigger above.
-- ACCOUNT_CREATED is deliberately left alone: both the trigger and
-- auth.ts:107 write it, and guessing wrong would mark a browser row as
-- trustworthy.
UPDATE public.audit_logs
   SET source = 'trigger'
 WHERE source = 'client'
   AND event_type IN ('ROLE_CHANGED', 'ACCOUNT_DEACTIVATED');

-- The browser must not be able to claim it was a trigger.
--
-- audit_logs has an INSERT policy of WITH CHECK (auth.uid() = user_id), and the
-- source column is just another column, so a signed-in user could insert
--   INSERT INTO audit_logs (..., source) VALUES (..., 'trigger');
-- and mint a row that the admin screen shows as authoritative — for example a
-- fake CONFIDENTIAL_BREAK_GLASS entry to muddy the record of who opened a
-- privileged file.
--
-- auth.uid() cannot be the discriminator: private.write_audit() is SECURITY
-- DEFINER but still sees the caller's JWT, so it would be downgraded too. Use a
-- transaction-local flag instead. PostgREST gives a client no way to set a
-- custom GUC, so only our own functions can raise it, and the trigger lowers it
-- again immediately so one declared write cannot vouch for the next.
CREATE OR REPLACE FUNCTION private.stamp_audit_source() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_declared TEXT := current_setting('app.audit_source', TRUE);
BEGIN
  IF v_declared IS DISTINCT FROM 'trigger' THEN
    NEW.source := 'client';
  END IF;
  PERFORM set_config('app.audit_source', '', TRUE);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_logs_stamp_source ON public.audit_logs;
CREATE TRIGGER audit_logs_stamp_source BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION private.stamp_audit_source();


-- ----------------------------------------------------------------------------
-- 2. Deactivated accounts lose their role everywhere
-- ----------------------------------------------------------------------------
-- Every role-gated policy in the schema routes through one of these three
-- helpers, so returning nothing here denies an inactive account access to
-- everything except its own profile row (which uses auth.uid() = id directly).
CREATE OR REPLACE FUNCTION private.get_user_role()
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
      AND p.role = 'admin'::public.user_role
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.is_lawyer_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('lawyer'::public.user_role, 'admin'::public.user_role)
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_lawyer_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_lawyer_or_admin() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. The firm must always keep at least one active administrator
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_last_admin() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  -- Only fire when an *active* admin is being removed from the admin pool.
  IF OLD.role = 'admin'::public.user_role
     AND COALESCE(OLD.is_active, TRUE)
     AND (NEW.role IS DISTINCT FROM 'admin'::public.user_role
          OR NOT COALESCE(NEW.is_active, TRUE)
          OR NEW.deleted_at IS NOT NULL) THEN

    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role = 'admin'::public.user_role
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active administrator. Promote another account to admin before changing this one.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.guard_last_admin_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_remaining INT;
BEGIN
  IF OLD.role = 'admin'::public.user_role AND COALESCE(OLD.is_active, TRUE) THEN
    SELECT count(*) INTO v_remaining
    FROM public.profiles p
    WHERE p.role = 'admin'::public.user_role
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
      AND p.id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION
        'This is the last active administrator and cannot be deleted. Promote another account first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS profiles_last_admin ON public.profiles;
CREATE TRIGGER profiles_last_admin BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_last_admin();

DROP TRIGGER IF EXISTS profiles_last_admin_delete ON public.profiles;
CREATE TRIGGER profiles_last_admin_delete BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_last_admin_delete();


-- ----------------------------------------------------------------------------
-- 4. Email is owned by auth.users, never by profiles
-- ----------------------------------------------------------------------------
-- Changing profiles.email alone silently desynchronises the login identity from
-- the displayed one. The app already hides the field; this makes it real.
-- auth.uid() IS NULL means the SQL editor / service role, which is the one path
-- that legitimately needs to repair a drifted address.
CREATE OR REPLACE FUNCTION private.guard_profile_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > CURRENT_DATE OR NEW.date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'Birthday must be a real past date';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Email addresses cannot be changed from the app. Contact the firm.';
  END IF;

  IF auth.uid() IS NULL OR private.is_admin() THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW.display_order IS DISTINCT FROM OLD.display_order THEN
    RAISE EXCEPTION 'You cannot change role, email, status, position or display order. Contact the firm.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_update ON public.profiles;
CREATE TRIGGER profiles_guard_update BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_profile_update();


-- ----------------------------------------------------------------------------
-- 5. The audit trail cannot be erased by the people it audits
-- ----------------------------------------------------------------------------
-- cleanup_old_audit_logs() was SECURITY DEFINER (so it bypasses the RLS
-- policies on audit_logs) and was granted to PUBLIC, which in this schema
-- includes anon. Any visitor who knew the function name could run
--   SELECT public.cleanup_old_audit_logs(0);
-- and delete the firm's entire audit history -- including the
-- CONFIDENTIAL_BREAK_GLASS rows that record who opened a privileged client
-- file. It also had no search_path pin, which is a hijack risk in a
-- SECURITY DEFINER function.
--
-- Now: admins only, a hard 30-day floor, and a pinned search_path.
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE deleted_count INTEGER;
BEGIN
  -- auth.uid() IS NULL means service role / SQL editor (the cron path).
  IF auth.uid() IS NOT NULL AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can prune the audit trail';
  END IF;

  IF days_to_keep IS NULL OR days_to_keep < 30 THEN
    RAISE EXCEPTION 'Refusing to delete audit rows newer than 30 days (asked for %)', days_to_keep;
  END IF;

  DELETE FROM public.audit_logs
   WHERE created_at < NOW() - make_interval(days => days_to_keep);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;

REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) TO service_role;


-- ----------------------------------------------------------------------------
-- 6. Report what is now in force
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_admins INT; v_sources TEXT;
BEGIN
  SELECT count(*) INTO v_admins FROM public.profiles
  WHERE role = 'admin' AND COALESCE(is_active, TRUE) AND deleted_at IS NULL;
  SELECT string_agg(DISTINCT source, ', ') INTO v_sources FROM public.audit_logs;

  RAISE NOTICE 'Active administrators: %', v_admins;
  IF v_admins = 0 THEN
    RAISE WARNING 'There is no active administrator. Promote one before relying on the admin screens.';
  END IF;
  RAISE NOTICE 'audit_logs sources present: %', COALESCE(v_sources, '(none yet)');
END $$;
