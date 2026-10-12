import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { subscribeToTable } from "@/lib/realtime";
import {
  LAWYER_INQUIRY_STATUSES,
  getLawyerInquiries,
  type LawyerInquiry,
} from "@/lib/services/portalData";
import InquiryThread from "./InquiryThread";

// Same palette as the portal's status badges (ClientPortal statusColors).
const STATUS_TONE: Record<string, string> = {
  New: "bg-blue-50 text-blue-700",
  "Under Review": "bg-blue-50 text-blue-700",
  Contacted: "bg-purple-50 text-purple-700",
  Converted: "bg-teal-50 text-teal-700",
  Closed: "bg-gray-100 text-gray-500",
};

function StatusBadge({ text }: { text: string }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded ${STATUS_TONE[text] ?? "bg-gray-100 text-gray-600"}`}
    >
      {text}
    </span>
  );
}

// The lawyer's side of the inquiry flow: the inquiries assigned to them.
//
// RLS decides the list (an inquiry is readable only by its client, its
// assigned lawyer and admins), and the guard trigger decides what a lawyer
// may change — status only, from the three statuses a lawyer owns. The list
// is live: an inquiry assigned by the front desk appears without a refresh.
export default function InquiryInbox({
  userId,
  onToast,
}: {
  userId: string;
  onToast?: (message: string, tone?: "success" | "error") => void;
}) {
  const [rows, setRows] = useState<LawyerInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await getLawyerInquiries(userId);
    if (error) setErr(error);
    else {
      setErr(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
    // The filter matches the SELECT policy; Realtime additionally applies the
    // policy itself, so another lawyer's assignments never reach this stream.
    return subscribeToTable("inquiries", () => void load(), {
      filter: `assigned_to=eq.${userId}`,
      channelKey: userId,
    });
  }, [userId, load]);

  const setStatus = async (id: string, status: LawyerInquiry["status"]) => {
    setBusyId(id);
    const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      setErr(error.message);
      return;
    }
    onToast?.(`Inquiry marked ${status}.`);
    await load();
  };

  if (loading) return <p className="text-sm text-[#8a9ab5]">Loading inquiries…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Inquiries</h2>
        <p className="text-[#8a9ab5] text-sm mt-1">
          Inquiries the firm has assigned to you. Reply here and the client sees it in their portal
          immediately.
        </p>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {rows.length === 0 && !err && (
        <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center">
          <p className="text-[#8a9ab5] text-sm">
            No inquiries assigned to you yet. New assignments appear here automatically.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((q) => {
            const open = openId === q.id;
            const statuses = Array.from(new Set([q.status, ...LAWYER_INQUIRY_STATUSES]));
            return (
              <div key={q.id} className="bg-white rounded-xl border border-[#e8e4dc] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-[#0d1f3c]">
                        {q.inquiry_number}
                      </span>
                      <StatusBadge text={q.status} />
                    </div>
                    <p className="text-sm font-semibold text-[#0d1f3c] mt-2">
                      {q.name} <span className="font-normal text-[#8a9ab5]">· {q.email}</span>
                    </p>
                    <p className="text-xs text-[#8a9ab5] mt-0.5">
                      {q.practice_area || "General"} ·{" "}
                      {new Date(q.created_at).toLocaleDateString("en-PH", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-sm text-[#2c3347] mt-2 font-medium">
                      {q.subject || "Legal inquiry"}
                    </p>
                    <p className="text-sm text-[#2c3347] mt-1 whitespace-pre-wrap">{q.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-[#f7f5f0] border border-[#e8e4dc] rounded px-2 py-1.5 text-xs"
                      value={q.status}
                      disabled={busyId === q.id}
                      onChange={(e) =>
                        void setStatus(q.id, e.target.value as LawyerInquiry["status"])
                      }
                    >
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setOpenId(open ? null : q.id)}
                      className="bg-[#0d1f3c] text-white text-xs font-semibold px-3 py-2 rounded"
                    >
                      {open ? "Hide messages" : "Open conversation"}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4">
                    <InquiryThread
                      inquiryId={q.id}
                      userId={userId}
                      role="lawyer"
                      counterpartLabel={q.name}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
