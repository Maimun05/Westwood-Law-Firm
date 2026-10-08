import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MODAL_INPUT_CLASS } from "@/components/ui/Modal";

type Note = {
  id: string;
  body: string;
  visibility: "internal" | "client";
  created_at: string;
  author_id: string;
};

// Messages for one matter.
//
// The matter's own history (opened, status changed, lawyer assigned) is the
// Activity Timeline panel in MatterDetail, not this one — so this is the
// conversation only. The old version merged in matter_events too, which put an
// "Update from your lawyer" marker directly under the very note it described.
//
// What each role can see is decided by the database, not here: clients get
// client-visible notes only, the lawyer team gets everything, and admins see
// client-visible notes but never internal ones.
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
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "client">(
    role === "lawyer" ? "internal" : "client",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const fetched = useRef<Set<string>>(new Set());

  const load = async () => {
    const { data } = await supabase
      // Read through the decrypting view (20261015). The base table stores
      // body as ciphertext; the view applies the same matter_notes RLS, so
      // what each role can see is still decided by the database.
      .from("matter_notes_thread")
      .select("id,body,visibility,created_at,author_id")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: true })
      .limit(100);
    setNotes((data as Note[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, [matterId]);

  // A conversation reads top to bottom, so keep the newest message in view.
  // Scroll the thread's own container rather than calling scrollIntoView,
  // which would also scroll the dialog around it on first paint.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [notes.length]);

  // The `names` map only holds lawyers. A client's own name is known from
  // `userId`, but staff still need to see who wrote a client message, so look
  // up any author we cannot already name. A client cannot read staff profiles
  // (profiles_select_policy), so for them this resolves to nothing and the
  // fallback label is used — which is the right outcome anyway.
  useEffect(() => {
    const unknown = Array.from(new Set(notes.map((n) => n.author_id))).filter(
      (id) => id !== userId && !names[id] && !fetched.current.has(id),
    );

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
  }, [notes, names, userId]);

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

  const placeholder =
    role === "client"
      ? "Write a message to your lawyer…"
      : role === "admin"
        ? "Add an update the client can see…"
        : "Add a note…";

  return (
    <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
      <h3 className="text-sm font-semibold text-[#0d1f3c] mb-3">Messages</h3>

      <div ref={listRef} className="max-h-80 overflow-y-auto pr-1 mb-4 space-y-3">
        {notes.length === 0 && <p className="text-xs text-[#8a9ab5]">No messages yet.</p>}

        {notes.map((n) => {
          const mine = n.author_id === userId;

          return (
            <div
              key={n.id}
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
      </div>

      <div className="space-y-2">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          className={`${MODAL_INPUT_CLASS} resize-none`}
        />
        <div className="flex items-center gap-2">
          {role === "lawyer" && (
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "internal" | "client")}
              className="text-xs bg-white border border-[#e8e4dc] rounded-lg px-2 py-1.5 text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
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
