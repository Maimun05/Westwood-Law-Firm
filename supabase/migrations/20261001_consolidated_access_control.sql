-- ============================================================================
-- 20261001  Consolidated access control, composite names, lawyer directory
-- ============================================================================
-- Run AFTER all earlier migrations. Safe to re-run.
-- Decisions implemented (from the owner):
--   * Confidential documents: option B. Admins see file name + metadata only.
--     Opening content needs a typed reason ("break-glass"), is audited and
--     notifies the assigned lawyer. Access = assigned lawyer + matter_members.
--   * Matters: clients are read-only. Assigned lawyer moves status along
--     allowed transitions. Admin creates matters, converts inquiries, reassigns.
--   * Composite names, birthday validation, audited profile edits.
--   * "Our Lawyers" served from a safe public view (fixes the 0-lawyers bug).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

-- ----------------------------------------------------------------------------
-- 0. Audit helper (writes to the live audit_logs shape from 20260916)
-- ----------------------------------------------------------------------------
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
  INSERT INTO public.audit_logs
    (user_id, user_email, user_role, event_type, event_description, resource_type, resource_id, metadata, success)
  VALUES (v_uid, v_email, v_role, p_event, p_desc, p_type, p_id, p_meta, p_success);
EXCEPTION WHEN OTHERS THEN
  -- Audit logging must never block the operation being audited (a profile edit,
  -- a matter update, ...). If audit_logs has drifted from the expected shape we
  -- warn loudly and let the caller continue.
  RAISE WARNING 'audit row skipped: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION private.write_audit(TEXT,TEXT,TEXT,TEXT,JSONB,BOOLEAN) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 1. Profiles: composite name, birthday, guarded + audited edits
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS honorific   TEXT,
  ADD COLUMN IF NOT EXISTS first_name  TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS suffix      TEXT,
  ADD COLUMN IF NOT EXISTS nickname    TEXT,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- Backfill parts from legacy full_name (best effort; users can correct them in Profile)
UPDATE public.profiles p SET
  first_name  = t.parts[1],
  middle_name = CASE WHEN array_length(t.parts,1) > 2 THEN array_to_string(t.parts[2:array_length(t.parts,1)-1],' ') END,
  last_name   = CASE WHEN array_length(t.parts,1) > 1 THEN t.parts[array_length(t.parts,1)] END
FROM (
  SELECT id, string_to_array(btrim(regexp_replace(full_name,'^(Atty\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+','')),' ') AS parts
  FROM public.profiles WHERE first_name IS NULL AND full_name IS NOT NULL AND role = 'client'
) t
WHERE p.id = t.id AND array_length(t.parts,1) >= 1;

-- Keep full_name in sync so every existing screen keeps working.
CREATE OR REPLACE FUNCTION private.compose_full_name() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NULLIF(btrim(NEW.first_name),'') IS NOT NULL AND NULLIF(btrim(NEW.last_name),'') IS NOT NULL THEN
    NEW.full_name := btrim(concat_ws(' ',
      NULLIF(btrim(NEW.honorific),''),
      btrim(NEW.first_name),
      CASE WHEN NULLIF(btrim(NEW.nickname),'') IS NOT NULL THEN '"' || btrim(NEW.nickname) || '"' END,
      NULLIF(btrim(NEW.middle_name),''),
      btrim(NEW.last_name)))
      || CASE WHEN NULLIF(btrim(NEW.suffix),'') IS NOT NULL THEN ', ' || btrim(NEW.suffix) ELSE '' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_compose_name ON public.profiles;
CREATE TRIGGER profiles_compose_name BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.compose_full_name();

-- Who may change what on a profile
CREATE OR REPLACE FUNCTION private.guard_profile_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL AND (NEW.date_of_birth > CURRENT_DATE OR NEW.date_of_birth < DATE '1900-01-01') THEN
    RAISE EXCEPTION 'Birthday must be a real past date';
  END IF;
  IF auth.uid() IS NULL OR private.is_admin() THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.email IS DISTINCT FROM OLD.email
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

-- Every profile change is audited with old/new values
CREATE OR REPLACE FUNCTION private.audit_profile_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old JSONB := to_jsonb(OLD); v_new JSONB := to_jsonb(NEW); k TEXT; v_changes JSONB := '{}'::JSONB;
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_new) LOOP
    IF k NOT IN ('updated_at','full_name') AND v_new->k IS DISTINCT FROM v_old->k THEN
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
    END IF;
  END LOOP;
  IF v_changes <> '{}'::JSONB THEN
    PERFORM private.write_audit(
      CASE WHEN auth.uid() = NEW.id THEN 'PROFILE_UPDATED' ELSE 'PROFILE_UPDATED_BY_ADMIN' END,
      'Profile fields changed: ' || (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_changes) key),
      'profile', NEW.id::TEXT, v_changes);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_audit_update ON public.profiles;
CREATE TRIGGER profiles_audit_update AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.audit_profile_update();

-- New-user trigger: read name parts, birthday, address, city from signup metadata
CREATE OR REPLACE FUNCTION private.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m JSONB := COALESCE(NEW.raw_user_meta_data,'{}'::JSONB); v_name TEXT;
BEGIN
  v_name := COALESCE(NULLIF(m->>'full_name',''), NULLIF(m->>'name',''),
    NULLIF(btrim(concat_ws(' ', m->>'first_name', m->>'middle_name', m->>'last_name')),''),
    split_part(COALESCE(NEW.email,''),'@',1), 'New User');
  INSERT INTO public.profiles
    (id, email, full_name, first_name, middle_name, last_name, suffix, phone, address, city, date_of_birth, role)
  VALUES (NEW.id, NEW.email, v_name,
    NULLIF(m->>'first_name',''), NULLIF(m->>'middle_name',''), NULLIF(m->>'last_name',''), NULLIF(m->>'suffix',''),
    NULLIF(m->>'phone',''), NULLIF(m->>'address',''), NULLIF(m->>'city',''),
    NULLIF(m->>'date_of_birth','')::DATE, 'client'::public.user_role)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END $$;

-- The function is useless without the trigger, and the trigger was only ever
-- created by schema-production.sql — which is not the base of every project
-- (the live one included). Without it, EVERY auth user (signup, the
-- admin-create-user edge function, and the lawyer seed below) is created with
-- no profiles row: the portal then cannot load a profile, and the seed's
-- email lookup finds nothing and re-inserts an existing auth user.
-- Guarded, because creating a trigger on auth.users needs table ownership and
-- a missing trigger must not block the rest of this file.
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();
  RAISE NOTICE 'on_auth_user_created is installed on auth.users';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not install on_auth_user_created on auth.users (%): every new account will have no profiles row until it is created from the dashboard.', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 2. New tables: matter team, notes, timeline, break-glass grants
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matter_members (
  matter_id  UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  lawyer_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (matter_id, lawyer_id)
);

CREATE TABLE IF NOT EXISTS public.matter_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id  UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.matter_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id         UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  title             TEXT NOT NULL,
  detail            TEXT,
  actor_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.confidential_access_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  admin_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (char_length(btrim(reason)) >= 15),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_matter_members_lawyer ON public.matter_members(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_matter_notes_matter   ON public.matter_notes(matter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matter_events_matter  ON public.matter_events(matter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grants_doc_admin      ON public.confidential_access_grants(document_id, admin_id, expires_at);

ALTER TABLE public.matter_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confidential_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matter_members, public.matter_notes, public.matter_events, public.confidential_access_grants FROM anon;

DROP TRIGGER IF EXISTS matter_notes_updated_at ON public.matter_notes;
CREATE TRIGGER matter_notes_updated_at BEFORE UPDATE ON public.matter_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Helpers (SECURITY DEFINER so they are not blocked by RLS)
-- ----------------------------------------------------------------------------
-- Lawyer team = assigned lawyer + explicitly added lawyers. NOT admins.
CREATE OR REPLACE FUNCTION private.is_matter_lawyer_team(p_matter_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.matters m WHERE m.id = p_matter_id AND m.lawyer_id = (SELECT auth.uid()))
      OR EXISTS (SELECT 1 FROM public.matter_members mm WHERE mm.matter_id = p_matter_id AND mm.lawyer_id = (SELECT auth.uid()));
$$;

-- Anyone connected to the matter: client, lawyer team, admin
CREATE OR REPLACE FUNCTION private.user_can_access_matter(p_matter_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.matters m WHERE m.id = p_matter_id AND m.client_id = (SELECT auth.uid()))
      OR private.is_matter_lawyer_team(p_matter_id)
      OR (SELECT private.is_admin());
$$;

CREATE OR REPLACE FUNCTION private.matter_transition_allowed(
  p_old public.matter_status, p_new public.matter_status, p_is_admin BOOLEAN
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_old = p_new OR CASE p_old
    WHEN 'New Inquiry'   THEN p_new IN ('Under Review','Closed')
    WHEN 'Under Review'  THEN p_new IN ('Consultation','Conflict Check','Closed')
    WHEN 'Consultation'  THEN p_new IN ('Conflict Check','Closed')
    WHEN 'Conflict Check' THEN p_new IN ('Accepted','Closed')   -- Accepted only after a conflict check
    WHEN 'Accepted'      THEN p_new IN ('Active','Closed')
    WHEN 'Active'        THEN p_new IN ('Resolved','Closed')
    WHEN 'Resolved'      THEN p_new IN ('Active','Closed')
    WHEN 'Closed'        THEN p_is_admin AND p_new = 'Under Review'
    ELSE FALSE END;
$$;

-- Metadata visibility of a document (file name, type, size, dates).
-- Admin sees metadata of everything; CONTENT is decided by can_read_document_content.
CREATE OR REPLACE FUNCTION private.can_access_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid UUID := (SELECT auth.uid()); v_role public.user_role; v_client UUID;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  SELECT m.client_id INTO v_client FROM public.matters m WHERE m.id = p_matter_id;
  RETURN CASE p_access_level
    WHEN 'Public'       THEN TRUE
    WHEN 'Staff Shared' THEN v_role IN ('lawyer','admin')
    WHEN 'Client & Assigned Lawyer' THEN v_uid = v_client OR private.is_matter_lawyer_team(p_matter_id) OR v_role = 'admin'
    WHEN 'Lawyer Only'  THEN private.is_matter_lawyer_team(p_matter_id) OR v_role = 'admin'
    WHEN 'Confidential' THEN private.is_matter_lawyer_team(p_matter_id) OR v_role = 'admin'  -- admin: metadata only
    ELSE FALSE END;
END $$;

-- Content access (storage). Confidential: lawyer team, or an admin with a live break-glass grant.
CREATE OR REPLACE FUNCTION private.can_read_document_content(p_document_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE d RECORD; v_uid UUID := (SELECT auth.uid());
BEGIN
  SELECT matter_id, access_level INTO d FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF d.access_level = 'Confidential' THEN
    RETURN private.is_matter_lawyer_team(d.matter_id)
        OR EXISTS (SELECT 1 FROM public.confidential_access_grants g
                   WHERE g.document_id = p_document_id AND g.admin_id = v_uid AND g.expires_at > NOW());
  END IF;
  RETURN private.can_access_document(d.matter_id, d.access_level);
END $$;

CREATE OR REPLACE FUNCTION private.can_upload_document(p_matter_id UUID, p_access_level public.access_level)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.user_can_access_matter(p_matter_id) THEN RETURN FALSE; END IF;
  RETURN CASE private.get_user_role()
    WHEN 'admin'  THEN p_access_level <> 'Confidential'      -- admins never author privileged content
    WHEN 'lawyer' THEN private.is_matter_lawyer_team(p_matter_id)
                       AND p_access_level IN ('Client & Assigned Lawyer','Staff Shared','Lawyer Only','Confidential')
    WHEN 'client' THEN p_access_level = 'Client & Assigned Lawyer'
    ELSE FALSE END;
END $$;

REVOKE ALL ON FUNCTION private.is_matter_lawyer_team(UUID), private.user_can_access_matter(UUID),
  private.matter_transition_allowed(public.matter_status, public.matter_status, BOOLEAN),
  private.can_access_document(UUID, public.access_level), private.can_read_document_content(UUID),
  private.can_upload_document(UUID, public.access_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_matter_lawyer_team(UUID), private.user_can_access_matter(UUID),
  private.matter_transition_allowed(public.matter_status, public.matter_status, BOOLEAN),
  private.can_access_document(UUID, public.access_level), private.can_read_document_content(UUID),
  private.can_upload_document(UUID, public.access_level) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Matters: clients read-only; lawyer moves status; admin creates/reassigns
-- ----------------------------------------------------------------------------
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='matters' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.matters', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS matters_select_involved ON public.matters;
CREATE POLICY matters_select_involved ON public.matters FOR SELECT TO authenticated
  USING ((SELECT private.user_can_access_matter(id)));
DROP POLICY IF EXISTS matters_insert_admin ON public.matters;
CREATE POLICY matters_insert_admin ON public.matters FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));
DROP POLICY IF EXISTS matters_update_admin ON public.matters;
CREATE POLICY matters_update_admin ON public.matters FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
DROP POLICY IF EXISTS matters_update_assigned_lawyer ON public.matters;
CREATE POLICY matters_update_assigned_lawyer ON public.matters FOR UPDATE TO authenticated
  USING (lawyer_id = (SELECT auth.uid())) WITH CHECK (lawyer_id = (SELECT auth.uid()));
-- No client write policy and no DELETE policy: clients contact the firm by email/inquiry.

CREATE OR REPLACE FUNCTION private.guard_matter_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_admin := private.is_admin();
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.matter_number IS DISTINCT FROM OLD.matter_number THEN
    RAISE EXCEPTION 'Client and matter number cannot be changed';
  END IF;
  IF NOT v_admin AND (NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id OR NEW.practice_area IS DISTINCT FROM OLD.practice_area) THEN
    RAISE EXCEPTION 'Only an admin can reassign the lawyer or change the practice area';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT private.matter_transition_allowed(OLD.status, NEW.status, v_admin) THEN
      RAISE EXCEPTION 'Status cannot move from % to %', OLD.status, NEW.status;
    END IF;
    NEW.date_closed := CASE WHEN NEW.status = 'Closed' THEN CURRENT_DATE ELSE NULL END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matters_guard_update ON public.matters;
CREATE TRIGGER matters_guard_update BEFORE UPDATE ON public.matters
FOR EACH ROW EXECUTE FUNCTION private.guard_matter_update();

-- Timeline + audit for matter changes
CREATE OR REPLACE FUNCTION private.log_matter_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.matter_events(matter_id,event_type,title,actor_id)
    VALUES (NEW.id,'created','Matter opened: ' || NEW.title, auth.uid());
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.matter_events(matter_id,event_type,title,detail,actor_id)
      VALUES (NEW.id,'status','Status changed', OLD.status::TEXT || ' → ' || NEW.status::TEXT, auth.uid());
      PERFORM private.write_audit('MATTER_STATUS_CHANGED','Matter status ' || OLD.status || ' → ' || NEW.status,'matter',NEW.id::TEXT,
        jsonb_build_object('old',OLD.status,'new',NEW.status));
    END IF;
    IF NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id THEN
      INSERT INTO public.matter_events(matter_id,event_type,title,actor_id)
      VALUES (NEW.id,'assignment','Assigned lawyer changed', auth.uid());
      PERFORM private.write_audit('MATTER_LAWYER_REASSIGNED','Assigned lawyer changed','matter',NEW.id::TEXT,
        jsonb_build_object('old',OLD.lawyer_id,'new',NEW.lawyer_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matters_log_change ON public.matters;
CREATE TRIGGER matters_log_change AFTER INSERT OR UPDATE OF status, lawyer_id ON public.matters
FOR EACH ROW EXECUTE FUNCTION private.log_matter_change();

-- Team membership
DROP POLICY IF EXISTS matter_members_select ON public.matter_members;
CREATE POLICY matter_members_select ON public.matter_members FOR SELECT TO authenticated
  USING ((SELECT private.user_can_access_matter(matter_id)));
DROP POLICY IF EXISTS matter_members_insert ON public.matter_members;
CREATE POLICY matter_members_insert ON public.matter_members FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin())
    OR EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_members.matter_id AND m.lawyer_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS matter_members_delete ON public.matter_members;
CREATE POLICY matter_members_delete ON public.matter_members FOR DELETE TO authenticated
  USING ((SELECT private.is_admin())
    OR EXISTS (SELECT 1 FROM public.matters m WHERE m.id = matter_members.matter_id AND m.lawyer_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION private.on_matter_member_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.matter_members; v_assigned UUID;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT lawyer_id INTO v_assigned FROM public.matters WHERE id = r.matter_id;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.lawyer_id AND role = 'lawyer') THEN
      RAISE EXCEPTION 'Only lawyers can be added to a matter team';
    END IF;
    NEW.added_by := auth.uid();
  END IF;
  PERFORM private.write_audit('MATTER_TEAM_' || TG_OP, 'Matter team member ' || lower(TG_OP), 'matter', r.matter_id::TEXT,
    jsonb_build_object('lawyer_id', r.lawyer_id));
  IF v_assigned IS NOT NULL AND v_assigned IS DISTINCT FROM auth.uid() THEN
    PERFORM private.create_notification(v_assigned, 'Matter team changed',
      'A lawyer was ' || CASE WHEN TG_OP='INSERT' THEN 'added to' ELSE 'removed from' END || ' one of your matters.', 'info', 'matters');
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS matter_members_change_ins ON public.matter_members;
CREATE TRIGGER matter_members_change_ins BEFORE INSERT ON public.matter_members
FOR EACH ROW EXECUTE FUNCTION private.on_matter_member_change();
DROP TRIGGER IF EXISTS matter_members_change_del ON public.matter_members;
CREATE TRIGGER matter_members_change_del AFTER DELETE ON public.matter_members
FOR EACH ROW EXECUTE FUNCTION private.on_matter_member_change();

-- Notes: internal notes are for the lawyer team only (admins never see them)
DROP POLICY IF EXISTS matter_notes_select ON public.matter_notes;
CREATE POLICY matter_notes_select ON public.matter_notes FOR SELECT TO authenticated
  USING ((SELECT private.is_matter_lawyer_team(matter_id))
      OR (visibility = 'client' AND (SELECT private.user_can_access_matter(matter_id))));
DROP POLICY IF EXISTS matter_notes_insert ON public.matter_notes;
CREATE POLICY matter_notes_insert ON public.matter_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid())
    AND ((SELECT private.is_matter_lawyer_team(matter_id))
      OR (visibility = 'client' AND (SELECT private.is_admin()))));
DROP POLICY IF EXISTS matter_notes_update_own ON public.matter_notes;
CREATE POLICY matter_notes_update_own ON public.matter_notes FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid())) WITH CHECK (author_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS matter_notes_delete_own ON public.matter_notes;
CREATE POLICY matter_notes_delete_own ON public.matter_notes FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.on_matter_note_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client UUID;
BEGIN
  INSERT INTO public.matter_events(matter_id,event_type,title,actor_id,visible_to_client)
  VALUES (NEW.matter_id,'note', CASE WHEN NEW.visibility='client' THEN 'Update from your lawyer' ELSE 'Internal note added' END,
          NEW.author_id, NEW.visibility = 'client');
  IF NEW.visibility = 'client' THEN
    SELECT client_id INTO v_client FROM public.matters WHERE id = NEW.matter_id;
    PERFORM private.create_notification(v_client, 'New update on your matter', left(NEW.body, 140), 'info', 'matters');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS matter_notes_after_insert ON public.matter_notes;
CREATE TRIGGER matter_notes_after_insert AFTER INSERT ON public.matter_notes
FOR EACH ROW EXECUTE FUNCTION private.on_matter_note_insert();

-- Timeline: clients see client-visible events; staff see all
DROP POLICY IF EXISTS matter_events_select ON public.matter_events;
CREATE POLICY matter_events_select ON public.matter_events FOR SELECT TO authenticated
  USING ((visible_to_client AND (SELECT private.user_can_access_matter(matter_id)))
      OR (SELECT private.is_matter_lawyer_team(matter_id)) OR (SELECT private.is_admin()));
-- no INSERT/UPDATE/DELETE policy: rows are written by SECURITY DEFINER triggers only

-- ----------------------------------------------------------------------------
-- 5. Documents + storage (Confidential, option B)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_select_by_access ON public.documents;
DROP POLICY IF EXISTS documents_select_by_access ON public.documents;
CREATE POLICY documents_select_by_access ON public.documents FOR SELECT TO authenticated
  USING ((SELECT private.can_access_document(matter_id, access_level)));

-- An admin must not be able to downgrade or delete a Confidential document
CREATE OR REPLACE FUNCTION private.guard_confidential_document() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF OLD.access_level = 'Confidential' AND NOT private.is_matter_lawyer_team(OLD.matter_id) THEN
    RAISE EXCEPTION 'Only the matter''s lawyer team can change or delete a Confidential document';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS documents_guard_confidential ON public.documents;
CREATE TRIGGER documents_guard_confidential BEFORE UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION private.guard_confidential_document();

DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
CREATE POLICY documents_storage_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    EXISTS (SELECT 1 FROM public.documents d
            WHERE d.file_path = storage.objects.name AND private.can_read_document_content(d.id))
    OR owner_id = (SELECT auth.uid())::TEXT
  )
);

-- Break-glass: admin opens a Confidential file with a typed reason
CREATE OR REPLACE FUNCTION public.break_glass_open_document(p_document_id UUID, p_reason TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d RECORD;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF char_length(btrim(COALESCE(p_reason,''))) < 15 THEN
    RAISE EXCEPTION 'Please type a reason of at least 15 characters';
  END IF;
  SELECT doc.id, doc.name, doc.file_path, doc.matter_id, doc.access_level, m.lawyer_id, m.matter_number
    INTO d FROM public.documents doc JOIN public.matters m ON m.id = doc.matter_id WHERE doc.id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.access_level <> 'Confidential' THEN RAISE EXCEPTION 'Not a Confidential document; open it normally'; END IF;

  INSERT INTO public.confidential_access_grants(document_id, admin_id, reason)
  VALUES (p_document_id, auth.uid(), btrim(p_reason));

  PERFORM private.write_audit('CONFIDENTIAL_BREAK_GLASS','Admin opened a Confidential document','document', p_document_id::TEXT,
    jsonb_build_object('reason', btrim(p_reason), 'matter_id', d.matter_id, 'file', d.name));
  INSERT INTO public.matter_events(matter_id,event_type,title,detail,actor_id,visible_to_client)
  VALUES (d.matter_id,'break_glass','Confidential document opened by admin', btrim(p_reason), auth.uid(), FALSE);
  IF d.lawyer_id IS NOT NULL THEN
    PERFORM private.create_notification(d.lawyer_id, 'Confidential document opened by an admin',
      '"' || d.name || '" on ' || d.matter_number || ' was opened. Reason: ' || btrim(p_reason), 'warning', 'documents');
  END IF;
  RETURN d.file_path;
END $$;
REVOKE ALL ON FUNCTION public.break_glass_open_document(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.break_glass_open_document(UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS grants_select ON public.confidential_access_grants;
CREATE POLICY grants_select ON public.confidential_access_grants FOR SELECT TO authenticated
  USING (admin_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND (SELECT private.is_matter_lawyer_team(d.matter_id))));

-- ----------------------------------------------------------------------------
-- 6. Appointments: client requests, lawyer/admin confirms
-- ----------------------------------------------------------------------------
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='appointments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointments', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (client_id, lawyer_id) OR (SELECT private.is_admin()));
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_admin())
  OR (client_id = (SELECT auth.uid()) AND status = 'Pending'
      AND EXISTS (SELECT 1 FROM public.matters m WHERE m.id = appointments.matter_id AND m.client_id = (SELECT auth.uid()) AND m.lawyer_id = appointments.lawyer_id))
  OR (lawyer_id = (SELECT auth.uid())
      AND EXISTS (SELECT 1 FROM public.matters m WHERE m.id = appointments.matter_id AND m.lawyer_id = (SELECT auth.uid()) AND m.client_id = appointments.client_id))
);
DROP POLICY IF EXISTS appointments_update ON public.appointments;
CREATE POLICY appointments_update ON public.appointments FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IN (client_id, lawyer_id) OR (SELECT private.is_admin()))
  WITH CHECK ((SELECT auth.uid()) IN (client_id, lawyer_id) OR (SELECT private.is_admin()));

CREATE OR REPLACE FUNCTION private.guard_appointment_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_admin() THEN RETURN NEW; END IF;
  IF NEW.matter_id IS DISTINCT FROM OLD.matter_id OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id THEN
    RAISE EXCEPTION 'Matter, client and lawyer of an appointment cannot be changed';
  END IF;
  IF auth.uid() = OLD.client_id AND auth.uid() <> OLD.lawyer_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'Cancelled' THEN
      RAISE EXCEPTION 'Clients can only cancel an appointment; the firm confirms it';
    END IF;
    IF NEW.date IS DISTINCT FROM OLD.date OR NEW.time IS DISTINCT FROM OLD.time OR NEW.mode IS DISTINCT FROM OLD.mode THEN
      RAISE EXCEPTION 'To reschedule, cancel and request a new time';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS appointments_guard_update ON public.appointments;
CREATE TRIGGER appointments_guard_update BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.guard_appointment_update();

-- ----------------------------------------------------------------------------
-- 7. Inquiry -> matter (admin only, atomic)
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.matter_number_seq START 1;

CREATE OR REPLACE FUNCTION public.convert_inquiry_to_matter(
  p_inquiry_id UUID, p_lawyer_id UUID, p_title TEXT DEFAULT NULL,
  p_priority public.priority_level DEFAULT 'Medium'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE i public.inquiries; v_client UUID; v_num TEXT; v_id UUID;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO i FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found'; END IF;
  IF i.status = 'Converted' THEN RAISE EXCEPTION 'Inquiry was already converted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_lawyer_id AND role = 'lawyer' AND COALESCE(is_active,TRUE)) THEN
    RAISE EXCEPTION 'Selected user is not an active lawyer';
  END IF;
  v_client := i.client_id;
  IF v_client IS NULL THEN
    SELECT id INTO v_client FROM public.profiles WHERE lower(email) = lower(i.email) AND role = 'client';
  END IF;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'No client account for %. Ask the client to register with this email first.', i.email;
  END IF;
  LOOP
    v_num := 'WLF-' || to_char(NOW(),'YYYY') || '-' || lpad(nextval('public.matter_number_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.matters WHERE matter_number = v_num);
  END LOOP;
  INSERT INTO public.matters(matter_number, client_id, lawyer_id, practice_area, status, priority, title, description)
  VALUES (v_num, v_client, p_lawyer_id, i.practice_area, 'Under Review', p_priority,
          COALESCE(NULLIF(btrim(p_title),''), i.subject), i.message)
  RETURNING id INTO v_id;
  UPDATE public.inquiries SET status = 'Converted', client_id = v_client, assigned_to = p_lawyer_id WHERE id = p_inquiry_id;
  PERFORM private.write_audit('INQUIRY_CONVERTED','Inquiry converted to matter ' || v_num,'inquiry', p_inquiry_id::TEXT,
    jsonb_build_object('matter_id', v_id, 'lawyer_id', p_lawyer_id));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.convert_inquiry_to_matter(UUID,UUID,TEXT,public.priority_level) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_inquiry_to_matter(UUID,UUID,TEXT,public.priority_level) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Lawyer directory: real data, safe for the public site
-- ----------------------------------------------------------------------------
-- Root cause of "0 lawyers": visitors cannot read `profiles` (RLS) and the code
-- filtered on a column that did not exist on some databases, so the page fell
-- back to mock lawyers that had no practice areas. This view exposes ONLY
-- public-safe columns (work email as shown on the site; no phone, address or
-- birthday).
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

ALTER TABLE public.practice_areas ADD COLUMN IF NOT EXISTS lawyer_ids TEXT[] NOT NULL DEFAULT '{}';

-- Seed the firm's lawyers (idempotent). Directory accounts are created without a
-- usable password; use "Forgot password" or the admin-create-user function to let
-- a lawyer sign in. Education/experience are left blank on purpose: enter the
-- verified details from the Profile screen rather than guessing them here.
DO $seed$
DECLARE r RECORD; v_uid UUID;
BEGIN
  FOR r IN SELECT * FROM (VALUES
  ('l1', 'atty.boyet@westwoodlaw.ph', 'Ernesto', 'Boyet', '', 'Tabao', 'Managing Partner', '/lawyers/atty-tabao-primary.png', 'Labor, industrial relations, corporate, and business law practitioner.', 1),
  ('l2', 'mc.santos@westwoodlaw.ph', 'Maria Cristina', '', 'L.', 'Santos', 'Senior Associate', 'https://images.unsplash.com/photo-1662104935883-e9dd0619eaba?w=400&h=500&fit=crop&auto=format', 'Civil and administrative matters practitioner with litigation experience.', 2),
  ('l3', 'bj.reyes@westwoodlaw.ph', 'Benjamin Jose', '', 'T.', 'Reyes', 'Associate', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=500&fit=crop&auto=format', 'Corporate and commercial law practitioner focused on business matters.', 3),
  ('l4', 'l.delacruz@westwoodlaw.ph', 'Lorraine', '', 'A.', 'Dela Cruz', 'Associate', 'https://images.unsplash.com/photo-1614786269829-d24616faf56d?w=400&h=500&fit=crop&auto=format', 'Immigration practitioner handling visas and residency documentation.', 4),
  ('l5', 'cg.torres@westwoodlaw.ph', 'Carlos Gabriel', '', 'M.', 'Torres', 'Associate', 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=400&h=500&fit=crop&auto=format', 'Taxation and banking law practitioner advising businesses and families.', 5),
  ('l6', 'si.mendoza@westwoodlaw.ph', 'Sofia Isabelle', '', 'B.', 'Mendoza', 'Associate', 'https://images.unsplash.com/photo-1662104935762-707db0439ecd?w=400&h=500&fit=crop&auto=format', 'Family law practitioner focused on sensitive annulment matters.', 6),
  ('l7', 'ma.villanueva@westwoodlaw.ph', 'Marco Antonio', '', 'R.', 'Villanueva', 'Associate', 'https://images.unsplash.com/photo-1613496701765-97267d26e3df?w=400&h=500&fit=crop&auto=format', 'Energy, mining, cooperatives, and regulatory compliance practitioner.', 7)
  ) AS t(lid, email, first_name, nickname, middle_name, last_name, position, img, bio, ord)
  LOOP
    -- Find the account by email on BOTH sides. Matching profiles alone is not
    -- enough: an auth user can exist with no profile row (it was created before
    -- on_auth_user_created existed, or by a project whose base schema never had
    -- it). The seed would then try to insert that email again and die on
    -- auth.users' users_email_partial_key — which is exactly what happened on
    -- the live project.
    SELECT id INTO v_uid FROM public.profiles WHERE lower(email) = lower(r.email);
    IF v_uid IS NULL THEN
      SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(r.email);
    END IF;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', r.email,
              extensions.crypt(gen_random_uuid()::TEXT, extensions.gen_salt('bf')), NOW(),
              '{"provider":"email","providers":["email"]}'::JSONB,
              jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name), NOW(), NOW(), '', '', '', '');
    END IF;

    -- Guarantee the profile row before the UPDATE below: an UPDATE against a
    -- missing row matches nothing, exits 0, and leaves the lawyer invisible in
    -- the directory while the migration reports success.
    INSERT INTO public.profiles (id, email, full_name, first_name, middle_name, last_name, role)
    VALUES (v_uid, r.email, btrim(concat_ws(' ', r.first_name, r.last_name)),
            r.first_name, NULLIF(r.middle_name,''), r.last_name, 'lawyer'::public.user_role)
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles SET
      role = 'lawyer', honorific = 'Atty.', first_name = r.first_name, nickname = NULLIF(r.nickname,''),
      middle_name = NULLIF(r.middle_name,''), last_name = r.last_name, position = r.position,
      bio = r.bio, profile_image = r.img, display_order = r.ord, is_active = TRUE,
      city = COALESCE(city, 'San Juan City'),
      bar_admissions = CASE WHEN bar_admissions IS NULL OR bar_admissions = '[]'::JSONB
                            THEN '["Philippine Bar"]'::JSONB ELSE bar_admissions END
    WHERE id = v_uid;
    -- keep the practice-area link keyed by the old seed ids l1..l7
    INSERT INTO public.profile_practice_areas(profile_id, practice_area_id)
    SELECT v_uid, pa.id FROM public.practice_areas pa WHERE r.lid = ANY(pa.lawyer_ids)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $seed$;

-- ----------------------------------------------------------------------------
-- 8b. Link seeded articles to their author's lawyer profile
-- ----------------------------------------------------------------------------
-- The content seed stores each byline as free text (articles.author_name). Now
-- that the lawyer profiles exist we can resolve the real author, so the article
-- pages show the linked lawyer instead of falling back to the firm name.
UPDATE public.articles a SET author_id = p.id
FROM public.profiles p
WHERE a.author_id IS NULL
  AND p.role = 'lawyer'
  AND a.author_name IS NOT NULL
  AND p.full_name = a.author_name;

-- ----------------------------------------------------------------------------
-- 9. Housekeeping notes (nothing destructive runs here)
-- ----------------------------------------------------------------------------
-- Guarded: 20261002 renames this table to lawyers_legacy, so on a re-run it is
-- no longer there.
DO $$
BEGIN
  IF to_regclass('public.lawyers') IS NOT NULL THEN
    COMMENT ON TABLE public.lawyers IS 'DEPRECATED: unused by the app. Lawyer data lives on profiles. See supabase/DATABASE_REVIEW.md';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 10. No double-booking of a lawyer's time slot
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_lawyer_slot
    ON public.appointments (lawyer_id, date, time) WHERE status IN ('Pending', 'Confirmed');
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Existing appointments already overlap; resolve them, then re-run this statement to enforce the rule.';
END $$;
