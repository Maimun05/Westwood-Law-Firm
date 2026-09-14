import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getLawyers, type Lawyer } from "@/lib/content";
import ListFilters, { applyFilters } from "@/components/portal/ListFilters";
import type { Database } from "@/lib/database.types";

type Inquiry = {
  id: string;
  inquiry_number: string;
  name: string;
  email: string;
  practice_area: string;
  subject: string;
  message: string;
  status: string;
  preferred_lawyer: string | null;
  created_at: string;
};
type Attachment = {
  id: string;
  inquiry_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

function formatBytes(bytes: number | null): string {
  if (!bytes || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
type InquiryStatus = Database["public"]["Enums"]["inquiry_status"];
type PriorityLevel = Database["public"]["Enums"]["priority_level"];
const STATUSES: InquiryStatus[] = ["New", "Under Review", "Contacted", "Closed"];
const PRIORITIES: PriorityLevel[] = ["Low", "Medium", "High"];
const sel = "bg-[#f7f5f0] border border-[#e8e4dc] rounded px-2 py-1.5 text-xs";

// Real inquiries filed by registered clients. Admin reviews them and converts one into
// a matter (atomic in the database: creates the matter, links the client, marks it
// Converted). Signed-out visitors' inquiries are deliberately not listed here — they are
// emailed to the firm by the notify-inquiry edge function instead (client_id IS NULL).
export default function AdminIntake({ onConverted }: { onConverted?: () => void }) {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [lawyerId, setLawyerId] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>("Medium");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = async () => {
    // Only registered clients' inquiries. A signed-out visitor's inquiry has
    // client_id IS NULL and reaches the firm by email instead — it is never
    // listed here and cannot be converted (there is no client account to link).
    const { data, error } = await supabase
      .from("inquiries")
      .select("*")
      .not("client_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setMsg({ ok: false, text: error.message });
    const list = (data as Inquiry[]) ?? [];
    setRows(list);
    // Files the visitor attached to their inquiry. RLS limits this to staff,
    // and the bucket is private, so a signed URL is created per open.
    if (list.length > 0) {
      const { data: att } = await supabase
        .from("inquiry_attachments")
        .select("id, inquiry_id, storage_path, file_name, mime_type, size_bytes")
        .in(
          "inquiry_id",
          list.map((i) => i.id),
        );
      const map: Record<string, Attachment[]> = {};
      for (const a of (att as Attachment[]) ?? []) (map[a.inquiry_id] ??= []).push(a);
      setAttachments(map);
    } else {
      setAttachments({});
    }
    setLoading(false);
  };

  const openAttachment = async (a: Attachment) => {
    setOpeningId(a.id);
    const { data, error } = await supabase.storage
      .from("inquiry-attachments")
      .createSignedUrl(a.storage_path, 3600);
    setOpeningId(null);
    if (error || !data?.signedUrl) {
      setMsg({
        ok: false,
        text: error?.message ?? "Could not open that attachment.",
      });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  useEffect(() => {
    void load();
    void getLawyers().then((r) => setLawyers(r.data ?? []));
  }, []);

  const setStatus = async (id: string, status: InquiryStatus) => {
    const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
    setMsg(error ? { ok: false, text: error.message } : null);
    await load();
  };

  const convert = async (i: Inquiry) => {
    if (!lawyerId) {
      setMsg({ ok: false, text: "Choose the lawyer to assign." });
      return;
    }
    const { error } = await supabase.rpc("convert_inquiry_to_matter", {
      p_inquiry_id: i.id,
      p_lawyer_id: lawyerId,
      p_title: i.subject,
      p_priority: priority,
    });
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({
      ok: true,
      text: `Matter created for ${i.name}. The assigned lawyer and client were notified.`,
    });
    setOpen(null);
    setLawyerId("");
    await load();
    onConverted?.();
  };

  const visible = applyFilters(
    rows,
    search,
    (i) => [i.inquiry_number, i.name, i.email, i.subject, i.message, i.practice_area, i.status],
    filters,
    (i, key) => (key === "status" ? i.status : key === "area" ? i.practice_area : null),
  );

  if (loading) return <p className="text-sm text-[#8a9ab5]">Loading inquiries…</p>;
  return (
    <div className="space-y-3">
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}

      <p className="text-xs text-[#8a9ab5]">
        Only inquiries filed by registered clients appear here. Inquiries from signed-out visitors
        are emailed to the firm instead.
      </p>

      <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
        <ListFilters
          search={search}
          onSearch={setSearch}
          placeholder="Search inquiries…"
          filters={[
            {
              key: "status",
              label: "Status",
              options: Array.from(
                new Set([...STATUSES, "Converted", ...rows.map((r) => r.status)]),
              ),
            },
            {
              key: "area",
              label: "Area",
              options: Array.from(new Set(rows.map((r) => r.practice_area).filter(Boolean))).sort(),
            },
          ]}
          values={filters}
          onFilter={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          shown={visible.length}
          total={rows.length}
        />
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-[#8a9ab5] bg-white rounded-xl border border-[#e8e4dc] p-6">
          No inquiries yet. Submissions from the website appear here.
        </p>
      )}
      {rows.length > 0 && visible.length === 0 && (
        <p className="text-sm text-[#8a9ab5] bg-white rounded-xl border border-[#e8e4dc] p-6">
          No inquiries match that search.
        </p>
      )}
      {visible.map((i) => (
        <div key={i.id} className="bg-white rounded-xl border border-[#e8e4dc] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#0d1f3c]">
                {i.name} <span className="font-normal text-[#8a9ab5]">· {i.email}</span>
              </p>
              <p className="text-xs text-[#8a9ab5]">
                {i.inquiry_number} · {i.practice_area} ·{" "}
                {new Date(i.created_at).toLocaleDateString("en-PH")}
                {i.preferred_lawyer ? ` · prefers ${i.preferred_lawyer}` : ""}
              </p>
              <p className="text-sm text-[#2c3347] mt-2 font-medium">{i.subject}</p>
              <p className="text-sm text-[#2c3347] mt-1 whitespace-pre-wrap">{i.message}</p>
              {(attachments[i.id]?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {attachments[i.id].map((a) => (
                    <button
                      key={a.id}
                      onClick={() => void openAttachment(a)}
                      disabled={openingId === a.id}
                      className="flex items-center gap-2 bg-[#f7f5f0] hover:bg-[#e8e4dc] border border-[#e8e4dc] rounded-lg px-3 py-1.5 text-xs text-[#0d1f3c] transition-colors disabled:opacity-50"
                      title={a.storage_path}
                    >
                      <svg
                        className="w-3.5 h-3.5 text-[#c9a84c] flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="max-w-[180px] truncate">{a.file_name}</span>
                      {a.size_bytes ? (
                        <span className="text-[#8a9ab5]">{formatBytes(a.size_bytes)}</span>
                      ) : null}
                      {openingId === a.id && <span className="text-[#8a9ab5]">…</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {i.status === "Converted" ? (
                <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded">
                  Converted
                </span>
              ) : (
                <>
                  <select
                    className={sel}
                    value={i.status}
                    onChange={(e) => void setStatus(i.id, e.target.value as InquiryStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setOpen(open === i.id ? null : i.id)}
                    className="bg-[#0d1f3c] text-white text-xs font-semibold px-3 py-2 rounded"
                  >
                    Convert to matter
                  </button>
                </>
              )}
            </div>
          </div>
          {open === i.id && (
            <div className="mt-4 pt-4 border-t border-[#e8e4dc] flex flex-wrap items-center gap-2">
              <select
                className={sel}
                value={lawyerId}
                onChange={(e) => setLawyerId(e.target.value)}
              >
                <option value="">Assign lawyer…</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
              <select
                className={sel}
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <button
                onClick={() => void convert(i)}
                className="bg-[#c9a84c] text-[#0d1f3c] text-xs font-semibold px-4 py-2 rounded"
              >
                Create matter
              </button>
              <span className="text-xs text-[#8a9ab5]">
                The client must already have an account with this email.
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
