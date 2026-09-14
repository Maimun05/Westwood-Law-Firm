// ============================================================================
// Notifications Service
// ============================================================================
// Notifications are created server-side by database triggers (new document,
// matter status change / assignment, appointment created / updated). The
// browser can only read its own notifications, mark them read, or delete them.
// ============================================================================

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export async function getMyNotifications(limit = 50) {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return {
      data: (data ?? []) as NotificationRow[],
      error: null as string | null,
    };
  } catch (error: any) {
    return {
      data: [] as NotificationRow[],
      error: (error?.message as string) || "Failed to load notifications",
    };
  }
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("read", false);
  return { error: error?.message ?? null };
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export type NotificationChange =
  | {
      kind: "insert" | "update";
      row: NotificationRow;
    }
  | { kind: "delete"; id: string };

/**
 * Live updates via Supabase Realtime. Returns an unsubscribe function.
 * If Realtime is not enabled for the table the callback is simply never called;
 * useNotifications also polls, so the UI still stays fresh.
 */
export function subscribeToNotifications(
  userId: string,
  onChange: (change: NotificationChange) => void,
) {
  const channel = supabase
    .channel(`notifications:${userId}:${Math.random().toString(36).slice(2, 10)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string } | null)?.id;
          if (id) onChange({ kind: "delete", id });
        } else if (payload.new) {
          onChange({
            kind: payload.eventType === "INSERT" ? "insert" : "update",
            row: payload.new as NotificationRow,
          });
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
