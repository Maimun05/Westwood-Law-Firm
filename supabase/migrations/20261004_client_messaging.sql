-- ============================================================================
-- 20261004  Client messaging on matters
-- ============================================================================
-- Run AFTER 20261003_integrity_hardening.sql. Safe to re-run.
--
-- The client could read client-visible notes but could not write one:
--
--   matter_notes_insert required is_matter_lawyer_team(matter_id)
--     OR (visibility = 'client' AND is_admin())
--
-- so a client replying to their lawyer was rejected by RLS. There was no way
-- for a client to say anything inside the portal at all — the firm's only
-- stated alternative was email.
--
-- Two things change:
--
--   1. A client may insert a note on a matter they own, and only at
--      visibility = 'client'. They cannot write internal notes (which they
--      are not allowed to read anyway), and they cannot write to a matter
--      that is not theirs.
--   2. private.on_matter_note_insert() notified the client on every
--      client-visible note. When the client is the author that is a no-op
--      (create_notification already refuses to notify the actor), so the
--      lawyer heard nothing. A client-authored note now notifies the
--      assigned lawyer and the rest of the matter team.
--
-- No new table and no new column: matter_notes already had the visibility
-- column and a client-visible SELECT policy.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Clients may post client-visible notes on their own matters
-- ----------------------------------------------------------------------------
-- Kept as a separate policy from matter_notes_insert rather than widening that
-- one, so the lawyer/admin rule stays legible and a future edit to one cannot
-- silently loosen the other.
DROP POLICY IF EXISTS matter_notes_insert_client ON public.matter_notes;
CREATE POLICY matter_notes_insert_client ON public.matter_notes
FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())
  AND visibility = 'client'
  AND EXISTS (
    SELECT 1 FROM public.matters m
    WHERE m.id = matter_notes.matter_id
      AND m.client_id = (SELECT auth.uid())
  )
);


-- ----------------------------------------------------------------------------
-- 2. A client's message notifies the lawyer team, not the client
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.on_matter_note_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_client   UUID;
  v_assigned UUID;
  v_member   UUID;
  v_is_client_author BOOLEAN;
BEGIN
  SELECT m.client_id, m.lawyer_id INTO v_client, v_assigned
  FROM public.matters m WHERE m.id = NEW.matter_id;

  v_is_client_author := (NEW.author_id IS NOT DISTINCT FROM v_client);

  INSERT INTO public.matter_events(matter_id, event_type, title, actor_id, visible_to_client)
  VALUES (
    NEW.matter_id,
    'note',
    CASE
      WHEN v_is_client_author THEN 'Message from the client'
      WHEN NEW.visibility = 'client' THEN 'Update from your lawyer'
      ELSE 'Internal note added'
    END,
    NEW.author_id,
    NEW.visibility = 'client'
  );

  IF NEW.visibility = 'client' THEN
    IF v_is_client_author THEN
      -- The client wrote it. Tell the assigned lawyer, then everyone else on
      -- the team. create_notification() skips the author, so if a team member
      -- wrote the note they are not notified about their own message.
      PERFORM private.create_notification(
        v_assigned, 'New message from your client', left(NEW.body, 140), 'info', 'matters');

      FOR v_member IN
        SELECT mm.lawyer_id FROM public.matter_members mm
        WHERE mm.matter_id = NEW.matter_id
          AND mm.lawyer_id IS DISTINCT FROM v_assigned
      LOOP
        PERFORM private.create_notification(
          v_member, 'New message from a client', left(NEW.body, 140), 'info', 'matters');
      END LOOP;
    ELSE
      PERFORM private.create_notification(
        v_client, 'New update on your matter', left(NEW.body, 140), 'info', 'matters');
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS matter_notes_after_insert ON public.matter_notes;
CREATE TRIGGER matter_notes_after_insert AFTER INSERT ON public.matter_notes
FOR EACH ROW EXECUTE FUNCTION private.on_matter_note_insert();


-- ----------------------------------------------------------------------------
-- 3. Report what is now in force
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_policy BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matter_notes'
      AND policyname = 'matter_notes_insert_client'
  ) INTO v_policy;

  RAISE NOTICE 'Clients can post client-visible matter notes: %', v_policy;
END $$;
