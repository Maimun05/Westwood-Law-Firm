-- ============================================================================
-- 20261015  Encrypt matter messages at rest (Tier B)
-- ============================================================================
-- matter_notes.body held every lawyer <-> client message as plain text. This
-- migration encrypts it with a symmetric key kept in Supabase Vault, so a
-- stolen database dump or backup is unreadable without the key, while the firm
-- keeps lawful access and the existing notification behaviour is preserved.
--
-- Shape of the design:
--   * The key lives in Vault — never in this file, and never in a table that
--     ships with a dump. It is generated once, on the first apply.
--   * A BEFORE INSERT OR UPDATE trigger encrypts transparently, so the browser
--     still writes plain text into matter_notes and RLS stays the write gate.
--   * Reads go through public.matter_notes_thread, a SECURITY INVOKER view, so
--     the matter_notes SELECT policy remains the single source of row truth.
--     The view is read-only; writes stay on the base table.
--   * The key is unreachable by a client: private.matter_note_key() has its
--     EXECUTE revoked from PUBLIC, and clients are granted only
--     private.decrypt_matter_note(), which can decrypt ciphertext the caller
--     already obtained under RLS and never exposes the key.
--
-- Residual, accepted on purpose: private.on_matter_note_insert() still copies
-- the first 140 characters of a client-visible message into
-- public.notifications.message as plain text — that is the snippet the bell
-- shows. Notifications already have their own access rules, and encrypting them
-- too would break the realtime subscription (the browser cannot decrypt a
-- ciphertext pushed to it), so it is out of scope here.
--
-- Safe to re-run: the key is created only if absent, the backfill only touches
-- rows not yet encrypted, and every object is CREATE OR REPLACE or guarded by
-- IF NOT EXISTS.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Preflight: Vault must be available
-- ----------------------------------------------------------------------------
-- Loud on purpose. Without Vault there is no key store, and a silent no-op
-- would leave the messages in plain text while the owner believes otherwise.
DO $$
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION
      'Supabase Vault is not enabled on this project. Enable the vault extension (Dashboard -> Database -> Extensions) and re-run this file.';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1. The key (created once, never written down here)
-- ----------------------------------------------------------------------------
-- 32 random bytes, base64. gen_random_bytes is pgcrypto in the extensions
-- schema; it is schema-qualified because every function below pins
-- search_path = ''.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'matter_notes_key') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'matter_notes_key',
      'Tier-B symmetric key for public.matter_notes.body');
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Key accessor (NOT callable by clients)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so the Vault read happens as the owner. EXECUTE is revoked
-- from PUBLIC: authenticated already has USAGE on the private schema, so a
-- client that could call this would simply read the key.
CREATE OR REPLACE FUNCTION private.matter_note_key() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'matter_notes_key';
$$;

REVOKE ALL ON FUNCTION private.matter_note_key() FROM PUBLIC;


-- ----------------------------------------------------------------------------
-- 3. Decrypt wrapper (safe to grant to clients)
-- ----------------------------------------------------------------------------
-- The one decrypt path a signed-in user may call. It returns the plain text of
-- the ciphertext it is handed and never reveals the key, so it adds no
-- capability: a caller can only obtain the ciphertext of rows the matter_notes
-- SELECT policy already lets them read.
CREATE OR REPLACE FUNCTION private.decrypt_matter_note(p_body TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
           WHEN p_body IS NULL THEN NULL
           ELSE extensions.pgp_sym_decrypt(decode(p_body, 'base64'), private.matter_note_key())
         END;
$$;

REVOKE ALL ON FUNCTION private.decrypt_matter_note(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.decrypt_matter_note(TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. Mark the column and swap the length constraint
-- ----------------------------------------------------------------------------
-- body_encrypted is the idempotency marker for the backfill below and lets the
-- read view tolerate a row that predates the trigger. New rows are always true.
ALTER TABLE public.matter_notes
  ADD COLUMN IF NOT EXISTS body_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

-- The original constraint checked the PLAIN TEXT length
-- (char_length(btrim(body)) BETWEEN 1 AND 5000). After encryption `body` is
-- base64 ciphertext, which is longer, so that check would reject long messages.
-- Drop it by inspecting the catalog rather than by guessing its auto-generated
-- name, then validate the plain-text bound in the trigger where the plain text
-- still exists.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.matter_notes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%char_length%'
      AND pg_get_constraintdef(oid) ILIKE '%btrim%'
  LOOP
    EXECUTE format('ALTER TABLE public.matter_notes DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- A ciphertext cap, so a non-trigger write cannot store something absurd.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.matter_notes'::regclass
      AND conname = 'matter_notes_body_ciphertext_check'
  ) THEN
    ALTER TABLE public.matter_notes
      ADD CONSTRAINT matter_notes_body_ciphertext_check
      CHECK (char_length(body) BETWEEN 1 AND 20000);
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 5. Backfill existing plain-text rows (idempotent)
-- ----------------------------------------------------------------------------
-- Runs BEFORE the trigger exists, and only touches rows not yet encrypted, so a
-- second apply is a no-op. The marker, not the value, decides what is already
-- ciphertext — a plain-text message that happens to look like base64 cannot be
-- mistaken for one.
UPDATE public.matter_notes
   SET body = encode(extensions.pgp_sym_encrypt(body, private.matter_note_key()), 'base64'),
       body_encrypted = TRUE
 WHERE body_encrypted = FALSE;


-- ----------------------------------------------------------------------------
-- 6. Transparent encryption on write
-- ----------------------------------------------------------------------------
-- INSERT: the browser always sends plain text, so always encrypt.
-- UPDATE: only re-encrypt when the old value was already ciphertext AND the
--         body actually changed. The OLD.body_encrypted guard is what stops the
--         backfill's own UPDATE (and a re-apply) from double-encrypting.
CREATE OR REPLACE FUNCTION private.encrypt_matter_note() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF char_length(btrim(NEW.body)) NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION 'A message must be between 1 and 5000 characters'
        USING ERRCODE = '22023';
    END IF;
    NEW.body := encode(extensions.pgp_sym_encrypt(NEW.body, private.matter_note_key()), 'base64');
    NEW.body_encrypted := TRUE;

  ELSIF TG_OP = 'UPDATE' AND OLD.body_encrypted AND NEW.body IS DISTINCT FROM OLD.body THEN
    IF char_length(btrim(NEW.body)) NOT BETWEEN 1 AND 5000 THEN
      RAISE EXCEPTION 'A message must be between 1 and 5000 characters'
        USING ERRCODE = '22023';
    END IF;
    NEW.body := encode(extensions.pgp_sym_encrypt(NEW.body, private.matter_note_key()), 'base64');
    NEW.body_encrypted := TRUE;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.encrypt_matter_note() FROM PUBLIC;

DROP TRIGGER IF EXISTS matter_notes_encrypt ON public.matter_notes;
CREATE TRIGGER matter_notes_encrypt
BEFORE INSERT OR UPDATE ON public.matter_notes
FOR EACH ROW EXECUTE FUNCTION private.encrypt_matter_note();


-- ----------------------------------------------------------------------------
-- 7. The notification trigger must read plain text
-- ----------------------------------------------------------------------------
-- 20261004's function verbatim, except that the three previews decrypt first:
-- by the time the AFTER trigger runs, NEW.body is ciphertext.
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
      PERFORM private.create_notification(
        v_assigned, 'New message from your client',
        left(private.decrypt_matter_note(NEW.body), 140), 'info', 'matters');

      FOR v_member IN
        SELECT mm.lawyer_id FROM public.matter_members mm
        WHERE mm.matter_id = NEW.matter_id
          AND mm.lawyer_id IS DISTINCT FROM v_assigned
      LOOP
        PERFORM private.create_notification(
          v_member, 'New message from a client',
          left(private.decrypt_matter_note(NEW.body), 140), 'info', 'matters');
      END LOOP;
    ELSE
      PERFORM private.create_notification(
        v_client, 'New update on your matter',
        left(private.decrypt_matter_note(NEW.body), 140), 'info', 'matters');
    END IF;
  END IF;

  RETURN NEW;
END $$;


-- ----------------------------------------------------------------------------
-- 8. The read path: a decrypting SECURITY INVOKER view
-- ----------------------------------------------------------------------------
-- security_invoker is mandatory. Without it the view runs as its owner (the
-- table owner) and bypasses RLS, leaking every note to every signed-in user.
-- With it, the matter_notes SELECT policy still decides which rows a caller
-- sees; the view only decrypts the body of rows they were already allowed to
-- read.
CREATE OR REPLACE VIEW public.matter_notes_thread
WITH (security_invoker = TRUE) AS
SELECT
  id, matter_id, author_id, visibility, created_at, updated_at,
  CASE WHEN body_encrypted THEN private.decrypt_matter_note(body) ELSE body END AS body
FROM public.matter_notes;

-- CREATE OR REPLACE cannot be relied on to change view options; set it outright.
ALTER VIEW public.matter_notes_thread SET (security_invoker = TRUE);

REVOKE ALL ON public.matter_notes_thread FROM PUBLIC, anon;
GRANT SELECT ON public.matter_notes_thread TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 9. Report what is now in force
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_key     BOOLEAN;
  v_view    BOOLEAN;
  v_leak    BOOLEAN;
  v_wrapper BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'matter_notes_key') INTO v_key;

  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'matter_notes_thread'
      AND EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}'::text[])) o
                  WHERE o = 'security_invoker=true')
  ) INTO v_view;

  SELECT has_function_privilege('authenticated', 'private.matter_note_key()', 'EXECUTE') INTO v_leak;
  SELECT has_function_privilege('authenticated', 'private.decrypt_matter_note(text)', 'EXECUTE') INTO v_wrapper;

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'matter_notes_key present (want true)       : %', v_key;
  RAISE NOTICE 'matter_notes_thread is security_invoker    : %', v_view;
  RAISE NOTICE 'authenticated can read the key (want false): %', v_leak;
  RAISE NOTICE 'authenticated can decrypt (want true)      : %', v_wrapper;
  RAISE NOTICE '--------------------------------------------------------------';
END $$;
