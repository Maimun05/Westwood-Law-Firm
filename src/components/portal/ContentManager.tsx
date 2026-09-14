import { useEffect, useMemo, useState } from "react";
import {
  CONTENT_CONFIG,
  listContent,
  createContent,
  updateContent,
  deleteContent,
  setContentPublished,
  validateDraft,
  draftToPayload,
  type ContentKind,
} from "@/lib/services/contentAdmin";

// Admin CRUD over the five tables that drive the public site.
//
// Deliberately plain forms, no rich-text editor: the public article page
// renders `content` as plain text split on blank lines, so a WYSIWYG would
// write markup that never renders.
//
// What an admin may do is enforced by RLS (the *_admin_all policies), not by
// hiding buttons here.

type Row = Record<string, unknown>;

const KINDS: ContentKind[] = [
  "articles",
  "faqs",
  "seminar_events",
  "retainer_packages",
  "practice_areas",
];

// Which input to render for a given column. Anything unlisted is a text field.
const TEXTAREA_FIELDS = new Set(["content", "description", "answer", "excerpt", "tagline"]);
const LIST_FIELDS = new Set(["features", "services", "client_needs"]);
const NUMBER_FIELDS = new Set(["display_order", "capacity"]);
const CHECKBOX_FIELDS = new Set(["is_published", "is_active", "is_highlighted"]);
const DATE_FIELDS = new Set(["date"]);

const fieldLabel = (name: string) =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const emptyDraft = (kind: ContentKind): Row => {
  const draft: Row = {};
  for (const f of CONTENT_CONFIG[kind].fields) {
    if (CHECKBOX_FIELDS.has(f)) draft[f] = f === "is_published" || f === "is_active";
    else if (NUMBER_FIELDS.has(f)) draft[f] = 0;
    else if (LIST_FIELDS.has(f)) draft[f] = [];
    else draft[f] = "";
  }
  return draft;
};

// Arrays round-trip through a textarea as one item per line.
const toDraft = (kind: ContentKind, row: Row): Row => {
  const draft: Row = {};
  for (const f of CONTENT_CONFIG[kind].fields) {
    const v = row[f];
    if (LIST_FIELDS.has(f)) draft[f] = Array.isArray(v) ? v.join("\n") : "";
    else if (v === null || v === undefined)
      draft[f] = CHECKBOX_FIELDS.has(f) ? false : NUMBER_FIELDS.has(f) ? 0 : "";
    else draft[f] = v;
  }
  return draft;
};

export default function ContentManager({
  onToast,
}: {
  onToast?: (message: string, tone?: "success" | "error") => void;
}) {
  const [kind, setKind] = useState<ContentKind>("articles");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const cfg = CONTENT_CONFIG[kind];

  const load = async (k: ContentKind) => {
    setLoading(true);
    const { data, error } = await listContent(k);
    setLoading(false);
    if (error) {
      onToast?.(error, "error");
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
  };

  useEffect(() => {
    void load(kind);
  }, [kind]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r[cfg.titleField], r.category, r.slug, r.id].some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      ),
    );
  }, [rows, search, cfg.titleField]);

  const togglePublished = async (row: Row) => {
    const next = !row[cfg.publishedColumn];
    const { error } = await setContentPublished(kind, String(row.id), next);
    if (error) {
      onToast?.(error, "error");
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, [cfg.publishedColumn]: next } : r)),
    );
    onToast?.(next ? "Published." : "Unpublished.");
  };

  const save = async (draft: Row) => {
    setBusy(true);
    const payload = draftToPayload(kind, draft);
    const isNew = editing?.row === null;
    const result = isNew
      ? await createContent(kind, payload as never)
      : await updateContent(kind, String(editing!.row!.id), payload as never);
    setBusy(false);

    if (result.error) {
      onToast?.(result.error, "error");
      return;
    }
    setEditing(null);
    onToast?.(isNew ? "Created." : "Saved.");
    await load(kind);
  };

  const remove = async (row: Row) => {
    setBusy(true);
    const { error } = await deleteContent(kind, String(row.id));
    setBusy(false);
    setConfirmDelete(null);
    if (error) {
      onToast?.(error, "error");
      return;
    }
    onToast?.("Deleted.");
    await load(kind);
  };

  const inputCls =
    "w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setSearch("");
            }}
            className={`text-xs font-semibold px-3.5 py-2 rounded transition-colors ${
              k === kind
                ? "bg-[#0d1f3c] text-white"
                : "bg-white text-[#2c3347] border border-[#e8e4dc] hover:bg-[#f7f5f0]"
            }`}
          >
            {CONTENT_CONFIG[k].label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${cfg.label.toLowerCase()}…`}
            className={`${inputCls} max-w-xs`}
          />
          <span className="text-xs text-[#8a9ab5]">
            {visible.length} of {rows.length}
          </span>
          <button
            onClick={() => setEditing({ row: null })}
            className="ml-auto bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-xs font-semibold px-4 py-2.5 rounded transition-colors"
          >
            + New {cfg.label.replace(/s$/, "")}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[#8a9ab5] py-6 text-center">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[#8a9ab5] py-6 text-center">
            {rows.length === 0
              ? `No ${cfg.label.toLowerCase()} yet.`
              : "Nothing matches that search."}
          </p>
        ) : (
          <div className="divide-y divide-[#e8e4dc]">
            {visible.map((row) => {
              const published = Boolean(row[cfg.publishedColumn]);
              return (
                <div key={String(row.id)} className="flex items-center gap-3 py-3">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      published ? "bg-green-500" : "bg-[#c9c9c9]"
                    }`}
                    title={published ? "Published" : "Hidden from the public site"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#0d1f3c] truncate">
                      {String(row[cfg.titleField] ?? "(untitled)")}
                    </p>
                    <p className="text-[11px] text-[#8a9ab5] truncate">
                      {String(row.id)}
                      {typeof row.category === "string" && row.category ? ` · ${row.category}` : ""}
                      {typeof row.date === "string" && row.date
                        ? ` · ${row.date.slice(0, 10)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => void togglePublished(row)}
                    className="text-xs text-[#8a9ab5] hover:text-[#0d1f3c]"
                  >
                    {published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => setEditing({ row })}
                    className="text-xs text-[#c9a84c] font-medium hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(row)}
                    className="text-xs text-[#8a9ab5] hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <ContentForm
          kind={kind}
          row={editing.row}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-2">
              Delete this {cfg.label.replace(/s$/, "").toLowerCase()}?
            </h3>
            <p className="text-sm text-[#2c3347] mb-1 break-words">
              {String(confirmDelete[cfg.titleField] ?? "(untitled)")}
            </p>
            <p className="text-xs text-[#8a9ab5] mb-5">
              This removes it from the public site immediately and cannot be undone from here.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="flex-1 border border-[#e8e4dc] text-[#2c3347] font-semibold py-2.5 rounded text-sm hover:bg-[#f7f5f0] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void remove(confirmDelete)}
                disabled={busy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded text-sm disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContentForm({
  kind,
  row,
  busy,
  onCancel,
  onSave,
}: {
  kind: ContentKind;
  row: Row | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: Row) => void;
}) {
  const cfg = CONTENT_CONFIG[kind];
  const [draft, setDraft] = useState<Row>(() => (row ? toDraft(kind, row) : emptyDraft(kind)));
  const [error, setError] = useState("");

  const isNew = row === null;
  const inputCls =
    "w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The tables have different NOT NULL columns, so the required set comes
    // from the config rather than being guessed here.
    const problem = validateDraft(kind, draft, isNew);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-2xl">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#e8e4dc]">
          <h3 className="font-serif text-lg font-bold text-[#0d1f3c]">
            {isNew ? `New ${cfg.label.replace(/s$/, "")}` : `Edit ${cfg.label.replace(/s$/, "")}`}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-[#8a9ab5] hover:text-[#0d1f3c] text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {cfg.fields.map((f) => {
            const value = draft[f];
            const id = `cf-${f}`;
            const lockedId = f === "id" && !isNew;

            if (CHECKBOX_FIELDS.has(f)) {
              return (
                <label key={f} htmlFor={id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => setDraft({ ...draft, [f]: e.target.checked })}
                    className="w-4 h-4 accent-[#c9a84c]"
                  />
                  <span className="text-sm text-[#2c3347]">{fieldLabel(f)}</span>
                  <span className="text-xs text-[#8a9ab5]">
                    {f === cfg.publishedColumn ? "— shown on the public site" : ""}
                  </span>
                </label>
              );
            }

            return (
              <div key={f}>
                <label
                  htmlFor={id}
                  className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                >
                  {fieldLabel(f)}
                  {(isNew
                    ? cfg.requiredFields
                    : cfg.requiredFields.filter((r) => r !== "id")
                  ).includes(f) && " *"}
                </label>
                {TEXTAREA_FIELDS.has(f) || LIST_FIELDS.has(f) ? (
                  <textarea
                    id={id}
                    rows={LIST_FIELDS.has(f) ? 4 : 8}
                    value={String(value ?? "")}
                    onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                    className={`${inputCls} resize-y font-mono text-xs`}
                    placeholder={
                      LIST_FIELDS.has(f)
                        ? "One item per line"
                        : f === "content"
                          ? "Plain text. A blank line starts a new paragraph."
                          : ""
                    }
                  />
                ) : (
                  <input
                    id={id}
                    type={NUMBER_FIELDS.has(f) ? "number" : DATE_FIELDS.has(f) ? "date" : "text"}
                    value={
                      DATE_FIELDS.has(f) && typeof value === "string"
                        ? value.slice(0, 10)
                        : String(value ?? "")
                    }
                    disabled={lockedId}
                    onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                    className={`${inputCls} ${lockedId ? "opacity-60" : ""}`}
                  />
                )}
                {f === "content" && (
                  <p className="text-[11px] text-[#8a9ab5] mt-1">
                    The public article page renders this as plain text, one paragraph per blank
                    line.
                  </p>
                )}
              </div>
            );
          })}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-[#e8e4dc]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 border border-[#e8e4dc] text-[#2c3347] font-semibold py-3 rounded text-sm hover:bg-[#f7f5f0] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 bg-[#0d1f3c] hover:bg-[#162d52] text-white font-semibold py-3 rounded text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : isNew ? "Create" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
