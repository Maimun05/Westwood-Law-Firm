import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Ev = {
  id: string;
  event_type: string;
  title: string;
  detail: string | null;
  created_at: string;
  actor_id: string | null;
};
type Note = {
  id: string;
  body: string;
  visibility: "internal" | "client";
  created_at: string;
  author_id: string;
};

// One entry in the merged thread. Notes carry a body; events carry a title.
type Entry =
  | { kind: "note"; at: string; note: Note }
  | {
      kind: "event";
      at: string;
      event: Ev;
    };

// Messages and timeline for one matter.
//
// What each role can see is decided by the database, not here: clients get
// client-visible items only, the lawyer team gets everything, and admins see
// the timeline plus client-visible notes but never internal ones.
//
// Clients could previously read this thread but not write to it — the INSERT
// policy only admitted the lawyer team and admins — so the firm's only way to
// hear from a client was email. Clients can now post, and only at
// visibility = 'client'; the database enforces that, not this component.
export default function MatterTimeline({
  matterId,
  role,
  userId,
  names,
  clientId,
  /** Lawyer id -> full name. Built from the public lawyer directory. */
  /** The matter's client, so their messages can be labelled as such. */
}: {
  matterId: string;
  role: "client" | "lawyer" | "admin";
  userId: string;
  names: Record<string, string>;
  clientId?: string | null;
}) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "client">(
    role === "lawyer" ? "internal" : "client",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement | null>(null);
  const fetched = useRef<Set<string>>(new Set());

  const load = async () => {
    const [e, n] = await Promise.all([
      supabase
        .from("matter_events")
        .select("id,event_type,title,detail,created_at,actor_id")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("matter_notes")
        .select("id,body,visibility,created_at,author_id")
        .eq("matter_id", matterId)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);
    setEvents((e.data as Ev[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, [matterId]);

  // A conversation reads top to bottom, so keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [notes.length, events.length]);

  // The `names` map only holds lawyers. A client's own name is known from
  // `userId`, but staff still need to see who wrote a client message, so look
  // up any author we cannot already name. A client cannot read staff profiles
  // (profiles_select_policy), so for them this resolves to nothing and the
  // fallback label is used — which is the right outcome anyway.
  useEffect(() => {
    const unknown = Array.from(
      new Set([
        ...notes.map((n) => n.author_id),
        ...events.map((e) => e.actor_id).filter((id): id is string => !!id),
      ]),
    ).filter((id) => id !== userId && !names[id] && !fetched.current.has(id));

    if (unknown.length === 0) return;
    unknown.forEach((id) => fetched.current.add(id));

    void supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", unknown)
      .then(({ data }) => {
        if (!data?.length) return;
        setExtraNames((prev) => ({
          ...prev,
          ...Object.fromEntries(data.map((p) => [p.id, p.full_name])),
        }));
      });
  }, [notes, events, names, userId]);

  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("matter_notes").insert({
      matter_id: matterId,
      author_id: userId,
      body: body.trim(),
      // A client may only ever write a client-visible note. The database
      // rejects anything else, so do not offer the choice.
      visibility: role === "lawyer" ? visibility : "client",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setBody("");
    await load();
  };

  const who = (id: string | null) => {
    if (!id) return "System";
    if (id === userId) return "You";
    const name = names[id] ?? extraNames[id];
    // Staff seeing the client's name helps; a client seeing "The firm" for an
    // admin author is deliberate — profiles are not readable across roles.
    if (id === clientId) return name ? `${name} (client)` : "The client";
    return name ?? "The firm";
  };

  const thread: Entry[] = [
    ...notes.map((note) => ({
      kind: "note" as const,
      at: note.created_at,
      note,
    })),
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.created_at,
      event,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const placeholder =
    role === "client"
      ? "Write a message to your lawyer…"
      : role === "admin"
        ? "Add an update the client can see…"
        : "Add a note…";

  return (
    <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
      <h3 className="text-sm font-semibold text-[#0d1f3c] mb-3">Messages &amp; timeline</h3>

      <div className="max-h-80 overflow-y-auto pr-1 mb-4 space-y-3">
        {thread.length === 0 && <p className="text-xs text-[#8a9ab5]">No activity yet.</p>}

        {thread.map((entry) => {
          if (entry.kind === "event") {
            const e = entry.event;
            return (
              <div key={`e-${e.id}`} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#c9a84c] flex-shrink-0" />
                <div>
                  <p className="text-xs text-[#2c3347]">
                    <span className="font-medium">{e.title}</span>
                    {e.detail ? ` — ${e.detail}` : ""}
                  </p>
                  <p className="text-[11px] text-[#8a9ab5]">
                    {who(e.actor_id)} · {new Date(e.created_at).toLocaleString("en-PH")}
                  </p>
                </div>
              </div>
            );
          }

          const n = entry.note;
          const mine = n.author_id === userId;

          return (
            <div
              key={`n-${n.id}`}
              className={`pl-3 border-l-2 ${
                n.visibility === "internal" ? "border-[#8a9ab5]" : "border-[#c9a84c]"
              }`}
            >
              <p className="text-sm text-[#0d1f3c] whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-[#8a9ab5]">
                {who(n.author_id)}
                {" · "}
                {new Date(n.created_at).toLocaleString("en-PH")}
                {n.visibility === "internal" ? " · internal" : ""}
                {mine && n.visibility !== "internal" ? " · visible to the firm" : ""}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="space-y-2">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c]"
        />
        <div className="flex items-center gap-2">
          {role === "lawyer" && (
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "internal" | "client")}
              className="text-xs bg-[#f7f5f0] border border-[#e8e4dc] rounded px-2 py-1.5"
            >
              <option value="internal">Internal (lawyers only)</option>
              <option value="client">Visible to client</option>
            </select>
          )}
          {role === "client" && (
            <p className="text-[11px] text-[#8a9ab5]">
              Your lawyer and the firm&rsquo;s team can see this.
            </p>
          )}
          <button
            onClick={add}
            disabled={busy || !body.trim()}
            className="ml-auto bg-[#0d1f3c] text-white text-xs font-semibold px-4 py-2 rounded disabled:opacity-40"
          >
            {busy ? "Sending…" : role === "client" ? "Send message" : "Add note"}
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}
