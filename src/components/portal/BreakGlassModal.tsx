import { useState } from "react";

export default function BreakGlassModal({
  fileName,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = reason.trim().length >= 15;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const e = await onConfirm(reason.trim());
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 border border-amber-300">
        <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-1">
          Open Confidential document
        </h3>
        <p className="text-sm text-[#2c3347] mb-3">
          <strong>{fileName}</strong> is restricted to the assigned lawyer's team. Opening it is
          logged and the assigned lawyer is notified immediately.
        </p>
        <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1">
          Reason (required, min. 15 characters)
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#c9a84c]"
        />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 border border-[#e8e4dc] rounded py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ok || busy}
            className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded py-2.5 text-sm font-semibold"
          >
            {busy ? "Opening…" : "Log reason and open"}
          </button>
        </div>
      </div>
    </div>
  );
}
