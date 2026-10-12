-- ============================================================================
-- 20261019  Email claim log for the notify-event edge function
-- ============================================================================
-- Transactional email for registered users — inquiry confirmation,
-- consultation request, appointment status changes, new inquiry message —
-- goes through the notify-event edge function. That function resolves every
-- recipient from the database with the service role, and needs each email to
-- go out at most once even when a browser retries or two tabs race.
--
-- The claim is an INSERT with ON CONFLICT DO NOTHING: only the request whose
-- insert actually created the row sends the email. The unique key is
-- (event, entity_id, recipient) — one email per event per record per person.
--
-- Nobody but the service role can touch this table: RLS is on with no
-- policies, and the table grants are revoked from every other role. It stores
-- ids, recipient emails and an event name — never message content.
--
-- Safe to re-run: guarded CREATEs only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'inquiry_submitted' | 'consultation_requested' | 'appointment_status' | 'inquiry_message'
  event      TEXT NOT NULL,
  entity_id  UUID NOT NULL,
  recipient  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_events_once UNIQUE (event, entity_id, recipient)
);

CREATE INDEX IF NOT EXISTS idx_email_events_entity ON public.email_events (entity_id);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS and is the only role with a grant; anon and
-- authenticated see nothing even if they guess the table name.
REVOKE ALL ON public.email_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.email_events TO service_role;


-- ----------------------------------------------------------------------------
-- Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_rls   BOOLEAN;
  v_uniq  BOOLEAN;
  v_anon  BOOLEAN;
  v_svc   BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.email_events'::regclass;
  SELECT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.email_events'::regclass
                   AND conname = 'email_events_once') INTO v_uniq;
  SELECT has_table_privilege('anon', 'public.email_events', 'SELECT') INTO v_anon;
  SELECT has_table_privilege('service_role', 'public.email_events', 'INSERT') INTO v_svc;

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'email_events RLS enabled (want true)      : %', v_rls;
  RAISE NOTICE 'one-email-per-recipient constraint (want true) : %', v_uniq;
  RAISE NOTICE 'anon can read email_events (want false)   : %', v_anon;
  RAISE NOTICE 'service_role can insert claims (want true): %', v_svc;
  RAISE NOTICE '--------------------------------------------------------------';
END $$;
