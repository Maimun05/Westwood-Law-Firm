-- ============================================================================
-- 20261013 — Seminar registrations get a real link + email send log
-- ============================================================================
-- Seminar registration was already recorded as an inquiry (subject
-- 'Seminar registration'), but the seminar itself lived only as free text in
-- the message body. That made "email everyone who registered for this
-- seminar" impossible: there was no way to group the rows.
--
-- This migration:
--   1. adds inquiries.seminar_id (TEXT → public.seminar_events, nullable),
--      backfills the rows that can be matched from their message text,
--   2. extends submit_inquiry with an optional p_seminar_id,
--   3. adds public.seminar_email_log so the admin UI can show when a seminar
--      was last emailed and how many sends failed.
--
-- submit_inquiry must be DROPPED and re-created, not CREATE OR REPLACE'd:
-- adding a parameter would leave both the 7-arg and 8-arg signatures in place,
-- and with every argument DEFAULTed a 7-argument call becomes ambiguous
-- (PostgREST answers PGRST203). Dropping the old signature first keeps the
-- 7-argument callers working through the new default.
--
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The link itself
-- ----------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS seminar_id TEXT REFERENCES public.seminar_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inquiries_seminar_id_idx ON public.inquiries (seminar_id);

-- ----------------------------------------------------------------------------
-- 2. Backfill existing registrations.
--    strpos, not LIKE: a seminar title may contain % or _ and those must not
--    act as wildcards. Only rows matching exactly one seminar are linked —
--    two titles that prefix each other must not pick a winner at random.
-- ----------------------------------------------------------------------------
UPDATE public.inquiries i
SET seminar_id = m.seminar_id
FROM (
  SELECT i2.id AS inquiry_id, min(s.id) AS seminar_id
  FROM public.inquiries i2
  JOIN public.seminar_events s
    ON strpos(i2.message, 'Seminar: ' || s.title) > 0
  WHERE i2.seminar_id IS NULL
    AND i2.subject = 'Seminar registration'
  GROUP BY i2.id
  HAVING count(*) = 1
) m
WHERE i.id = m.inquiry_id;

-- ----------------------------------------------------------------------------
-- 3. submit_inquiry gains p_seminar_id
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_inquiry(
  p_name          TEXT DEFAULT NULL,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_practice_area TEXT DEFAULT NULL,
  p_method        TEXT DEFAULT NULL,
  p_message       TEXT DEFAULT NULL,
  p_subject       TEXT DEFAULT NULL,
  p_seminar_id    TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_number   TEXT;
  v_uid      UUID := (SELECT auth.uid());
  v_seminar  TEXT := NULLIF(btrim(COALESCE(p_seminar_id, '')), '');
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

  INSERT INTO public.inquiries (
    name, email, phone, practice_area, preferred_contact_method,
    message, subject, status, client_id, seminar_id
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
    v_seminar
  )
  RETURNING inquiry_number INTO v_number;

  RETURN v_number;
END $$;

REVOKE ALL ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Send log. One row per "email every registrant of this seminar" action.
--    Written by the send-seminar-email edge function (service role), read by
--    the admin UI. Deliberately no INSERT policy: the browser never writes it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seminar_email_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seminar_id      TEXT NOT NULL REFERENCES public.seminar_events(id) ON DELETE CASCADE,
  sent_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_count      INT NOT NULL DEFAULT 0,
  failed_count    INT NOT NULL DEFAULT 0,
  failures        JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seminar_email_log_seminar_id_idx ON public.seminar_email_log (seminar_id);
CREATE INDEX IF NOT EXISTS seminar_email_log_sent_by_idx ON public.seminar_email_log (sent_by);

ALTER TABLE public.seminar_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seminar_email_log_select_admin ON public.seminar_email_log;
CREATE POLICY seminar_email_log_select_admin
ON public.seminar_email_log FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

-- Explicit grants, not project defaults: the send log must be readable by an
-- admin and writable by nobody else. On a project whose default privileges
-- grant authenticated ALL on new tables (Supabase's own bootstrap does, and the
-- harness replicates it), omitting authenticated from the REVOKE would leave
-- INSERT/UPDATE/DELETE granted at the table level — RLS would still refuse the
-- writes, but the next policy mistake would then open the table. 20261007 was
-- the same lesson for the content tables.
REVOKE ALL ON public.seminar_email_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seminar_email_log TO authenticated;
GRANT ALL ON public.seminar_email_log TO service_role;

-- ----------------------------------------------------------------------------
-- Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_sig TEXT := 'public.submit_inquiry(text,text,text,text,text,text,text,text)';
BEGIN
  IF to_regprocedure(v_sig) IS NULL THEN
    RAISE WARNING 'submit_inquiry was NOT re-created — the public forms will fail';
  ELSIF NOT has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE WARNING 'anon cannot execute submit_inquiry — the public forms will fail';
  ELSIF to_regclass('public.seminar_email_log') IS NULL THEN
    RAISE WARNING 'seminar_email_log was NOT created — the send log will be empty';
  ELSE
    RAISE NOTICE 'seminar registrations: link column, RPC and send log are installed';
  END IF;
END $$;
