-- ============================================================================
-- Documents upload/download + Notifications
-- ============================================================================
-- Why this migration exists
--   * The live policy set for documents / storage.objects / notifications is
--     ambiguous: several ad-hoc SQL files define the same policies under
--     different names, and permissive policies are OR'd together. So this
--     migration DROPS every existing policy on those tables (by looking them up
--     in pg_policies) and recreates one clean, known set.
--   * 20260918 replaced the access-level-aware documents SELECT policy with one
--     that ignored access_level, letting a client read metadata of
--     "Lawyer Only" / "Confidential" documents. Restored here.
--   * 20260917 attached public.update_updated_at() to notifications, but that
--     table has no updated_at column, so every UPDATE (mark as read) errors.
--     Trigger removed here.
--   * Notifications could only be inserted for yourself, so a lawyer could never
--     notify a client. Notifications are now created by SECURITY DEFINER
--     triggers on documents / matters / appointments (cannot be forged from the
--     browser).
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Wipe existing policies on the tables we own here
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, schemaname, tablename
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('documents', 'notifications'))
       OR (schemaname = 'storage' AND tablename = 'objects'
           AND policyname LIKE 'documents\_storage\_%' ESCAPE '\')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Helpers (SECURITY DEFINER so they are not blocked by matters/profiles RLS)
-- ----------------------------------------------------------------------------

-- Is the current user the client, the assigned lawyer, or an admin of this matter?
CREATE OR REPLACE FUNCTION private.user_can_access_matter(p_matter_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matters AS m
    WHERE m.id = p_matter_id
      AND (
        m.client_id = (SELECT auth.uid())
        OR m.lawyer_id = (SELECT auth.uid())
        OR (SELECT private.is_admin())
      )
  );
$$;

-- Same check, but for a storage object name like '<matter_uuid>/<file>'.
-- Returns FALSE (instead of raising) when the first path segment is not a UUID.
CREATE OR REPLACE FUNCTION private.user_can_access_matter_path(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_first TEXT := split_part(p_name, '/', 1);
BEGIN
  IF v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  RETURN private.user_can_access_matter(v_first::UUID);
END;
$$;

-- Which access levels may this user assign when uploading to this matter?
--   client : only 'Client & Assigned Lawyer'  (never Public: Public = every
--            logged-in user, across all matters)
--   lawyer : 'Client & Assigned Lawyer', 'Staff Shared', 'Lawyer Only'
--   admin  : anything
CREATE OR REPLACE FUNCTION private.can_upload_document(
  p_matter_id UUID,
  p_access_level public.access_level
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF NOT private.user_can_access_matter(p_matter_id) THEN
    RETURN FALSE;
  END IF;

  v_role := private.get_user_role();

  RETURN CASE v_role
    WHEN 'admin'::public.user_role THEN TRUE
    WHEN 'lawyer'::public.user_role THEN p_access_level IN (
      'Client & Assigned Lawyer'::public.access_level,
      'Staff Shared'::public.access_level,
      'Lawyer Only'::public.access_level
    )
    WHEN 'client'::public.user_role THEN
      p_access_level = 'Client & Assigned Lawyer'::public.access_level
    ELSE FALSE
  END;
END;
$$;

-- Access-level rules (unchanged from schema-production.sql; re-declared here so
-- this migration does not depend on which base schema file was run).
CREATE OR REPLACE FUNCTION private.can_access_document(
  p_matter_id UUID,
  p_access_level public.access_level
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_role public.user_role;
  v_client_id UUID;
  v_lawyer_id UUID;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles AS p WHERE p.id = v_user_id;

  SELECT m.client_id, m.lawyer_id INTO v_client_id, v_lawyer_id
  FROM public.matters AS m WHERE m.id = p_matter_id;

  RETURN CASE p_access_level
    WHEN 'Public'::public.access_level THEN TRUE
    WHEN 'Staff Shared'::public.access_level THEN v_role IN ('lawyer'::public.user_role, 'admin'::public.user_role)
    WHEN 'Client & Assigned Lawyer'::public.access_level THEN
      v_user_id IN (v_client_id, v_lawyer_id) OR v_role = 'admin'::public.user_role
    WHEN 'Lawyer Only'::public.access_level THEN
      v_user_id = v_lawyer_id OR v_role = 'admin'::public.user_role
    WHEN 'Confidential'::public.access_level THEN v_role = 'admin'::public.user_role
    ELSE FALSE
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_document(UUID, public.access_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_document(UUID, public.access_level) TO authenticated;

REVOKE ALL ON FUNCTION private.user_can_access_matter(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.user_can_access_matter_path(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_upload_document(UUID, public.access_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_access_matter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_can_access_matter_path(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_upload_document(UUID, public.access_level) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. documents table policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Read: driven by can_access_document (defined in schema-production.sql),
-- the same function the storage policy uses, so metadata and file agree.
CREATE POLICY documents_select_by_access
ON public.documents FOR SELECT TO authenticated
USING ((SELECT private.can_access_document(matter_id, access_level)));

CREATE POLICY documents_insert_allowed
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = (SELECT auth.uid())
  AND (SELECT private.can_upload_document(matter_id, access_level))
);

-- Uploader may edit their own row but not move it to another matter or
-- escalate the access level beyond what their role may set.
CREATE POLICY documents_update_own
ON public.documents FOR UPDATE TO authenticated
USING (uploaded_by = (SELECT auth.uid()))
WITH CHECK (
  uploaded_by = (SELECT auth.uid())
  AND (SELECT private.can_upload_document(matter_id, access_level))
);

CREATE POLICY documents_update_admin
ON public.documents FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY documents_delete_own_or_admin
ON public.documents FOR DELETE TO authenticated
USING (uploaded_by = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- ----------------------------------------------------------------------------
-- 4. Storage bucket + policies
-- ----------------------------------------------------------------------------
-- Private bucket, 20 MB per file, common office/PDF/image types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 'documents', FALSE, 20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Upload: path must start with a matter id the user belongs to. The client
-- uploads the file first and inserts the documents row second.
CREATE POLICY documents_storage_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (SELECT private.user_can_access_matter_path(name))
);

-- Download: the object must have a documents row the user is allowed to read.
CREATE POLICY documents_storage_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    EXISTS (
      SELECT 1
      FROM public.documents AS d
      WHERE d.file_path = storage.objects.name
        AND private.can_access_document(d.matter_id, d.access_level)
    )
    -- The uploader must be able to see their own object between the storage
    -- upload and the documents insert (needed for upsert/rollback cleanup).
    OR (owner_id = (SELECT auth.uid())::TEXT)
  )
);

-- Delete: uploader or admin. The client deletes the object BEFORE the row.
CREATE POLICY documents_storage_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    owner_id = (SELECT auth.uid())::TEXT
    OR (SELECT private.is_admin())
  )
);

-- ----------------------------------------------------------------------------
-- 5. notifications table
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Broken trigger: notifications has no updated_at column.
DROP TRIGGER IF EXISTS notifications_updated_at ON public.notifications;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id) WHERE read = FALSE;

-- Users read / update / delete only their own. There is deliberately NO insert
-- policy: rows are created by the SECURITY DEFINER triggers below.
CREATE POLICY notifications_select_own
ON public.notifications FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_update_own
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_delete_own
ON public.notifications FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Only the read state may be changed by the browser, not the content.
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read, read_at) ON public.notifications TO authenticated;

-- Keep read_at consistent with read.
CREATE OR REPLACE FUNCTION private.notifications_set_read_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.read AND NOT OLD.read THEN
    NEW.read_at := COALESCE(NEW.read_at, NOW());
  ELSIF NOT NEW.read THEN
    NEW.read_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_set_read_at ON public.notifications;
CREATE TRIGGER notifications_set_read_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.notifications_set_read_at();

-- Realtime: lets the portal bell update instantly. RLS still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Notification creation helper + triggers
-- ----------------------------------------------------------------------------
-- Not granted to any client role; only the triggers below call it.
CREATE OR REPLACE FUNCTION private.create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_link TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Never notify the person who performed the action, or a null recipient.
  IF p_user_id IS NULL OR p_user_id IS NOT DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (p_user_id, p_title, p_message, p_type, p_link);
END;
$$;

REVOKE ALL ON FUNCTION private.create_notification(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- ---- documents: tell the people who are allowed to see the new file --------
CREATE OR REPLACE FUNCTION private.notify_document_uploaded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client UUID;
  v_lawyer UUID;
  v_number TEXT;
BEGIN
  SELECT m.client_id, m.lawyer_id, m.matter_number
  INTO v_client, v_lawyer, v_number
  FROM public.matters AS m
  WHERE m.id = NEW.matter_id;

  -- Recipients depend on who is allowed to open the document. 'Lawyer Only',
  -- 'Staff Shared' and 'Confidential' names are never sent to the client.
  IF NEW.access_level IN ('Client & Assigned Lawyer', 'Public') THEN
    PERFORM private.create_notification(
      v_client, 'New document on matter ' || v_number,
      'A document "' || NEW.name || '" was added to your matter.',
      'info', 'documents');
    PERFORM private.create_notification(
      v_lawyer, 'New document on matter ' || v_number,
      'A document "' || NEW.name || '" was added to matter ' || v_number || '.',
      'info', 'documents');
  ELSIF NEW.access_level IN ('Lawyer Only', 'Staff Shared') THEN
    PERFORM private.create_notification(
      v_lawyer, 'New document on matter ' || v_number,
      'A document "' || NEW.name || '" was added to matter ' || v_number || '.',
      'info', 'documents');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_notify_uploaded ON public.documents;
CREATE TRIGGER documents_notify_uploaded
AFTER INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION private.notify_document_uploaded();

-- ---- matters: status change + lawyer assignment ----------------------------
CREATE OR REPLACE FUNCTION private.notify_matter_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM private.create_notification(
      NEW.client_id,
      'Matter ' || NEW.matter_number || ' is now ' || NEW.status::TEXT,
      'The status of your matter "' || NEW.title || '" was updated to ' || NEW.status::TEXT || '.',
      CASE WHEN NEW.status IN ('Active', 'Accepted', 'Resolved') THEN 'success' ELSE 'info' END,
      'matters');
  END IF;

  IF NEW.lawyer_id IS DISTINCT FROM OLD.lawyer_id AND NEW.lawyer_id IS NOT NULL THEN
    PERFORM private.create_notification(
      NEW.lawyer_id,
      'You were assigned matter ' || NEW.matter_number,
      'You are now the assigned lawyer for "' || NEW.title || '".',
      'info', 'matters');
    PERFORM private.create_notification(
      NEW.client_id,
      'A lawyer was assigned to matter ' || NEW.matter_number,
      'Your matter "' || NEW.title || '" now has an assigned lawyer.',
      'success', 'matters');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matters_notify_changed ON public.matters;
CREATE TRIGGER matters_notify_changed
AFTER UPDATE OF status, lawyer_id ON public.matters
FOR EACH ROW EXECUTE FUNCTION private.notify_matter_changed();

-- ---- appointments: new + status change -------------------------------------
CREATE OR REPLACE FUNCTION private.notify_appointment_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title TEXT;
  v_msg TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_title := 'New appointment scheduled';
    v_msg := NEW.appointment_type || ' on ' || NEW.date::TEXT || ' at ' || NEW.time || ' (' || NEW.mode::TEXT || ').';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_title := 'Appointment ' || lower(NEW.status::TEXT);
    v_msg := NEW.appointment_type || ' on ' || NEW.date::TEXT || ' at ' || NEW.time || ' is now ' || NEW.status::TEXT || '.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.create_notification(NEW.client_id, v_title, v_msg,
    CASE WHEN NEW.status = 'Cancelled' THEN 'warning' ELSE 'info' END, 'appointments');
  PERFORM private.create_notification(NEW.lawyer_id, v_title, v_msg,
    CASE WHEN NEW.status = 'Cancelled' THEN 'warning' ELSE 'info' END, 'appointments');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_notify_changed ON public.appointments;
CREATE TRIGGER appointments_notify_changed
AFTER INSERT OR UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.notify_appointment_changed();

-- ----------------------------------------------------------------------------
-- 7. Let lawyers/admins change a matter's status and assignment
-- ----------------------------------------------------------------------------
-- The portal's status dropdown never saved anywhere, so matter notifications
-- could never fire. Additive policies; existing matter policies are untouched.
DROP POLICY IF EXISTS matters_update_lawyer_status ON public.matters;
CREATE POLICY matters_update_lawyer_status
ON public.matters FOR UPDATE TO authenticated
USING (lawyer_id = (SELECT auth.uid()))
WITH CHECK (lawyer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS matters_update_admin ON public.matters;
CREATE POLICY matters_update_admin
ON public.matters FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));
