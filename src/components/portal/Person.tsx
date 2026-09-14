import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Shows a person's name instead of a raw UUID. Lookups are batched and cached.
const cache = new Map<string, string>();
const waiting = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

async function flush() {
  const ids = [...waiting];
  waiting.clear();
  timer = null;
  if (!ids.length) return;
  // Lawyers are readable by everyone via the public directory view; other people
  // only where the signed-in user's role allows it (staff can read profiles).
  const [pub, prof] = await Promise.all([
    supabase.from("public_lawyers").select("id, full_name").in("id", ids),
    supabase.from("profiles").select("id, full_name").in("id", ids),
  ]);
  for (const r of [...(pub.data ?? []), ...(prof.data ?? [])] as {
    id: string;
    full_name: string;
  }[])
    cache.set(r.id, r.full_name);
  for (const id of ids) if (!cache.has(id)) cache.set(id, "—");
  listeners.forEach((l) => l());
}

function request(id: string) {
  if (cache.has(id) || waiting.has(id)) return;
  waiting.add(id);
  if (!timer) timer = setTimeout(() => void flush(), 15);
}

export function Person({ id }: { id: string | null | undefined }) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!id) return <>Unassigned</>;
  request(id);
  return <>{cache.get(id) ?? "…"}</>;
}

export async function lookupNames(ids: string[]): Promise<Record<string, string>> {
  const missing = [...new Set(ids)].filter((i) => !cache.has(i));
  if (missing.length) {
    missing.forEach((i) => waiting.add(i));
    await flush();
  }
  return Object.fromEntries(ids.map((i) => [i, cache.get(i) ?? "—"]));
}
