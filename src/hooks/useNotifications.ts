import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteNotification,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type NotificationChange,
  type NotificationRow,
} from "@/lib/services/notifications";

const POLL_MS = 60_000;

export function useNotifications(userId: string | undefined) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await getMyNotifications();
    if (err) setError(err);
    else {
      setError(null);
      setItems(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void refresh();

    const apply = (change: NotificationChange) => {
      setItems((prev) => {
        if (change.kind === "delete") return prev.filter((n) => n.id !== change.id);
        const without = prev.filter((n) => n.id !== change.row.id);
        return [change.row, ...without].sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
    };

    const unsubscribe = subscribeToNotifications(userId, apply);
    // Fallback for projects where Realtime isn't enabled on the table.
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refresh]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  // Optimistic updates; roll back by re-fetching if the server rejects them.
  const markRead = useCallback(
    async (id: string) => {
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n,
        ),
      );
      const { error: err } = await markNotificationRead(id);
      if (err) void refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setItems((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true, read_at: new Date().toISOString() })),
    );
    const { error: err } = await markAllNotificationsRead(userId);
    if (err) void refresh();
  }, [userId, refresh]);

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((n) => n.id !== id));
      const { error: err } = await deleteNotification(id);
      if (err) void refresh();
    },
    [refresh],
  );

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    remove,
  };
}
