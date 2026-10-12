-- ============================================================================
-- 20261020 — Realtime for every remaining portal surface
-- ============================================================================
-- 20260929 published `notifications`; 20261018 published `inquiries`,
-- `inquiry_messages`, `appointments` and `matter_notes`. Every other table the
-- portal or the public site renders still required a manual reload before a
-- change appeared: matters, documents, matter activity, the matter team,
-- profiles (names and pictures), audit logs, the content tables and the
-- seminar send log.
--
-- This migration publishes the rest so one refetch-on-event subscription per
-- screen keeps those surfaces live. It adds no tables, columns or policies —
-- each table's existing SELECT policies remain the security boundary.
--
-- Realtime semantics this relies on (Supabase docs, "Postgres Changes"):
--   * a table only streams when it is in the `supabase_realtime` publication;
--   * INSERT and UPDATE events are authorized against each subscriber's RLS —
--     a subscriber can never receive a row their SELECT policy would hide, and
--     an UPDATE that moves a row out of someone's visibility is dropped for
--     them (their next refetch is authoritative);
--   * DELETE events are NOT RLS-filtered (there is no row left to authorize)
--     and carry only the primary key — the app never renders from `payload`,
--     it refetches, so a delete event can never leak row contents;
--   * a *filtered* subscription only receives DELETE events when the table has
--     REPLICA IDENTITY FULL, so the three tables whose deletes happen in the
--     UI and are subscribed with a filter get it below (documents,
--     matter_members, notifications). The rest keep the default identity —
--     their deletes either never happen or are subscribed unfiltered.
--
-- Delivery is best-effort by design: the frontend treats every event as
-- "something changed, refetch", sharing one merge path with the initial load.
-- A dropped event is a stale row until the next signal, never a duplicate and
-- never a broken screen.

-- ----------------------------------------------------------------------------
-- 1. Replica identity for the tables whose filtered DELETE events matter
-- ----------------------------------------------------------------------------
-- documents      — a deleted document must leave every open documents list;
--                  MatterDetail subscribes with `matter_id=eq.<id>`.
-- matter_members — removing a lawyer from the team must update the open modal.
-- notifications  — useNotifications subscribes with `user_id=eq.<id>` and
--                  drops the row on DELETE (payload.old carries the PK).
ALTER TABLE IF EXISTS public.documents REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.matter_members REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- 2. Publish the remaining tables
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication not found — skipping realtime registration';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'profiles',             -- names + pictures (own row; all rows for staff)
    'matters',              -- matter lists and dashboard counters
    'documents',            -- document lists and per-matter panels
    'matter_events',        -- client dashboard activity + matter timeline
    'matter_members',       -- matter team panel
    'audit_logs',           -- admin audit tab
    'practice_areas',       -- portal + public content
    'specialists',          -- partner network (portal + public)
    'corporate_clients',    -- public about/contact pages
    'articles',             -- insights (public + content manager)
    'faqs',                 -- FAQ tab (public + content manager)
    'seminar_events',       -- seminars (public + content manager)
    'retainer_packages',    -- retainers (public + content manager)
    'seminar_email_log',    -- "recent sends" in the registrants dialog
    'inquiry_attachments'   -- attachments shown on an inquiry in intake
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'public.% does not exist — skipped', t;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_pub     INTEGER;
  v_total   INTEGER;
  v_full    INTEGER;
  v_missing TEXT;
BEGIN
  SELECT count(*) INTO v_total FROM unnest(ARRAY[
    'profiles', 'matters', 'documents', 'matter_events', 'matter_members',
    'audit_logs', 'practice_areas', 'specialists', 'corporate_clients',
    'articles', 'faqs', 'seminar_events', 'retainer_packages',
    'seminar_email_log', 'inquiry_attachments'
  ]) t
  WHERE to_regclass('public.' || t) IS NOT NULL;

  SELECT count(*) INTO v_pub FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN (
        'profiles', 'matters', 'documents', 'matter_events', 'matter_members',
        'audit_logs', 'practice_areas', 'specialists', 'corporate_clients',
        'articles', 'faqs', 'seminar_events', 'retainer_packages',
        'seminar_email_log', 'inquiry_attachments'
      );

  SELECT count(*) INTO v_full FROM pg_class
    WHERE oid IN (to_regclass('public.documents'), to_regclass('public.matter_members'),
                  to_regclass('public.notifications'))
      AND relreplident = 'f';

  SELECT string_agg(t, ', ') INTO v_missing FROM unnest(ARRAY[
    'profiles', 'matters', 'documents', 'matter_events', 'matter_members',
    'audit_logs', 'practice_areas', 'specialists', 'corporate_clients',
    'articles', 'faqs', 'seminar_events', 'retainer_packages',
    'seminar_email_log', 'inquiry_attachments'
  ]) t
  WHERE to_regclass('public.' || t) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    );

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'remaining portal tables published (want all) : % / %', v_pub, v_total;
  RAISE NOTICE 'filtered-delete tables with identity full     : % / 3', v_full;
  RAISE NOTICE 'tables still missing from the publication     : %', COALESCE(v_missing, 'none');
  RAISE NOTICE '--------------------------------------------------------------';
END $$;
