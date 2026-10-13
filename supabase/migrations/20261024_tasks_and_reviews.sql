-- ============================================================================
-- 20261024  Tasks + reviews (Phase B of the 6-role build)
-- ============================================================================
-- Run AFTER 20261023 (needs the six-role helpers: is_matter_team(),
-- is_matter_lawyer_team(), is_admin(), is_staff_account_admin()).
-- Safe to re-run (verified twice by scripts/local-pg-validate.sh).
--
-- Firm staff work matters through assigned tasks with an optional review gate:
--
--   * tasks        — one row per unit of work on a matter: assignee, creator,
--                    status, priority, due date, review requirement.
--   * task_reviews — immutable review decisions (Approved / Changes
--                    Requested). Four-eyes: a task can never be reviewed by
--                    its own assignee.
--   * task_events  — the per-task timeline, mirroring matter_events.
--
-- WHO CAN DO WHAT (decisions implemented):
--   * Create tasks       : matter lawyers on their own matters, managing
--                          partner on any matter. (Not system_admin — no
--                          legal work; not paralegals — they execute.)
--   * See a task         : assignee, creator, the matter team (lawyers AND
--                          paralegals), managing partner. Never clients.
--   * Move status        : assignee or a manager (matter lawyer / creator /
--                          MP) — but only along the transition matrix in
--                          private.guard_task_write().
--   * Reassign / cancel  : managers only (guard-enforced).
--   * Review             : matter lawyer, task creator or MP; never the
--                          assignee. Reviewing requires status In Review.
--   * Completion rule    : a task with requires_review = TRUE reaches
--                          Completed ONLY through an approved review row.
--                          Simple tasks complete directly from In Progress.
--
-- Notifications (private.create_notification, which skips the actor):
--   assigned / reassigned → assignee; ready for review → creator;
--   review decision → assignee; cancelled → assignee.
--   Completed-by-review is announced by apply_task_review() with the
--   decision text, so log_task_change() stays silent for Completed.
--
-- Realtime: tasks, task_reviews and task_events join the
-- supabase_realtime publication; the frontend treats each event as
-- "something changed, refetch" and each table's SELECT policy stays the
-- security boundary.
--
-- All three tables: RLS enabled, anon revoked, no DELETE policy (cancel,
-- don't delete — history stays intact; matter deletion cascades).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
-- CREATE TYPE has no IF NOT EXISTS; catch duplicate_object so a second pass
-- is a no-op. The verification block below re-checks the exact value lists.
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM
    ('Open', 'In Progress', 'Blocked', 'In Review', 'Completed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.review_decision AS ENUM
    ('Approved', 'Changes Requested');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id       UUID NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  description     TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  assigned_to     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          public.task_status NOT NULL DEFAULT 'Open',
  priority        public.priority_level NOT NULL DEFAULT 'Medium',
  due_date        DATE,
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision    public.review_decision NOT NULL,
  comment     TEXT CHECK (comment IS NULL OR char_length(comment) <= 5000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT,
  actor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes: the two the UI leans on (my tasks by status; a matter's task
-- list), plus one per foreign key so the advisor's unindexed_foreign_keys
-- check stays quiet.
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_matter_created  ON public.tasks(matter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by     ON public.tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_task_reviews_task     ON public.task_reviews(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_reviews_reviewer ON public.task_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_task_events_task      ON public.task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_actor     ON public.task_events(actor_id);

ALTER TABLE public.tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tasks, public.task_reviews, public.task_events FROM anon;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ----------------------------------------------------------------------------
-- 3. Write guard: validation + the transition matrix
-- ----------------------------------------------------------------------------
-- Runs on INSERT (force assigned_by, validate the assignee) and on UPDATE
-- (immutable fields, reassignment rights, status matrix, completion rule).
CREATE OR REPLACE FUNCTION private.guard_task_write() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid      UUID := (SELECT auth.uid());
  v_manager  BOOLEAN;
  v_assignee BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;  -- SQL editor / service role

  -- The assignee must be active firm staff: never a client, never a
  -- deactivated or soft-deleted account.
  IF TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = NEW.assigned_to
        AND p.role::TEXT <> 'client'
        AND COALESCE(p.is_active, TRUE)
        AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Tasks can only be assigned to active firm staff';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.assigned_by := v_uid;   -- the creator is whoever inserts the row
    RETURN NEW;
  END IF;

  IF NEW.matter_id IS DISTINCT FROM OLD.matter_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
    RAISE EXCEPTION 'Task matter, creator and creation time cannot be changed';
  END IF;

  v_manager  := private.is_admin()
                OR private.is_matter_lawyer_team(OLD.matter_id)
                OR OLD.assigned_by = v_uid;
  v_assignee := OLD.assigned_to = v_uid;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT v_manager THEN
    RAISE EXCEPTION 'Only a matter lawyer or the managing partner can reassign a task';
  END IF;

  IF NEW.requires_review IS DISTINCT FROM OLD.requires_review AND NOT v_manager THEN
    RAISE EXCEPTION 'Only a matter lawyer or the managing partner can change the review requirement';
  END IF;

  -- A plain assignee moves status; the task's description of the work stays
  -- with the managers.
  IF NOT v_manager AND (NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.due_date IS DISTINCT FROM OLD.due_date) THEN
    RAISE EXCEPTION 'Only a matter lawyer or the managing partner can change task details';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (v_assignee OR v_manager) THEN
      RAISE EXCEPTION 'Only the assignee, a matter lawyer or the managing partner can move a task';
    END IF;
    IF OLD.status IN ('Completed', 'Cancelled') THEN
      RAISE EXCEPTION 'Task is already % and cannot be reopened', OLD.status;
    END IF;
    IF NEW.status = 'Cancelled' AND NOT v_manager THEN
      RAISE EXCEPTION 'Only a matter lawyer or the managing partner can cancel a task';
    END IF;

    -- The completion rule: with requires_review, Completed is reachable only
    -- from In Review and only while the latest review decision is Approved
    -- (apply_task_review() inserts that row just before it flips the status).
    IF NEW.status = 'Completed' THEN
      IF OLD.status = 'In Review' AND EXISTS (
        SELECT 1 FROM public.task_reviews r
        WHERE r.task_id = OLD.id
          AND r.created_at = (SELECT max(r2.created_at) FROM public.task_reviews r2 WHERE r2.task_id = OLD.id)
          AND r.decision = 'Approved'
      ) THEN
        NULL;  -- approved review on record: completion allowed
      ELSIF NOT OLD.requires_review AND OLD.status = 'In Progress' THEN
        NULL;  -- simple task, completed directly by assignee or manager
      ELSIF OLD.requires_review THEN
        RAISE EXCEPTION 'This task requires review: it is completed through an approved review';
      ELSE
        RAISE EXCEPTION 'A task can only be completed from In Progress';
      END IF;
    END IF;

    IF NEW.status <> 'Cancelled' AND NOT (CASE OLD.status
      WHEN 'Open'        THEN NEW.status IN ('In Progress', 'Blocked', 'In Review')
      WHEN 'In Progress' THEN NEW.status IN ('Open', 'In Review', 'Blocked', 'Completed')
      WHEN 'Blocked'     THEN NEW.status IN ('In Progress', 'Open')
      WHEN 'In Review'   THEN NEW.status IN ('In Progress', 'Completed')
      ELSE FALSE END) THEN
      RAISE EXCEPTION 'Status cannot move from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_guard_write ON public.tasks;
CREATE TRIGGER tasks_guard_write BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.guard_task_write();


-- ----------------------------------------------------------------------------
-- 4. Review guard + effect
-- ----------------------------------------------------------------------------
-- BEFORE INSERT: reviews are always recorded as their author; four-eyes (the
-- assignee can never review); the task must be In Review; reviewer must be a
-- matter lawyer, the task creator or the MP.
CREATE OR REPLACE FUNCTION private.guard_task_review() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  t     RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  SELECT id, matter_id, assigned_to, assigned_by, status INTO t
  FROM public.tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  NEW.reviewer_id := v_uid;
  NEW.comment := NULLIF(btrim(COALESCE(NEW.comment, '')), '');

  IF t.status <> 'In Review' THEN
    RAISE EXCEPTION 'Only a task In Review can be reviewed';
  END IF;
  IF t.assigned_to = v_uid THEN
    RAISE EXCEPTION 'A task cannot be reviewed by its assignee';
  END IF;
  IF NOT (private.is_admin() OR private.is_matter_lawyer_team(t.matter_id) OR t.assigned_by = v_uid) THEN
    RAISE EXCEPTION 'Only a matter lawyer, the task creator or the managing partner can review';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS task_reviews_guard ON public.task_reviews;
CREATE TRIGGER task_reviews_guard BEFORE INSERT ON public.task_reviews
FOR EACH ROW EXECUTE FUNCTION private.guard_task_review();

-- AFTER INSERT: apply the decision (Approved → Completed, Changes Requested →
-- back to In Progress), write the timeline entry, notify the assignee with
-- the decision, and audit. The task UPDATE re-enters guard_task_write() as
-- the reviewer, which the matrix above allows.
CREATE OR REPLACE FUNCTION private.apply_task_review() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t        RECORD;
  v_author TEXT;
BEGIN
  SELECT id, assigned_to, title INTO t FROM public.tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.tasks
  SET status = CASE NEW.decision
                 WHEN 'Approved' THEN 'Completed'::public.task_status
                 ELSE 'In Progress'::public.task_status
               END
  WHERE id = NEW.task_id;

  INSERT INTO public.task_events(task_id, event_type, title, detail, actor_id)
  VALUES (NEW.task_id, 'review', 'Review: ' || NEW.decision::TEXT, NEW.comment, NEW.reviewer_id);

  SELECT COALESCE(p.full_name, 'a reviewer') INTO v_author
  FROM public.profiles p WHERE p.id = NEW.reviewer_id;

  PERFORM private.create_notification(
    t.assigned_to,
    CASE NEW.decision WHEN 'Approved' THEN 'Task approved' ELSE 'Task changes requested' END,
    left(t.title, 120) || CASE NEW.decision
      WHEN 'Approved' THEN ' — approved by ' || v_author
      ELSE ' — changes requested by ' || v_author END,
    'info', 'tasks');

  PERFORM private.write_audit('TASK_REVIEWED', 'Task review: ' || NEW.decision::TEXT, 'task', NEW.task_id::TEXT,
    jsonb_build_object('decision', NEW.decision, 'reviewer', NEW.reviewer_id));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS task_reviews_apply ON public.task_reviews;
CREATE TRIGGER task_reviews_apply AFTER INSERT ON public.task_reviews
FOR EACH ROW EXECUTE FUNCTION private.apply_task_review();


-- ----------------------------------------------------------------------------
-- 5. Timeline + notifications on task changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.log_task_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_from TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_events(task_id, event_type, title, actor_id)
    VALUES (NEW.id, 'created', 'Task created: ' || left(NEW.title, 200), (SELECT auth.uid()));
    PERFORM private.create_notification(NEW.assigned_to, 'New task assigned',
      left(NEW.title, 120), 'info', 'tasks');
    PERFORM private.write_audit('TASK_CREATED', 'Task created', 'task', NEW.id::TEXT,
      jsonb_build_object('matter', NEW.matter_id, 'assignee', NEW.assigned_to));
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    SELECT COALESCE(p.full_name, '(former staff)') INTO v_from
    FROM public.profiles p WHERE p.id = OLD.assigned_to;
    INSERT INTO public.task_events(task_id, event_type, title, detail, actor_id)
    VALUES (NEW.id, 'assignment', 'Reassigned', 'From ' || COALESCE(v_from, '(former staff)'), (SELECT auth.uid()));
    PERFORM private.create_notification(NEW.assigned_to, 'Task assigned to you',
      left(NEW.title, 120), 'info', 'tasks');
    PERFORM private.write_audit('TASK_REASSIGNED', 'Task reassigned', 'task', NEW.id::TEXT,
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_events(task_id, event_type, title, detail, actor_id)
    VALUES (NEW.id, 'status', 'Status changed', OLD.status::TEXT || ' → ' || NEW.status::TEXT, (SELECT auth.uid()));
    IF NEW.status = 'In Review' THEN
      PERFORM private.create_notification(NEW.assigned_by, 'Task ready for review',
        left(NEW.title, 120), 'info', 'tasks');
    ELSIF NEW.status = 'Cancelled' THEN
      PERFORM private.create_notification(NEW.assigned_to, 'Task cancelled',
        left(NEW.title, 120), 'info', 'tasks');
    END IF;
    -- Completed is announced by apply_task_review() together with the
    -- decision text; a direct completion is done by the assignee themselves,
    -- so there is nobody else to notify.
    PERFORM private.write_audit('TASK_STATUS_CHANGED', 'Task ' || OLD.status || ' → ' || NEW.status,
      'task', NEW.id::TEXT, jsonb_build_object('old', OLD.status, 'new', NEW.status));
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.task_events(task_id, event_type, title, actor_id)
    VALUES (NEW.id, 'planning', 'Due date or priority changed', (SELECT auth.uid()));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_log_change ON public.tasks;
CREATE TRIGGER tasks_log_change AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.log_task_change();


-- ----------------------------------------------------------------------------
-- 6. Policies
-- ----------------------------------------------------------------------------
-- Select: assignee, creator, matter team (lawyers + paralegals), MP. Never
-- clients — tasks are internal work management.
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to = (SELECT auth.uid())
      OR assigned_by = (SELECT auth.uid())
      OR (SELECT private.is_matter_team(matter_id))
      OR (SELECT private.is_admin()));

-- Create: matter lawyers on their matters, MP on any matter. The guard
-- stamps assigned_by and validates the assignee.
DROP POLICY IF EXISTS tasks_insert_managers ON public.tasks;
CREATE POLICY tasks_insert_managers ON public.tasks FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()) OR (SELECT private.is_matter_lawyer_team(matter_id)));

-- Update: the assignee (status only, enforced by the guard) and the managers.
DROP POLICY IF EXISTS tasks_update_assignee ON public.tasks;
CREATE POLICY tasks_update_assignee ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to = (SELECT auth.uid()))
  WITH CHECK (assigned_to = (SELECT auth.uid()));

DROP POLICY IF EXISTS tasks_update_managers ON public.tasks;
CREATE POLICY tasks_update_managers ON public.tasks FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin())
      OR (SELECT private.is_matter_lawyer_team(matter_id))
      OR assigned_by = (SELECT auth.uid()))
  WITH CHECK ((SELECT private.is_admin())
      OR (SELECT private.is_matter_lawyer_team(matter_id))
      OR assigned_by = (SELECT auth.uid()));

-- No DELETE policy anywhere: tasks are cancelled, not deleted. History
-- (task_events, task_reviews) stays intact; matter deletion cascades.

-- task_reviews: visible exactly when the task is visible (same condition as
-- tasks_select, repeated here so the policy does not rely on nested RLS).
-- Insert is reviewer-only and capability-checked; there is no update or
-- delete policy — a recorded decision is immutable.
DROP POLICY IF EXISTS task_reviews_select ON public.task_reviews;
CREATE POLICY task_reviews_select ON public.task_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = (SELECT auth.uid())
        OR t.assigned_by = (SELECT auth.uid())
        OR (SELECT private.is_matter_team(t.matter_id))
        OR (SELECT private.is_admin()))
  ));

DROP POLICY IF EXISTS task_reviews_insert ON public.task_reviews;
CREATE POLICY task_reviews_insert ON public.task_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assigned_by = (SELECT auth.uid())
          OR (SELECT private.is_matter_lawyer_team(t.matter_id))
          OR (SELECT private.is_admin()))
    )
  );

-- task_events: same visibility as the task. No insert policy — rows are
-- written by the SECURITY DEFINER triggers above only.
DROP POLICY IF EXISTS task_events_select ON public.task_events;
CREATE POLICY task_events_select ON public.task_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id
      AND (t.assigned_to = (SELECT auth.uid())
        OR t.assigned_by = (SELECT auth.uid())
        OR (SELECT private.is_matter_team(t.matter_id))
        OR (SELECT private.is_admin()))
  ));


-- ----------------------------------------------------------------------------
-- 7. Realtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'supabase_realtime publication not found — skipping realtime registration';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['tasks', 'task_reviews', 'task_events'] LOOP
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
-- 8. Verify (read-only)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_status   TEXT;
  v_decision TEXT;
  v_tables   INTEGER;
  v_rls      INTEGER;
  v_policies INTEGER;
  v_pub      INTEGER;
BEGIN
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_status
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'task_status';
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_decision
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'review_decision';

  SELECT count(*) INTO v_tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('tasks', 'task_reviews', 'task_events') AND c.relkind = 'r';
  SELECT count(*) INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('tasks', 'task_reviews', 'task_events') AND c.relrowsecurity;
  SELECT count(*) INTO v_policies FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('tasks', 'task_reviews', 'task_events');
  SELECT count(*) INTO v_pub FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('tasks', 'task_reviews', 'task_events');

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'task_status values                      : %', v_status;
  RAISE NOTICE 'review_decision values                  : %', v_decision;
  RAISE NOTICE 'tables (want 3) / RLS on (want 3)       : % / %', v_tables, v_rls;
  RAISE NOTICE 'policies (want 7) / realtime (want 3)   : % / %', v_policies, v_pub;
  RAISE NOTICE '--------------------------------------------------------------';

  IF v_status IS DISTINCT FROM 'Open,In Progress,Blocked,In Review,Completed,Cancelled' THEN
    RAISE WARNING 'task_status enum values are wrong: %', v_status;
  END IF;
  IF v_decision IS DISTINCT FROM 'Approved,Changes Requested' THEN
    RAISE WARNING 'review_decision enum values are wrong: %', v_decision;
  END IF;
  IF v_tables <> 3 OR v_rls <> 3 OR v_policies < 7 THEN
    RAISE WARNING 'tasks surface incomplete: tables=% rls=% policies=%', v_tables, v_rls, v_policies;
  END IF;
  IF v_pub < 3 THEN
    RAISE NOTICE 'realtime: % of 3 tables published (publication may be absent locally)', v_pub;
  END IF;

  RAISE NOTICE 'tasks and reviews: OK';
END $$;
