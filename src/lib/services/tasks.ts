// ============================================================================
// Tasks + reviews service (migration 20261024)
// ============================================================================
// Thin wrappers over tasks / task_reviews / task_events. RLS decides which
// rows each role sees, and the BEFORE-trigger guards
// (private.guard_task_write, private.guard_task_review) enforce the
// transition matrix, the four-eyes review rule and the review-gated
// completion. This layer only shapes queries and turns guard messages into
// something worth showing in a toast.
// ============================================================================

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskReview = Database["public"]["Tables"]["task_reviews"]["Row"];
export type TaskEvent = Database["public"]["Tables"]["task_events"]["Row"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type ReviewDecision = Database["public"]["Enums"]["review_decision"];
export type TaskPriority = Database["public"]["Enums"]["priority_level"];

export const TASK_STATUSES: TaskStatus[] = [
  "Open",
  "In Progress",
  "Blocked",
  "In Review",
  "Completed",
  "Cancelled",
];

export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

/** Allowed next statuses for the plain assignee, mirroring guard_task_write().
 *  Managers get the same set plus Cancel; the guard is the real boundary. */
export function assigneeTransitions(status: TaskStatus): TaskStatus[] {
  switch (status) {
    case "Open":
      return ["In Progress", "Blocked", "In Review"];
    case "In Progress":
      return ["Open", "In Review", "Blocked"];
    case "Blocked":
      return ["In Progress", "Open"];
    case "In Review":
      return ["In Progress"];
    default:
      return [];
  }
}

/**
 * supabase-js surfaces PostgREST/trigger errors verbatim. The trigger messages
 * ("Only a matter lawyer or the managing partner can …") are already written
 * for people; only the RLS wording needs translating.
 */
function friendlyMessage(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/row-level security|permission denied/i.test(message)) {
    return "You don't have permission to do that.";
  }
  // The frontend ships before the migration is pasted; until then the tables
  // do not exist and PostgREST says so.
  if (/does not exist|schema cache/i.test(message)) {
    return "Tasks are not available yet — the database update is still being applied.";
  }
  return message;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Every task this user may see — assignee, creator, matter team or MP (RLS). */
export async function getTasks() {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { data: (data as Task[]) ?? [], error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not load tasks.") };
  }
}

/** Review history for every task this user may see (RLS mirrors tasks). */
export async function getTaskReviews() {
  try {
    const { data, error } = await supabase
      .from("task_reviews")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    return { data: (data as TaskReview[]) ?? [], error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not load reviews.") };
  }
}

/** One task's timeline, oldest first. */
export async function getTaskEvents(taskId: string) {
  try {
    const { data, error } = await supabase
      .from("task_events")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return { data: (data as TaskEvent[]) ?? [], error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not load the timeline.") };
  }
}

/** Active, non-client accounts — the people a task can be assigned to. */
export async function getAssignableStaff() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, position, is_active, deleted_at")
      .order("full_name", { ascending: true });
    if (error) throw error;
    // The database guard accepts any ACTIVE non-client profile (a legacy
    // 'admin' row included); the panel normalizes the label it shows.
    const staff = (data ?? []).filter(
      (p) => p.role !== "client" && p.role !== null && p.is_active !== false && !p.deleted_at,
    );
    return { data: staff, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not load the staff list.") };
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a task. The guard stamps assigned_by as the caller and validates the
 * assignee (active staff, never a client); RLS admits only matter lawyers on
 * their matters and the managing partner on any matter.
 */
export async function createTask(input: {
  matter_id: string;
  title: string;
  description?: string | null;
  assigned_to: string;
  priority: TaskPriority;
  due_date?: string | null;
  requires_review: boolean;
}) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        matter_id: input.matter_id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        assigned_to: input.assigned_to,
        priority: input.priority,
        due_date: input.due_date || null,
        requires_review: input.requires_review,
      })
      .select()
      .single();
    if (error) throw error;
    return { data: data as Task, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not create the task.") };
  }
}

/** Move a task's status. The guard decides whether this move is allowed. */
export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId)
      .select()
      .single();
    if (error) throw error;
    return { data: data as Task, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not move the task.") };
  }
}

/** Reassign (managers only — guard-enforced). */
export async function reassignTask(taskId: string, assignedTo: string) {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .update({ assigned_to: assignedTo })
      .eq("id", taskId)
      .select()
      .single();
    if (error) throw error;
    return { data: data as Task, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not reassign the task.") };
  }
}

/**
 * Record a review decision. reviewer_id is stamped by the guard; four-eyes
 * (the assignee can never review) and the In Review requirement are enforced
 * there too. The database applies the decision to the task status.
 */
export async function submitTaskReview(taskId: string, decision: ReviewDecision, comment?: string) {
  try {
    const { data, error } = await supabase
      .from("task_reviews")
      .insert({
        task_id: taskId,
        reviewer_id: crypto.randomUUID(), // replaced by the guard with auth.uid()
        decision,
        comment: comment?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return { data: data as TaskReview, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyMessage(error?.message, "Could not record the review.") };
  }
}
