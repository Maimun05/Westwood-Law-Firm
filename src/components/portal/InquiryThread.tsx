import { useCallback, useEffect, useRef, useState } from "react";
import { MODAL_INPUT_CLASS } from "@/components/ui/Modal";
import { subscribeToTable } from "@/lib/realtime";
import { notifyEvent } from "@/utils/api";
import { isFirmAdmin, type UserRole } from "@/lib/roles";
import {
  getInquiryMessages,
  markInquiryMessagesRead,
  sendInquiryMessage,
  type InquiryMessage,
} from "@/lib/services/portalData";

// The client <-> assigned-lawyer conversation for one inquiry.
//
// What each side can see is decided by the database: reads go through
// inquiry_messages_thread, the decrypting SECURITY INVOKER view over the
// encrypted table (20261018), whose RLS admits only the two participants and
// admins. Writes are append-only and the INSERT policy refuses any author but
// the caller, so a forged sender is impossible.
//
// Live updates arrive over Realtime filtered to this inquiry. Supabase applies
// the table's SELECT policy to the stream, so an unrelated user cannot receive
// these rows. Every event simply triggers a refetch — initial load and live
// updates share one path, which is what makes duplicated messages impossible.
export default function InquiryThread({
  inquiryId,
  userId,
  role,
  counterpartLabel,
}: {
  inquiryId: string;
  userId: string;
  role: UserRole;
  /** Shown in the header, e.g. the client's name for a lawyer. */
  counterpartLabel?: string;
}) {
  const [messages, setMessages] = useState<InquiryMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getInquiryMessages(inquiryId);
    if (error) setErr(error);
    else {
      setErr(null);
      setMessages(data ?? []);
    }
    setLoading(false);
  }, [inquiryId]);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeToTable("inquiry_messages", () => void load(), {
      filter: `inquiry_id=eq.${inquiryId}`,
      channelKey: inquiryId,
    });
  }, [inquiryId, load]);

  // Read receipts: stamp the other side's messages once they are on screen.
  // Only participants may call the RPC (the managing partner can read for
  // oversight but is not a participant), it never stamps a message the caller
  // wrote, and it is a no-op when nothing is unread — so this cannot loop.
  const hasUnreadIncoming = messages.some((m) => m.author_id !== userId && !m.read_at);
  useEffect(() => {
    if (loading || isFirmAdmin(role) || !hasUnreadIncoming) return;
    void markInquiryMessagesRead(inquiryId).then(({ error }) => {
      if (!error) void load();
    });
  }, [hasUnreadIncoming, inquiryId, loading, role, load]);

  // A conversation reads top to bottom, so keep the newest message in view.
  // Scroll this container rather than calling scrollIntoView, which would
  // also scroll the page around it.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, loading]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    const { id, error } = await sendInquiryMessage(inquiryId, userId, text);
    setSending(false);
    if (error) {
      // Keep the typed text so a failure never costs the message.
      setErr(error);
      return;
    }
    setBody("");
    await load();
    // Fire and forget: email the other participant. The function resolves the
    // recipient from the inquiry and never puts message content in the email.
    if (id) void notifyEvent("inquiry_message", id);
  };

  const who = (id: string) => {
    if (id === userId) return "You";
    if (role === "client") return "The firm";
    return counterpartLabel || "Client";
  };

  const placeholder = isFirmAdmin(role)
    ? ""
    : role === "client"
      ? "Write a message about this inquiry…"
      : "Reply to the client…";

  return (
    <div className="bg-[#f7f5f0] rounded-xl border border-[#e8e4dc] p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h4 className="text-xs font-semibold text-[#0d1f3c] uppercase tracking-wide">
          Conversation
        </h4>
        {counterpartLabel && (
          <p className="text-xs text-[#8a9ab5] truncate">with {counterpartLabel}</p>
        )}
      </div>

      <div ref={listRef} className="max-h-72 overflow-y-auto pr-1 mb-3 space-y-3">
        {loading && messages.length === 0 && (
          <p className="text-xs text-[#8a9ab5]">Loading conversation…</p>
        )}
        {!loading && messages.length === 0 && !err && (
          <p className="text-xs text-[#8a9ab5]">
            No messages yet. {role === "client" ? "Ask a question about this inquiry." : ""}
          </p>
        )}

        {messages.map((m) => {
          const mine = m.author_id === userId;
          return (
            <div
              key={m.id}
              className={`pl-3 border-l-2 ${mine ? "border-[#c9a84c]" : "border-[#0d1f3c]"}`}
            >
              <p className="text-sm text-[#0d1f3c] whitespace-pre-wrap">{m.body}</p>
              <p className="text-xs text-[#8a9ab5]">
                {who(m.author_id)}
                {" · "}
                {new Date(m.created_at).toLocaleString("en-PH")}
                {/* Read status matters on the sender's own messages. */}
                {mine ? (m.read_at ? " · Seen" : " · Sent") : ""}
              </p>
            </div>
          );
        })}
      </div>

      {isFirmAdmin(role) ? (
        <p className="text-[11px] text-[#8a9ab5]">
          Admins can review this conversation but not post to it.
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            className={`${MODAL_INPUT_CLASS} resize-none`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
          />
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-[#8a9ab5]">
              Encrypted at rest. Only you and the {role === "client" ? "firm" : "client"} can read
              this.
            </p>
            <button
              onClick={() => void send()}
              disabled={sending || !body.trim()}
              className="ml-auto bg-[#0d1f3c] text-white text-xs font-semibold px-4 py-2 rounded disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}
