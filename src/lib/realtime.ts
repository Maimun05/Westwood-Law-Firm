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
  | "notifications"
  // Published by 20261020 so every portal surface stays live: matters,
  // documents, activity, team, profiles (names/pictures), audit logs, the
  // content tables and the seminar send log.
  | "matters"
  | "documents"
  | "matter_events"
  | "matter_members"
  | "profiles"
  | "audit_logs"
  | "practice_areas"
  | "specialists"
  | "corporate_clients"
  | "articles"
  | "faqs"
  | "seminar_events"
  | "retainer_packages"
  | "seminar_email_log"
  | "inquiry_attachments"
  // Published by 20261021 so the public Law Library stays live.
  | "court_decisions";

type PostgresChangeParams = {
  event: "*";
  schema: "public";
  table: RealtimeTable;
  filter?: string;
};

const paramsFor = (table: RealtimeTable, filter?: string): PostgresChangeParams => {
  const params: PostgresChangeParams = { event: "*", schema: "public", table };
  if (filter) params.filter = filter;
  return params;
};

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
  const params = paramsFor(table, options?.filter);

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

/**
 * One channel, many tables, one callback — for screens that load several
 * tables at once (a dashboard, a detail panel) and answer every event the
 * same way: refetch.
 *
 * Events are coalesced over a short window so a single user action that writes
 * several rows (a matter plus its event, team row and notification) triggers
 * one refetch instead of one per row. The callback always runs after the
 * window, so the last event of a burst can never be swallowed.
 *
 * `filter` is applied to every table in the batch, so only use it when the
 * column exists on all of them (e.g. `matter_id` on documents, matter_events
 * and matter_members). RLS is the security boundary either way.
 */
export function subscribeToTables(
  tables: RealtimeTable[],
  onChange: () => void,
  options?: {
    /** PostgREST-style filter shared by every table in the batch. */
    filter?: string;
    /** Stable part of the channel name; defaults to "all". */
    channelKey?: string;
  },
): () => void {
  const channel = supabase.channel(
    `rt:${tables.join("+")}:${options?.channelKey ?? "all"}:${Math.random()
      .toString(36)
      .slice(2, 10)}`,
  );

  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 150);
  };

  for (const table of tables) {
    channel.on("postgres_changes", paramsFor(table, options?.filter), fire);
  }
  channel.subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
