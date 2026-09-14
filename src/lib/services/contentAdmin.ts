// ============================================================================
// Admin content management — database I/O
// ============================================================================
// The schema knowledge (which columns exist, which are required, how a form
// draft maps onto a row) lives in src/lib/contentSchema.ts, which has no
// Supabase import so it can be unit-tested and reasoned about on its own.
// This file only talks to the database.
// ============================================================================

import { supabase } from "@/lib/supabase";
import {
  CONTENT_CONFIG,
  type ContentKind,
  type ContentRow,
  type ContentInsert,
  type ContentUpdate,
} from "@/lib/contentSchema";

export * from "@/lib/contentSchema";

// The five tables do not share a row type, so a generic helper cannot satisfy
// PostgREST's per-table overloads. The cast is confined to these four
// functions; callers still get a fully typed Insert/Update payload through
// ContentInsert/ContentUpdate above, which is where mistakes actually happen.
/* eslint-disable @typescript-eslint/no-explicit-any */
const client = supabase as any;

export async function listContent<K extends ContentKind>(
  kind: K,
): Promise<{ data: ContentRow<K>[] | null; error: string | null }> {
  const cfg = CONTENT_CONFIG[kind];
  try {
    const { data, error } = await client
      .from(kind)
      .select("*")
      .order(cfg.orderBy, { ascending: !cfg.descending, nullsFirst: false });

    if (error) throw error;
    return { data: (data ?? []) as ContentRow<K>[], error: null };
  } catch (error: any) {
    return { data: null, error: error.message as string };
  }
}

export async function createContent<K extends ContentKind>(
  kind: K,
  values: ContentInsert<K>,
): Promise<{ data: ContentRow<K> | null; error: string | null }> {
  try {
    const { data, error } = await client.from(kind).insert(values).select("*").single();
    if (error) throw error;
    return { data: data as ContentRow<K>, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyError(error) };
  }
}

export async function updateContent<K extends ContentKind>(
  kind: K,
  id: string,
  values: ContentUpdate<K>,
): Promise<{ data: ContentRow<K> | null; error: string | null }> {
  try {
    const { data, error } = await client
      .from(kind)
      .update(values)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return { data: data as ContentRow<K>, error: null };
  } catch (error: any) {
    return { data: null, error: friendlyError(error) };
  }
}

export async function deleteContent(
  kind: ContentKind,
  id: string,
): Promise<{ error: string | null }> {
  try {
    // .select() is not decoration. A DELETE that RLS refuses does not raise —
    // the policy simply hides the row, nothing matches, and the call succeeds.
    // Without reading the deleted rows back, the UI would say "Deleted." while
    // the row was still there.
    const { data, error } = await client.from(kind).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return {
        error: "Nothing was deleted. The row may already be gone, or you may not have permission.",
      };
    }
    return { error: null };
  } catch (error: any) {
    return { error: friendlyError(error) };
  }
}

/** Toggle the row's published/active flag without touching anything else. */
export async function setContentPublished(
  kind: ContentKind,
  id: string,
  published: boolean,
): Promise<{ error: string | null }> {
  const cfg = CONTENT_CONFIG[kind];
  const patch = { [cfg.publishedColumn]: published };
  // Articles also carry published_at, which the public list sorts on. Stamp it
  // the first time an article is published so it does not sort to the bottom.
  if (kind === "articles" && published) {
    (patch as any).published_at = new Date().toISOString();
  }
  return updateContent(kind, id, patch as any).then((r) => ({ error: r.error }));
}

/**
 * Turn Postgres errors into something an admin can act on.
 * A bare "duplicate key value violates unique constraint" is not useful.
 */
function friendlyError(error: any): string {
  const message: string = error?.message ?? "Unknown error";
  // .single() reports "0 rows" both when the record is gone and when RLS hid
  // it from the update. Either way the admin needs to know nothing changed.
  if (error?.code === "PGRST116" || /0 rows|no rows|multiple \(or no\) rows/i.test(message)) {
    return "Nothing was changed. The record may have been deleted, or you may not have permission.";
  }
  if (error?.code === "23505" || /duplicate key/i.test(message)) {
    return "Something with that id or slug already exists. Choose a different one.";
  }
  if (error?.code === "23503" || /foreign key/i.test(message)) {
    return "That references a record that does not exist.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "You do not have permission to change this. Admin access is required.";
  }
  return message;
}
