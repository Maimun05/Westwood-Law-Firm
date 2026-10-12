-- ============================================================================
-- 20261018  Realtime inquiries, inquiry conversations, and consultation
--           scheduling
-- ============================================================================
-- One migration for the three features that share the same plumbing:
--
--   * Inquiries gain a structured `requested_lawyer_id` (the form used to fold
--     the lawyer's name into the message text) and a real assignment path. The
--     old `inquiries_select_staff` policy let every lawyer read every inquiry
--     in the firm; lawyers now see only inquiries assigned to them, admins
--     keep the full view, and a guard trigger stops a lawyer from editing
--     anything but the status of their own assigned inquiry.
--   * `public.inquiry_messages` is the per-inquiry conversation between the
--     client and the assigned lawyer. Bodies are encrypted at rest with the
--     same Tier-B design as matter messages (20261015): a Vault key, a
--     transparent BEFORE trigger, and a SECURITY INVOKER read view. Read
--     receipts are stamped through a guarded RPC; messages are immutable.
--   * `appointments` gains matter-less consultation requests (`matter_id`
--     becomes nullable, `inquiry_id` links the request to the inquiry the
--     client filed), a booking guard that validates date/time on the backend,
--     and a `rescheduled_at` stamp. The existing partial unique index
--     (lawyer_id, date, time) WHERE status IN ('Pending','Confirmed') remains
--     the database-level double-booking constraint.
--
-- Realtime: inquiries, inquiry_messages, appointments and matter_notes join
-- the supabase_realtime publication. Supabase Realtime applies each table's
-- SELECT policies to postgres_changes, so a subscriber only ever receives rows
-- their RLS already allows — no public channels, no broadcast.
--
-- Safe to re-run: every object is guarded, CREATE OR REPLACE, or DROP+CREATE.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Helper: is this profile an active lawyer? (RLS-safe)
-- ----------------------------------------------------------------------------
-- Policies and the public RPC run as the caller, and a client cannot read
-- other people's profiles, so an inline EXISTS against profiles would silently
-- return false. The check lives in a SECURITY DEFINER helper, like
-- private.is_admin() and friends.
CREATE OR REPLACE FUNCTION private.is_active_lawyer(p_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_id
      AND p.role = 'lawyer'::public.user_role
      AND COALESCE(p.is_active, TRUE)
      AND p.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_lawyer(UUID) FROM PUBLIC;

-- Policies evaluate their predicates as the caller, so resolving this call
-- needs EXECUTE for authenticated — the same explicit grant private.is_admin()
-- and friends carry (20261003). Without it the appointments_insert policy below
-- fails with "permission denied for function" instead of a policy decision.
GRANT EXECUTE ON FUNCTION private.is_active_lawyer(UUID) TO authenticated;


-- ----------------------------------------------------------------------------
-- 1. Inquiries: a structured requested lawyer, and assignment-scoped access
-- ----------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS requested_lawyer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_requested_lawyer
  ON public.inquiries (requested_lawyer_id);

-- SELECT: three rules, kept as three policies so each one states its audience.
--   * own     — the client who filed it (client_id, or the email they filed
--               with, which is what schema-production always had).
--   * admin   — the front desk sees everything.
--   * lawyer  — ONLY inquiries assigned to them. This replaces the old
--               is_lawyer_or_admin() staff policy.
DROP POLICY IF EXISTS inquiries_select_own ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_staff ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_policy ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_admin ON public.inquiries;
DROP POLICY IF EXISTS inquiries_select_assigned_lawyer ON public.inquiries;

CREATE POLICY inquiries_select_own ON public.inquiries
FOR SELECT TO authenticated
USING (
  client_id = (SELECT auth.uid())
  OR lower(email) = lower((SELECT p.email FROM public.profiles AS p WHERE p.id = (SELECT auth.uid())))
);

CREATE POLICY inquiries_select_admin ON public.inquiries
FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

CREATE POLICY inquiries_select_assigned_lawyer ON public.inquiries
FOR SELECT TO authenticated
USING (
  assigned_to = (SELECT auth.uid())
  AND (SELECT private.get_user_role()) = 'lawyer'::public.user_role
);

-- UPDATE: admins edit anything; the assigned lawyer may only advance the
-- status, and the guard trigger below enforces exactly that.
DROP POLICY IF EXISTS inquiries_update_admin ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_policy ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_authenticated ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_staff ON public.inquiries;
DROP POLICY IF EXISTS inquiries_update_assigned_lawyer ON public.inquiries;

CREATE POLICY inquiries_update_admin ON public.inquiries
FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()))
WITH CHECK ((SELECT private.is_admin()));

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

-- The real gate for a lawyer's update: status only, and only the statuses a
-- lawyer owns. RLS decides which ROWS a lawyer may touch; this decides which
-- COLUMNS and which values.
CREATE OR REPLACE FUNCTION private.guard_inquiry_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the assigned lawyer can update an inquiry'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.inquiry_number  IS DISTINCT FROM OLD.inquiry_number
     OR NEW.name          IS DISTINCT FROM OLD.name
     OR NEW.email         IS DISTINCT FROM OLD.email
     OR NEW.phone         IS DISTINCT FROM OLD.phone
     OR NEW.practice_area IS DISTINCT FROM OLD.practice_area
     OR NEW.preferred_lawyer IS DISTINCT FROM OLD.preferred_lawyer
     OR NEW.subject       IS DISTINCT FROM OLD.subject
     OR NEW.message       IS DISTINCT FROM OLD.message
     OR NEW.client_id     IS DISTINCT FROM OLD.client_id
     OR NEW.assigned_to   IS DISTINCT FROM OLD.assigned_to
     OR NEW.requested_lawyer_id IS DISTINCT FROM OLD.requested_lawyer_id
     OR NEW.seminar_id    IS DISTINCT FROM OLD.seminar_id
     OR NEW.firm_notified_at IS DISTINCT FROM OLD.firm_notified_at
     OR NEW.preferred_contact_method IS DISTINCT FROM OLD.preferred_contact_method THEN
    RAISE EXCEPTION 'An inquiry''s details cannot be edited here — only its status'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status NOT IN ('Under Review'::public.inquiry_status,
                        'Contacted'::public.inquiry_status,
                        'Closed'::public.inquiry_status) THEN
    RAISE EXCEPTION 'That inquiry status is reserved for the front desk'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.guard_inquiry_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiries_guard_update ON public.inquiries;
CREATE TRIGGER inquiries_guard_update
BEFORE UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.guard_inquiry_update();


-- ----------------------------------------------------------------------------
-- 2. submit_inquiry gains p_lawyer_id
-- ----------------------------------------------------------------------------
-- The client's chosen lawyer becomes a real profile id, validated here (the
-- browser is not trusted to name a lawyer), stored on `requested_lawyer_id`,
-- and — for registered clients only — assigned straight away so the lawyer's
-- portal and bell light up without the front desk relaying anything. Signed
-- out visitors cannot attach a lawyer: their inquiry stays an anonymous lead
-- that reaches the firm by email (notify-inquiry), exactly as before.
DROP FUNCTION IF EXISTS public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_inquiry(
  p_name          TEXT DEFAULT NULL,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_practice_area TEXT DEFAULT NULL,
  p_method        TEXT DEFAULT NULL,
  p_message       TEXT DEFAULT NULL,
  p_subject       TEXT DEFAULT NULL,
  p_seminar_id    TEXT DEFAULT NULL,
  p_lawyer_id     UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_number   TEXT;
  v_uid      UUID := (SELECT auth.uid());
  v_seminar  TEXT := NULLIF(btrim(COALESCE(p_seminar_id, '')), '');
  v_lawyer   UUID := NULL;
BEGIN
  -- Validated here rather than only in the browser: this function is reachable
  -- by anyone, so it cannot assume the form ran. ERRCODE 22023 is what makes
  -- PostgREST return 400 with this message instead of a generic failure.
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Please enter your name' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_email, '')) = ''
     OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_message, '')) = '' THEN
    RAISE EXCEPTION 'Please tell us how we can help' USING ERRCODE = '22023';
  END IF;
  IF v_seminar IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.seminar_events s WHERE s.id = v_seminar) THEN
    RAISE EXCEPTION 'That seminar is no longer listed — please refresh the page and try again'
      USING ERRCODE = '22023';
  END IF;

  -- The requested lawyer must be a real, active lawyer profile.
  IF p_lawyer_id IS NOT NULL THEN
    IF private.is_active_lawyer(p_lawyer_id) THEN
      v_lawyer := p_lawyer_id;
    ELSE
      RAISE EXCEPTION 'That lawyer is not available — please refresh the page and try again'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.inquiries (
    name, email, phone, practice_area, preferred_contact_method,
    message, subject, status, client_id, seminar_id,
    requested_lawyer_id, assigned_to
  ) VALUES (
    btrim(p_name),
    btrim(p_email),
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    COALESCE(btrim(COALESCE(p_practice_area, '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(p_method, '')), ''), 'Email'),
    p_message,
    COALESCE(NULLIF(btrim(COALESCE(p_subject, '')), ''), 'General inquiry'),
    'New',
    -- The visitor cannot choose who this is filed under; it is themselves, or
    -- nobody when they are signed out. Same rule as inquiries_insert_policy.
    -- (client_id only — inquiries has no user_id column on live.)
    v_uid,
    v_seminar,
    v_lawyer,
    -- Auto-assignment is for registered clients only: a signed-out visitor's
    -- inquiry is an anonymous lead that the firm reviews first.
    CASE WHEN v_uid IS NOT NULL THEN v_lawyer ELSE NULL END
  )
  RETURNING inquiry_number INTO v_number;

  RETURN v_number;
END $$;

REVOKE ALL ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Notifications for inquiry assignment and status
-- ----------------------------------------------------------------------------
-- The bell already covers documents, matters, appointments and new client
-- inquiries. These two add the lawyer-facing assignment ping and the
-- client-facing status ping.
CREATE OR REPLACE FUNCTION private.notify_inquiry_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NULL OR NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  -- create_notification() skips the actor, so an admin assigning an inquiry to
  -- themselves is not notified about it.
  PERFORM private.create_notification(
    NEW.assigned_to,
    'New inquiry assigned to you',
    NEW.inquiry_number || COALESCE(' — ' || NULLIF(btrim(NEW.subject), ''), ''),
    'info',
    'inquiries'
  );

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.notify_inquiry_assigned() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiries_notify_assigned ON public.inquiries;
CREATE TRIGGER inquiries_notify_assigned
AFTER INSERT OR UPDATE OF assigned_to ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.notify_inquiry_assigned();

CREATE OR REPLACE FUNCTION private.notify_inquiry_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM private.create_notification(
    NEW.client_id,
    'Your inquiry is now ' || NEW.status::TEXT,
    NEW.inquiry_number || COALESCE(' — ' || NULLIF(btrim(NEW.subject), ''), '')
      || ' is now ' || NEW.status::TEXT || '.',
    CASE WHEN NEW.status = 'Closed' THEN 'success' ELSE 'info' END,
    'inquiries'
  );

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.notify_inquiry_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiries_notify_status ON public.inquiries;
CREATE TRIGGER inquiries_notify_status
AFTER UPDATE OF status ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION private.notify_inquiry_status();


-- ----------------------------------------------------------------------------
-- 4. inquiry_messages — the client <-> assigned-lawyer conversation
-- ----------------------------------------------------------------------------
-- Same Tier-B shape as 20261015: the browser writes plain text, the trigger
-- encrypts, reads go through a SECURITY INVOKER view. A separate Vault key so
-- the two message families can be rotated independently.
DO $$
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION
      'Supabase Vault is not enabled on this project. Enable the vault extension (Dashboard -> Database -> Extensions) and re-run this file.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'inquiry_messages_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'inquiry_messages_key',
      'Tier-B symmetric key for public.inquiry_messages.body');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.inquiry_message_key() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'inquiry_messages_key';
$$;

REVOKE ALL ON FUNCTION private.inquiry_message_key() FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.decrypt_inquiry_message(p_body TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
           WHEN p_body IS NULL THEN NULL
           ELSE extensions.pgp_sym_decrypt(decode(p_body, 'base64'), private.inquiry_message_key())
         END;
$$;

REVOKE ALL ON FUNCTION private.decrypt_inquiry_message(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.decrypt_inquiry_message(TEXT) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id     UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  author_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  body           TEXT NOT NULL,
  body_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  -- Stamped by public.mark_inquiry_messages_read() when the other party opens
  -- the conversation; NULL means "not seen yet".
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inquiry_messages_body_ciphertext_check CHECK (char_length(body) BETWEEN 1 AND 20000)
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry
  ON public.inquiry_messages (inquiry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_author
  ON public.inquiry_messages (author_id);

CREATE OR REPLACE FUNCTION private.encrypt_inquiry_message() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(btrim(NEW.body)) NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION 'A message must be between 1 and 5000 characters'
        USING ERRCODE = '22023';
    END IF;
    NEW.body := encode(extensions.pgp_sym_encrypt(NEW.body, private.inquiry_message_key()), 'base64');
    NEW.body_encrypted := TRUE;
  END IF;
  -- Messages are immutable: there is no UPDATE branch on purpose.

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.encrypt_inquiry_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiry_messages_encrypt ON public.inquiry_messages;
CREATE TRIGGER inquiry_messages_encrypt
BEFORE INSERT ON public.inquiry_messages
FOR EACH ROW EXECUTE FUNCTION private.encrypt_inquiry_message();

-- Who may see / join a conversation. SECURITY DEFINER so the inquiries lookup
-- is not itself filtered by the caller's RLS (the helper IS the check).
CREATE OR REPLACE FUNCTION private.user_is_inquiry_participant(p_inquiry_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE i.id = p_inquiry_id
      AND (i.client_id = (SELECT auth.uid()) OR i.assigned_to = (SELECT auth.uid()))
  );
$$;

REVOKE ALL ON FUNCTION private.user_is_inquiry_participant(UUID) FROM PUBLIC;
-- Same rule as is_active_lawyer above: the inquiry_messages policies call this
-- as the caller, so authenticated needs the explicit grant.
GRANT EXECUTE ON FUNCTION private.user_is_inquiry_participant(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.user_can_access_inquiry(p_inquiry_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.user_is_inquiry_participant(p_inquiry_id) OR private.is_admin();
$$;

REVOKE ALL ON FUNCTION private.user_can_access_inquiry(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_can_access_inquiry(UUID) TO authenticated;

ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: the two participants, plus admins for oversight (they already see
-- every inquiry in Client Intake). No UPDATE/DELETE policies: messages are
-- immutable, and read receipts go through the guarded RPC below.
DROP POLICY IF EXISTS inquiry_messages_select ON public.inquiry_messages;
CREATE POLICY inquiry_messages_select ON public.inquiry_messages
FOR SELECT TO authenticated
USING (private.user_can_access_inquiry(inquiry_id));

DROP POLICY IF EXISTS inquiry_messages_insert ON public.inquiry_messages;
CREATE POLICY inquiry_messages_insert ON public.inquiry_messages
FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND private.user_is_inquiry_participant(inquiry_id)
);

-- Explicit grants, not project defaults: only authenticated may touch it, and
-- only read + append.
REVOKE ALL ON public.inquiry_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.inquiry_messages TO authenticated;
GRANT SELECT ON public.inquiry_messages TO service_role;

-- Read path: decrypting SECURITY INVOKER view (see 20261015 for the rationale;
-- security_invoker is mandatory or the view bypasses RLS).
CREATE OR REPLACE VIEW public.inquiry_messages_thread
WITH (security_invoker = TRUE) AS
SELECT
  id, inquiry_id, author_id, read_at, created_at, updated_at,
  CASE WHEN body_encrypted THEN private.decrypt_inquiry_message(body) ELSE body END AS body
FROM public.inquiry_messages;

ALTER VIEW public.inquiry_messages_thread SET (security_invoker = TRUE);

REVOKE ALL ON public.inquiry_messages_thread FROM PUBLIC, anon;
GRANT SELECT ON public.inquiry_messages_thread TO authenticated, service_role;

-- Read receipts. Only a participant may stamp them, only for messages they did
-- not write, and only once (read_at IS NULL).
CREATE OR REPLACE FUNCTION public.mark_inquiry_messages_read(p_inquiry_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid   UUID := (SELECT auth.uid());
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to read this conversation' USING ERRCODE = '42501';
  END IF;
  IF NOT private.user_is_inquiry_participant(p_inquiry_id) THEN
    RAISE EXCEPTION 'Not your conversation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inquiry_messages
     SET read_at = NOW()
   WHERE inquiry_id = p_inquiry_id
     AND read_at IS NULL
     AND author_id <> v_uid;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.mark_inquiry_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_messages_read(UUID) TO authenticated;

-- Bell notification for the other party. Preview is capped at 140 chars, the
-- same residual 20261015 accepted for matter messages.
CREATE OR REPLACE FUNCTION private.on_inquiry_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client   UUID;
  v_assigned UUID;
  v_preview  TEXT;
BEGIN
  SELECT i.client_id, i.assigned_to INTO v_client, v_assigned
  FROM public.inquiries i WHERE i.id = NEW.inquiry_id;

  v_preview := left(private.decrypt_inquiry_message(NEW.body), 140);

  IF NEW.author_id IS NOT DISTINCT FROM v_client THEN
    -- From the client to the assigned lawyer (create_notification no-ops on a
    -- NULL recipient, which covers an unassigned inquiry).
    PERFORM private.create_notification(
      v_assigned, 'New message about an inquiry', v_preview, 'info', 'inquiries');
  ELSE
    PERFORM private.create_notification(
      v_client, 'New message from the firm', v_preview, 'info', 'inquiries');
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.on_inquiry_message_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS inquiry_messages_notify ON public.inquiry_messages;
CREATE TRIGGER inquiry_messages_notify
AFTER INSERT ON public.inquiry_messages
FOR EACH ROW EXECUTE FUNCTION private.on_inquiry_message_insert();


-- ----------------------------------------------------------------------------
-- 5. Appointments: matter-less consultation requests + backend validation
-- ----------------------------------------------------------------------------
-- A consultation request from the public site has no matter yet, so matter_id
-- must become nullable. inquiry_id links the appointment back to the inquiry
-- the same booking filed, so Client Intake and the calendar tell one story.
ALTER TABLE public.appointments ALTER COLUMN matter_id DROP NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE SET NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_inquiry ON public.appointments (inquiry_id);

-- INSERT: admins, the matter's own client/lawyer (unchanged rule), and — new —
-- a client requesting a consultation with a real, active lawyer, without a
-- matter. Status must be 'Pending' and the client must be themselves.
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.is_admin())
  OR (client_id = (SELECT auth.uid()) AND status = 'Pending'
      AND (
        (matter_id IS NULL AND private.is_active_lawyer(lawyer_id))
        OR EXISTS (SELECT 1 FROM public.matters m
                   WHERE m.id = appointments.matter_id
                     AND m.client_id = (SELECT auth.uid())
                     AND m.lawyer_id = appointments.lawyer_id)
      ))
  OR (lawyer_id = (SELECT auth.uid())
      AND EXISTS (SELECT 1 FROM public.matters m
                  WHERE m.id = appointments.matter_id
                    AND m.lawyer_id = (SELECT auth.uid())
                    AND m.client_id = appointments.client_id))
);

-- Backend date/format validation + the reschedule stamp. The partial unique
-- index uq_appointments_lawyer_slot (20261001) already makes double-booking
-- impossible at the database level; this adds the checks a client-side
-- date-picker cannot be trusted to perform.
CREATE OR REPLACE FUNCTION private.guard_appointment_booking() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_slot_changed BOOLEAN;
BEGIN
  v_slot_changed := (TG_OP = 'INSERT')
                 OR NEW.date IS DISTINCT FROM OLD.date
                 OR NEW.time IS DISTINCT FROM OLD.time;

  IF TG_OP = 'UPDATE' AND v_slot_changed THEN
    NEW.rescheduled_at := NOW();
  END IF;

  IF NEW.status IN ('Pending'::public.appointment_status, 'Confirmed'::public.appointment_status)
     AND v_slot_changed THEN
    -- Two accepted shapes: 24-hour 'HH:MM' (what new callers should send) and
    -- the 12-hour 'H:MM AM/PM' the existing AppointmentsPanel has always
    -- booked with. Anything else — '25:99', free text — is refused. Both
    -- branches pin the hour and minute ranges, so '99:99 PM' cannot slip in.
    IF NEW.time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND NEW.time !~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$' THEN
      RAISE EXCEPTION 'Appointment time must be in HH:MM or H:MM AM/PM format'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Appointments cannot be booked in the past' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.guard_appointment_booking() FROM PUBLIC;

DROP TRIGGER IF EXISTS appointments_guard_booking ON public.appointments;
CREATE TRIGGER appointments_guard_booking
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.guard_appointment_booking();

-- The notify trigger learns the reschedule branch and fires on date/time too.
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
  ELSIF NEW.date IS DISTINCT FROM OLD.date OR NEW.time IS DISTINCT FROM OLD.time THEN
    v_title := 'Appointment rescheduled';
    v_msg := NEW.appointment_type || ' is now on ' || NEW.date::TEXT || ' at ' || NEW.time || '.';
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
AFTER INSERT OR UPDATE OF status, date, time ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.notify_appointment_changed();


-- ----------------------------------------------------------------------------
-- 6. Realtime: publish the tables the portal subscribes to
-- ----------------------------------------------------------------------------
-- Supabase Realtime applies each table's SELECT policies to postgres_changes,
-- so clients and lawyers only receive their own rows. REPLICA IDENTITY stays
-- default: the app refetches on any event and never needs old-row values.
DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication not found — skipping realtime registration';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['inquiries', 'inquiry_messages', 'appointments', 'matter_notes'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 7. Grants for the notify-event edge function (service role)
-- ----------------------------------------------------------------------------
-- The email function resolves recipients from trusted records with the service
-- role. inquiries is already granted (20261011); profiles and appointments
-- were not, and a missing grant fails as 42501 at send time.
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT ON public.appointments TO service_role;


-- ----------------------------------------------------------------------------
-- 8. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_col    BOOLEAN;
  v_table  BOOLEAN;
  v_view   BOOLEAN;
  v_key    BOOLEAN;
  v_pols   INTEGER;
  v_pub    INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'inquiries'
                   AND column_name = 'requested_lawyer_id') INTO v_col;
  SELECT to_regclass('public.inquiry_messages') IS NOT NULL INTO v_table;
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'inquiry_messages_thread'
      AND EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}'::text[])) o
                  WHERE o = 'security_invoker=true')
  ) INTO v_view;
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'inquiry_messages_key') INTO v_key;
  SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inquiry_messages' INTO v_pols;
  SELECT count(*) FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('inquiries', 'inquiry_messages', 'appointments', 'matter_notes') INTO v_pub;

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'inquiries.requested_lawyer_id present (want true) : %', v_col;
  RAISE NOTICE 'inquiry_messages table present (want true)       : %', v_table;
  RAISE NOTICE 'thread view is security_invoker (want true)      : %', v_view;
  RAISE NOTICE 'inquiry_messages_key present (want true)         : %', v_key;
  RAISE NOTICE 'inquiry_messages policies (want 2)               : %', v_pols;
  RAISE NOTICE 'realtime tables registered (want 4)              : %', v_pub;
  RAISE NOTICE '--------------------------------------------------------------';
END $$;
