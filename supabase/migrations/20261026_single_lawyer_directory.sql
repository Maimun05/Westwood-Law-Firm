-- ============================================================================
-- 20261026 — Single-lawyer directory
-- ============================================================================
-- The firm has one position: Lawyer. Two accounts remain in the public
-- directory — "Sample Lawyer" (the owner's own login) and Atty. Ernesto
-- "Boyet" Tabao. The six demo associates seeded by 20261001 are removed for
-- good: profile row, auth user, and every row that hangs off them.
--
-- Safe to run twice. The second run finds no demo accounts, prints a notice and
-- moves on; the position normalisation below is a plain idempotent UPDATE.
--
-- What happens to dependent rows
--   CASCADE   notifications, appointments, matter_members, profile_practice_areas,
--             audit_logs
--                -> deleted together with the account
--   SET NULL  matters.assigned_to/client_id, matter_events.actor_id,
--             corporate_clients.added_by, articles.author_profile_id,
--             seminar_events.speaker_profile_id, inquiries.assigned_to /
--             requested_lawyer_id, seminar_email_log.sent_by, tasks.assigned_by
--                -> row kept, reference cleared
--   RESTRICT  documents.uploaded_by, matter_notes.author_id,
--             inquiry_messages.author_id, tasks.assigned_to,
--             task_reviews.reviewer_id
--                -> re-anchored to the surviving managing account, otherwise
--                   Postgres refuses the delete outright
--
-- The RESTRICT re-anchor is the only place that rewrites data. It touches rows
-- only where a demo account is the recorded author/assignee, and it prints the
-- count for each table so the effect is visible in the SQL editor output.
-- ============================================================================

DO $cleanup$
DECLARE
  -- Identified by email, not by id: ids differ between projects, emails are
  -- what the 20261001 seed created and what the owner's live project holds.
  demo_emails TEXT[] := ARRAY[
    'mc.santos@westwoodlaw.ph',
    'bj.reyes@westwoodlaw.ph',
    'l.delacruz@westwoodlaw.ph',
    'cg.torres@westwoodlaw.ph',
    'si.mendoza@westwoodlaw.ph',
    'ma.villanueva@westwoodlaw.ph'
  ];
  victims UUID[];
  anchor  UUID;
  moved   BIGINT;
BEGIN
  SELECT array_agg(p.id) INTO victims
  FROM public.profiles p
  WHERE lower(p.email) = ANY (demo_emails);

  IF victims IS NULL THEN
    RAISE NOTICE 'No demo lawyer accounts left — nothing to delete.';
    RETURN;
  END IF;

  -- The account that inherits RESTRICT-bound rows: Atty. Tabao while he is
  -- still around, otherwise whoever survives.
  SELECT p.id INTO anchor
  FROM public.profiles p
  WHERE p.role = 'lawyer'
    AND lower(p.email) = 'atty.boyet@westwoodlaw.ph'
    AND NOT (p.id = ANY (victims));

  IF anchor IS NULL THEN
    SELECT p.id INTO anchor
    FROM public.profiles p
    WHERE p.role = 'lawyer' AND NOT (p.id = ANY (victims))
    ORDER BY p.display_order NULLS LAST, p.created_at
    LIMIT 1;
  END IF;

  IF anchor IS NULL THEN
    RAISE EXCEPTION
      'No surviving lawyer to re-anchor documents, notes, messages and tasks to — aborting before deleting anything.';
  END IF;

  -- --------------------------------------------------------------------------
  -- 1. Clear the RESTRICT references. Each table is guarded by to_regclass()
  --    because a project that never ran the migration owning it has no table,
  --    and a missing table must not stop the cleanup.
  -- --------------------------------------------------------------------------
  IF to_regclass('public.documents') IS NOT NULL THEN
    EXECUTE 'UPDATE public.documents SET uploaded_by = $1 WHERE uploaded_by = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'documents re-anchored: %', moved;
  END IF;

  IF to_regclass('public.matter_notes') IS NOT NULL THEN
    EXECUTE 'UPDATE public.matter_notes SET author_id = $1 WHERE author_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'matter notes re-anchored: %', moved;
  END IF;

  IF to_regclass('public.inquiry_messages') IS NOT NULL THEN
    EXECUTE 'UPDATE public.inquiry_messages SET author_id = $1 WHERE author_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'inquiry messages re-anchored: %', moved;
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    EXECUTE 'UPDATE public.tasks SET assigned_to = $1 WHERE assigned_to = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'tasks re-anchored: %', moved;
  END IF;

  IF to_regclass('public.task_reviews') IS NOT NULL THEN
    EXECUTE 'UPDATE public.task_reviews SET reviewer_id = $1 WHERE reviewer_id = ANY ($2)'
      USING anchor, victims;
    GET DIAGNOSTICS moved = ROW_COUNT;
    RAISE NOTICE 'task reviews re-anchored: %', moved;
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. Delete the accounts. auth.users is the root: profiles.id cascades from
  --    it, and so does everything that cascades from profiles.
  -- --------------------------------------------------------------------------
  DELETE FROM auth.users u WHERE u.id = ANY (victims);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'auth users deleted: %', moved;

  -- Belt and braces: a project whose profiles.id never got the cascade would
  -- otherwise keep an orphan row that still shows up in public_lawyers.
  DELETE FROM public.profiles p WHERE p.id = ANY (victims);
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'orphan profiles deleted: %', moved;
END
$cleanup$;

-- ----------------------------------------------------------------------------
-- 3. One position for the whole firm.
-- ----------------------------------------------------------------------------
-- The directory, the admin "Position at the Firm" dropdown and the profile
-- editor all read this column. Nulls are included: "Sample Lawyer" was seeded
-- without a position and would otherwise keep falling back to the literal
-- "Lawyer" in the components instead of being stored as one.
UPDATE public.profiles
SET position = 'Lawyer',
    updated_at = NOW()
WHERE role = 'lawyer'
  AND position IS DISTINCT FROM 'Lawyer';

-- ----------------------------------------------------------------------------
-- 4. Verification — read the grid.
-- ----------------------------------------------------------------------------
-- expect: 2 lawyers, 2 directory rows, one distinct position ("Lawyer"), and
-- zero rows for any of the six demo addresses.
SELECT 'lawyers'                 AS metric, count(*)::TEXT AS value
FROM public.profiles WHERE role = 'lawyer'
UNION ALL
SELECT 'public_lawyers rows',    count(*)::TEXT
FROM public.public_lawyers
UNION ALL
SELECT 'distinct positions',     COALESCE(string_agg(DISTINCT position, ', '), '(none)')
FROM public.profiles WHERE role = 'lawyer'
UNION ALL
SELECT 'demo accounts remaining', count(*)::TEXT
FROM public.profiles
WHERE lower(email) IN (
  'mc.santos@westwoodlaw.ph', 'bj.reyes@westwoodlaw.ph', 'l.delacruz@westwoodlaw.ph',
  'cg.torres@westwoodlaw.ph', 'si.mendoza@westwoodlaw.ph', 'ma.villanueva@westwoodlaw.ph'
);
