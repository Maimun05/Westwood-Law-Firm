-- ============================================================================
-- 20261006  Public inquiry submission
-- ============================================================================
-- The contact form, the consultation booking, and the seminar registration all
-- funnel through submitInquiry() in src/utils/api.ts. Until now that did a
-- direct INSERT and asked for the row back:
--
--   .insert({...}).select('*').single()
--
-- which cannot work for a signed-out visitor, in two separate ways:
--
--   1. inquiry_number has DEFAULT public.generate_inquiry_number(), and a
--      DEFAULT expression runs as the INSERTING role. schema-production.sql
--      grants the function and the sequence to authenticated only, so an
--      anonymous insert died at the DEFAULT with
--        42501 permission denied for sequence inquiry_number_seq
--      This is the live failure that was reported from the browser.
--
--   2. Even with the grant fixed, .select('*') asks PostgREST for
--      INSERT ... RETURNING *. inquiries_select_policy is TO authenticated, so
--      for anon the RETURNING clause yields no rows: the insert succeeds, the
--      response comes back empty, and .single() raises PGRST116. The visitor
--      sees an error for an inquiry that WAS created — the worst of both, since
--      they resubmit and the firm gets duplicates.
--
-- A SECURITY DEFINER function fixes both at once: it runs as its owner, so the
-- sequence is reachable and RETURNING can read the row it just wrote, and it
-- hands back only the reference number.
--
-- It also gives the public form a single validated entry point. The table
-- policies in 20261005 section 7 still stand for anything that writes directly;
-- this is the path the app uses.
--
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_inquiry(
  p_name          TEXT DEFAULT NULL,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_practice_area TEXT DEFAULT NULL,
  p_method        TEXT DEFAULT NULL,
  p_message       TEXT DEFAULT NULL,
  p_subject       TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_number TEXT;
  v_uid    UUID := (SELECT auth.uid());
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

  INSERT INTO public.inquiries (
    name, email, phone, practice_area, preferred_contact_method,
    message, subject, status, client_id
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
    v_uid
  )
  RETURNING inquiry_number INTO v_number;

  RETURN v_number;
END $$;

REVOKE ALL ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------------------
-- Deliberately read-only. An earlier draft round-tripped the function and then
-- deleted the probe row, which would have written to the firm's live inquiry
-- queue during a migration. The behaviour is proven in
-- scripts/local-pg-validate.sh instead, against a throwaway cluster.
DO $$
DECLARE v_sig TEXT := 'public.submit_inquiry(text,text,text,text,text,text,text)';
BEGIN
  IF to_regprocedure(v_sig) IS NULL THEN
    RAISE WARNING 'submit_inquiry was NOT created — the public contact form will fail';
  ELSIF NOT has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE WARNING 'anon cannot execute submit_inquiry — the public contact form will fail';
  ELSIF NOT has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE WARNING 'authenticated cannot execute submit_inquiry';
  ELSE
    RAISE NOTICE 'submit_inquiry is installed and callable by anon and authenticated';
  END IF;
END $$;
