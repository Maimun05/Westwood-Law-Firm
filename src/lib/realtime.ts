// ============================================================================
// Realtime subscriptions
// ============================================================================
// One helper for every `postgres_changes` subscription in the portal.
//
// Supabase Realtime applies each table's SELECT policies to the stream, so a
// subscriber only ever receives rows their RLS already allows — there is no
// public channel and no broadcast to leak a conversation. The optional filter
// narrows the stream further (e.g. one inquiry's messages); it is an
// optimisation, never the security boundary.
//
// Callers refetch on any event. That keeps initial load and live updates on a
// single code path, so an event can never append a duplicate of a row the
// list already holds — the merge rule lives in the query, not here.
//
// The channel name is randomised per subscription: a remount can race the
// previous channel's teardown, and Supabase throws if a name is reused while
// it is still being removed.

import { supabase } from "@/lib/supabase";

export type RealtimeTable =
  | "inquiries"
  | "inquiry_messages"
  | "appointments"
  | "matter_notes"
  | "notifications";

/**
 * Subscribe to INSERT/UPDATE/DELETE on one table. Returns an unsubscribe
 * function; always call it from the effect cleanup.
 *
 * If Realtime is not enabled for the table the callback is simply never
 * called — every screen using this also loads once on mount, so it still
 * works, it just is not live until the table is published.
 */
export function subscribeToTable(
  table: RealtimeTable,
  onChange: () => void,
  options?: {
    /** PostgREST-style filter, e.g. `inquiry_id=eq.<uuid>`. */
    filter?: string;
    /** Stable part of the channel name; defaults to "all". */
    channelKey?: string;
  },
): () => void {
  const params: {
    event: "*";
    schema: "public";
    table: RealtimeTable;
    filter?: string;
  } = { event: "*", schema: "public", table };
  if (options?.filter) params.filter = options.filter;

  const channel = supabase
    .channel(
      `rt:${table}:${options?.channelKey ?? "all"}:${Math.random().toString(36).slice(2, 10)}`,
    )
    .on("postgres_changes", params, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
