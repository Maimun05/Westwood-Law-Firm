-- ============================================================================
-- 20261017  Notify admins when a registered client files an inquiry
-- ============================================================================
-- A signed-in client's inquiry is deliberately NOT emailed to the firm: the
-- notify-inquiry edge function only claims rows with client_id IS NULL, so a
-- registered client's inquiry landed silently in Client Intake and nobody was
-- told. This adds a bell notification for every active admin, the same way a
-- new document, matter update or appointment already notifies people.
--
-- Scope: registered clients only (client_id IS NOT NULL). A signed-out
-- visitor's inquiry is emailed to the firm by notify-inquiry and is not in
-- Client Intake, so it is left alone here — one channel per audience.
--
-- Safe to re-run.
-- ============================================================================

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
  -- Registered clients only. A signed-out visitor's inquiry (client_id IS NULL)
  -- reaches the firm by email (notify-inquiry) and never enters Client Intake.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_who := COALESCE(NULLIF(btrim(NEW.name), ''), 'A client');
  v_subject := NULLIF(btrim(NEW.subject), '');

  -- Every active admin. create_notification() skips the actor, so an admin who
  -- files their own inquiry is not notified about it.
  FOR v_admin IN
    SELECT p.id
    FROM public.profiles AS p
    WHERE p.role = 'admin'::public.user_role
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

-- Only the trigger may call it (create_notification is likewise private).
REVOKE ALL ON FUNCTION private.notify_admins_new_inquiry() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiries_notify_admins ON public.inquiries;
CREATE TRIGGER inquiries_notify_admins
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.notify_admins_new_inquiry();


-- ----------------------------------------------------------------------------
-- Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('private.notify_admins_new_inquiry()') IS NULL THEN
    RAISE WARNING 'notify_admins_new_inquiry() was NOT created — admins will not be told about client inquiries';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inquiries_notify_admins') THEN
    RAISE WARNING 'inquiries_notify_admins trigger is missing — the function will never run';
  ELSE
    RAISE NOTICE 'admins are notified when a registered client files an inquiry';
  END IF;
END $$;
