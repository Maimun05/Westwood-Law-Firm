// ============================================================================
// Tasks panel — assignment + four-eyes review (migration 20261024)
// ============================================================================
// One panel for every staff portal (lawyer, admin). RLS decides which tasks
// each role sees — assignee, creator, the matter team or the admin — and the
// database guards
// decide what each person may change; this panel only offers the actions the
// guards allow, so an error toast is the exception, not the flow.
//
// Live: any task/review/timeline change anywhere the user may see refreshes
// the list without a reload.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToTables } from "@/lib/realtime";
import ListFilters, { applyFilters } from "@/components/portal/ListFilters";
import {
  MODAL_BUTTON_PRIMARY_CLASS,
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalHeader,
} from "@/components/ui/Modal";
import {
  assigneeTransitions,
  createTask,
  getAssignableStaff,
  getTaskEvents,
  getTaskReviews,
  getTasks,
  reassignTask,
  submitTaskReview,
  updateTaskStatus,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ReviewDecision,
  type Task,
  type TaskEvent,
  type TaskPriority,
  type TaskReview,
  type TaskStatus,
} from "@/lib/services/tasks";
import { isFirmAdmin, isLawyer, normalizeRole, roleLabel } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";
import { Person } from "./Person";

type MatterLite = { id: string; matter_number: string; title: string };
type StaffRow = {
  id: string;
  full_name: string;
  role: string;
  position: string | null;
};

const STATUS_TONE: Record<TaskStatus, string> = {
  Open: "bg-blue-50 text-blue-700",
  "In Progress": "bg-purple-50 text-purple-700",
  Blocked: "bg-amber-50 text-amber-700",
  "In Review": "bg-indigo-50 text-indigo-700",
  Completed: "bg-green-50 text-green-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-blue-50 text-blue-700",
  High: "bg-red-50 text-red-700",
};

const chip = "inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded";

function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`${chip} ${STATUS_TONE[status]}`}>{status}</span>;
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`${chip} ${PRIORITY_TONE[priority]}`}>{priority}</span>;
}

// ── Create dialog ─────────────────────────────────────────────────────────────

function CreateTaskModal({
  matters,
  staff,
  onClose,
  onCreated,
}: {
  matters: MatterLite[];
  staff: StaffRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [f, setF] = useState({
    matter_id: matters[0]?.id ?? "",
    title: "",
    description: "",
    assigned_to: "",
    priority: "Medium" as TaskPriority,
    due_date: "",
    requires_review: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.matter_id) {
      setError("Choose the matter this task belongs to.");
      return;
    }
    if (!f.title.trim()) {
      setError("Give the task a title.");
      return;
    }
    if (!f.assigned_to) {
      setError("Choose who works on it.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: createError } = await createTask({
      matter_id: f.matter_id,
      title: f.title,
      description: f.description,
      assigned_to: f.assigned_to,
      priority: f.priority,
      due_date: f.due_date || null,
      requires_review: f.requires_review,
    });
    setBusy(false);
    if (createError) {
      setError(createError);
      return;
    }
    onCreated();
  };

  return (
    <Modal open onClose={onClose} size="md" labelledBy="create-task-title" dismissible={!busy}>
      <ModalHeader
        title="New Task"
        titleId="create-task-title"
        onClose={onClose}
        closeDisabled={busy}
      />
      <ModalBody className="p-7">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={MODAL_LABEL_CLASS}>Matter *</label>
            <select
              value={f.matter_id}
              onChange={(e) => setF({ ...f, matter_id: e.target.value })}
              disabled={busy}
              className={MODAL_INPUT_CLASS}
            >
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matter_number} — {m.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={MODAL_LABEL_CLASS}>Title *</label>
            <input
              type="text"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              disabled={busy}
              maxLength={300}
              className={MODAL_INPUT_CLASS}
              placeholder="e.g. Draft the position paper"
            />
          </div>

          <div>
            <label className={MODAL_LABEL_CLASS}>Instructions</label>
            <textarea
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              disabled={busy}
              maxLength={5000}
              className={MODAL_INPUT_CLASS}
              placeholder="What needs to be done, and any context."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={MODAL_LABEL_CLASS}>Assign to *</label>
              <select
                value={f.assigned_to}
                onChange={(e) => setF({ ...f, assigned_to: e.target.value })}
                disabled={busy}
                className={MODAL_INPUT_CLASS}
              >
                <option value="">Select staff…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {roleLabel(normalizeRole(s.role))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>Priority</label>
              <select
                value={f.priority}
                onChange={(e) => setF({ ...f, priority: e.target.value as TaskPriority })}
                disabled={busy}
                className={MODAL_INPUT_CLASS}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>Due date</label>
              <input
                type="date"
                value={f.due_date}
                onChange={(e) => setF({ ...f, due_date: e.target.value })}
                disabled={busy}
                className={MODAL_INPUT_CLASS}
              />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-[var(--ink-body)]">
              <input
                type="checkbox"
                checked={f.requires_review}
                onChange={(e) => setF({ ...f, requires_review: e.target.checked })}
                disabled={busy}
                className="h-4 w-4 accent-[#c9a84c]"
              />
              Requires review before completion
            </label>
          </div>

          {error && (
            <p role="alert" className={MODAL_ERROR_CLASS}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
            >
              {busy ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

// ── Review dialog ─────────────────────────────────────────────────────────────

function ReviewTaskModal({
  task,
  decision,
  onClose,
  onDone,
}: {
  task: Task;
  decision: ReviewDecision;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: reviewError } = await submitTaskReview(task.id, decision, comment);
    setBusy(false);
    if (reviewError) {
      setError(reviewError);
      return;
    }
    onDone(
      decision === "Approved"
        ? "Task approved and completed."
        : "Changes requested — back with the assignee.",
    );
  };

  return (
    <Modal open onClose={onClose} size="md" labelledBy="review-task-title" dismissible={!busy}>
      <ModalHeader
        title={decision === "Approved" ? "Approve task" : "Request changes"}
        titleId="review-task-title"
        onClose={onClose}
        closeDisabled={busy}
      />
      <ModalBody className="p-7">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-[var(--ink-body)]">
            <span className="font-semibold text-[var(--ink-strong)]">{task.title}</span>
          </p>
          <div>
            <label className={MODAL_LABEL_CLASS}>
              {decision === "Approved" ? "Comment (optional)" : "What should change?"}
            </label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={busy}
              maxLength={5000}
              className={MODAL_INPUT_CLASS}
              placeholder={
                decision === "Approved"
                  ? "Anything worth recording with the approval."
                  : "Tell the assignee what needs another pass."
              }
            />
          </div>

          {error && (
            <p role="alert" className={MODAL_ERROR_CLASS}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
            >
              {busy ? "Saving…" : decision === "Approved" ? "Approve" : "Request changes"}
            </button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TasksPanel({
  currentUser,
  matters,
  onToast,
}: {
  currentUser: AuthUser;
  /** Matters the caller may create tasks on (RLS already scoped them). */
  matters: MatterLite[];
  onToast?: (message: string, tone?: "success" | "error") => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<TaskReview[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, TaskEvent[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{
    task: Task;
    decision: ReviewDecision;
  } | null>(null);

  const refreshEvents = useCallback(async (taskId: string) => {
    const { data } = await getTaskEvents(taskId);
    if (data) setEvents((prev) => ({ ...prev, [taskId]: data }));
  }, []);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const [t, r, s] = await Promise.all([getTasks(), getTaskReviews(), getAssignableStaff()]);
    if (t.error) setErr(t.error);
    else {
      setErr(null);
      setTasks(t.data ?? []);
    }
    if (r.data) setReviews(r.data);
    if (s.data) setStaff(s.data);
    if (showSpinner) setLoading(false);
  }, []);

  // The open timeline, readable from the realtime callback without making the
  // subscription depend on it (an expand must not tear down the channel).
  const openIdRef = useRef<string | null>(null);
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opening a task loads its timeline.
  useEffect(() => {
    if (openId) void refreshEvents(openId);
  }, [openId, refreshEvents]);

  // Live board: assignment, a status move, a review decision or a timeline
  // entry lands without a refresh. RLS scopes the stream per role.
  useEffect(() => {
    return subscribeToTables(
      ["tasks", "task_reviews", "task_events"],
      () => {
        void load(false);
        if (openIdRef.current) void refreshEvents(openIdRef.current);
      },
      { channelKey: currentUser.id },
    );
  }, [currentUser.id, load, refreshEvents]);

  // ── Who may do what (mirrors the database guards) ──────────────────────────

  const myMatterIds = useMemo(() => new Set(matters.map((m) => m.id)), [matters]);

  // is_matter_lawyer_team() from the guard: the matter's lawyers (the assigned
  // lawyer or a lawyer member) or the managing partner; the task's creator
  // also manages their task.
  const isManagerOf = (t: Task) =>
    isFirmAdmin(currentUser.role) ||
    (isLawyer(currentUser.role) && myMatterIds.has(t.matter_id)) ||
    t.assigned_by === currentUser.id;

  const canReview = (t: Task) =>
    t.status === "In Review" && t.assigned_to !== currentUser.id && isManagerOf(t);

  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? "";

  const matterOf = (id: string) => matters.find((m) => m.id === id);

  const latestReview = (taskId: string): TaskReview | undefined =>
    reviews.filter((r) => r.task_id === taskId).at(-1);

  // ── Actions ────────────────────────────────────────────────────────────────

  const move = async (t: Task, next: TaskStatus) => {
    setBusyId(t.id);
    const { error } = await updateTaskStatus(t.id, next);
    setBusyId(null);
    if (error) {
      onToast?.(error, "error");
      return;
    }
    onToast?.(`Task moved to ${next}.`);
    await load(false);
  };

  const doReassign = async (t: Task, assignedTo: string) => {
    if (!assignedTo) return;
    setBusyId(t.id);
    const { error } = await reassignTask(t.id, assignedTo);
    setBusyId(null);
    if (error) {
      onToast?.(error, "error");
      return;
    }
    onToast?.(`Task reassigned to ${staffName(assignedTo) || "the new assignee"}.`);
    await load(false);
  };

  // Status buttons offered per row. The matrix lives in the guard; this only
  // renders the moves that guard allows.
  const quickActions = (t: Task): { label: string; next: TaskStatus; kind: string }[] => {
    if (t.assigned_to !== currentUser.id && !isManagerOf(t)) return [];
    const acts: { label: string; next: TaskStatus; kind: string }[] = [];
    const legal = new Set(assigneeTransitions(t.status));
    if (t.status === "Open") {
      acts.push({ label: "Start", next: "In Progress", kind: "primary" });
      acts.push({ label: "Block", next: "Blocked", kind: "ghost" });
    }
    if (t.status === "In Progress") {
      acts.push({ label: "Send for review", next: "In Review", kind: "primary" });
      if (!t.requires_review) acts.push({ label: "Complete", next: "Completed", kind: "primary" });
      acts.push({ label: "Block", next: "Blocked", kind: "ghost" });
    }
    if (t.status === "Blocked")
      acts.push({ label: "Unblock", next: "In Progress", kind: "primary" });
    if (t.status === "In Review")
      acts.push({ label: "Resume work", next: "In Progress", kind: "ghost" });
    // Managers may cancel from any non-terminal state.
    if (isManagerOf(t) && t.status !== "Completed" && t.status !== "Cancelled") {
      acts.push({ label: "Cancel", next: "Cancelled", kind: "danger" });
    }
    // Keep only moves the plain-assignee matrix allows unless this person
    // manages the task; the guard refuses the rest anyway.
    return acts.filter((a) => a.next === "Cancelled" || legal.has(a.next));
  };

  const visible = applyFilters(
    tasks,
    search,
    (t) => [t.title, t.description, matterOf(t.matter_id)?.matter_number, staffName(t.assigned_to)],
    filters,
    (t, key) =>
      key === "status"
        ? t.status
        : key === "priority"
          ? t.priority
          : key === "assignee"
            ? staffName(t.assigned_to)
            : null,
  );

  const assigneeOptions = Array.from(
    new Set(tasks.map((t) => staffName(t.assigned_to)).filter(Boolean)),
  ).sort();

  // Creation is matter-lawyer + admin work (tasks_insert_managers); the
  // matters list alone is not enough, so the role check matters too.
  const canCreate =
    matters.length > 0 && (isFirmAdmin(currentUser.role) || isLawyer(currentUser.role));

  if (loading) return <p className="text-sm text-[var(--ink-muted)]">Loading tasks…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)]">Tasks</h2>
          <p className="text-[var(--ink-muted)] text-sm mt-1">
            Work assigned to the firm&rsquo;s matters. Review-gated tasks complete only through an
            approved review.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--navy-solid)] hover:bg-[#162d52] text-white text-sm font-semibold px-5 py-2.5 rounded transition-colors"
          >
            + New Task
          </button>
        )}
      </div>

      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {err}
        </p>
      )}

      <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-5">
        <ListFilters
          search={search}
          onSearch={setSearch}
          placeholder="Search tasks…"
          filters={[
            { key: "status", label: "Status", options: [...TASK_STATUSES] },
            { key: "priority", label: "Priority", options: [...TASK_PRIORITIES] },
            { key: "assignee", label: "Assignee", options: assigneeOptions },
          ]}
          values={filters}
          onFilter={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          shown={visible.length}
          total={tasks.length}
        />
      </div>

      {tasks.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)] bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-6">
          No tasks yet.{" "}
          {canCreate
            ? "Create one to assign work on a matter."
            : "Tasks assigned to you will appear here."}
        </p>
      )}
      {tasks.length > 0 && visible.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)] bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-6">
          No tasks match that search.
        </p>
      )}

      {visible.map((t) => {
        const latest = latestReview(t.id);
        const isOpen = openId === t.id;
        return (
          <div
            key={t.id}
            className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink-strong)]">{t.title}</p>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  {matterOf(t.matter_id) ? (
                    <>
                      {matterOf(t.matter_id)!.matter_number} · {matterOf(t.matter_id)!.title} ·{" "}
                    </>
                  ) : null}
                  assigned to <Person id={t.assigned_to} />
                  {t.due_date
                    ? ` · due ${new Date(t.due_date + "T00:00").toLocaleDateString()}`
                    : ""}
                </p>
                {t.description && (
                  <p className="text-sm text-[var(--ink-body)] mt-2 whitespace-pre-wrap">
                    {t.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                  {t.requires_review && (
                    <span className={`${chip} bg-slate-100 text-slate-700`}>Review required</span>
                  )}
                  {t.status === "In Progress" && latest?.decision === "Changes Requested" && (
                    <span className={`${chip} bg-amber-50 text-amber-700`}>Changes requested</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {quickActions(t).map((a) => (
                  <button
                    key={a.label}
                    onClick={() => void move(t, a.next)}
                    disabled={busyId === t.id}
                    className={
                      a.kind === "primary"
                        ? "bg-[#c9a84c] hover:bg-[#e2c87a] text-[var(--ink-on-gold)] text-xs font-semibold px-3 py-2 rounded disabled:opacity-50"
                        : a.kind === "danger"
                          ? "border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold px-3 py-2 rounded disabled:opacity-50"
                          : "border border-[var(--line)] text-[var(--ink-strong)] hover:bg-[var(--surface-hover)] text-xs font-semibold px-3 py-2 rounded disabled:opacity-50"
                    }
                  >
                    {a.label}
                  </button>
                ))}
                {canReview(t) && (
                  <>
                    <button
                      onClick={() => setReviewTarget({ task: t, decision: "Approved" })}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setReviewTarget({ task: t, decision: "Changes Requested" })}
                      className="border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-semibold px-3 py-2 rounded"
                    >
                      Request changes
                    </button>
                  </>
                )}
                <button
                  onClick={() => setOpenId(isOpen ? null : t.id)}
                  className="text-xs font-semibold text-[#c9a84c] hover:underline px-1"
                >
                  {isOpen ? "Hide timeline" : "Timeline"}
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="mt-4 pt-4 border-t border-[var(--line)] space-y-3">
                {isManagerOf(t) && t.status !== "Completed" && t.status !== "Cancelled" && (
                  <div className="flex items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => void doReassign(t, e.target.value)}
                      disabled={busyId === t.id}
                      className={`${MODAL_INPUT_CLASS} max-w-xs`}
                    >
                      <option value="">Reassign to…</option>
                      {staff
                        .filter((s) => s.id !== t.assigned_to)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name} — {roleLabel(normalizeRole(s.role))}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="relative">
                  {(events[t.id] ?? []).length > 0 ? (
                    <>
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-[var(--fill-muted)]" />
                      <div className="space-y-4">
                        {(events[t.id] ?? []).map((ev) => (
                          <div key={ev.id} className="flex gap-4 pl-8 relative">
                            <div
                              className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                                ev.event_type === "review"
                                  ? "bg-[#c9a84c]/20 border-[#c9a84c]"
                                  : "bg-[var(--navy-solid)]/10 border-[var(--line-strong)]/40"
                              }`}
                            />
                            <div>
                              <p className="text-sm font-medium text-[var(--ink-strong)]">
                                {ev.title}
                                {ev.detail ? ` — ${ev.detail}` : ""}
                              </p>
                              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                                {ev.actor_id ? <Person id={ev.actor_id} /> : "System"} ·{" "}
                                {new Date(ev.created_at).toLocaleString("en-PH")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[var(--ink-muted)]">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {showCreate && (
        <CreateTaskModal
          matters={matters}
          staff={staff}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            onToast?.("Task created. The assignee was notified.");
            void load(false);
          }}
        />
      )}

      {reviewTarget && (
        <ReviewTaskModal
          task={reviewTarget.task}
          decision={reviewTarget.decision}
          onClose={() => setReviewTarget(null)}
          onDone={(message) => {
            setReviewTarget(null);
            onToast?.(message);
            void load(false);
          }}
        />
      )}
    </div>
  );
}
