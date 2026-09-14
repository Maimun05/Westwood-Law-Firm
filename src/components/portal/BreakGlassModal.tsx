import { useState } from "react";

import {
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";

const TITLE_ID = "break-glass-title";

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
    <Modal
      open
      onClose={onCancel}
      size="md"
      labelledBy={TITLE_ID}
      dismissible={!busy}
      panelClassName="border-amber-300"
    >
      <ModalHeader
        tone="light"
        eyebrow="Confidential access"
        title="Open Confidential document"
        titleId={TITLE_ID}
        onClose={onCancel}
        closeDisabled={busy}
      />

      <ModalBody stagger className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <span aria-hidden="true" className="text-lg leading-none">
            ⚠
          </span>
          <p className="text-sm text-[#2c3347]">
            <strong className="break-all font-semibold text-[#0d1f3c]">{fileName}</strong> is
            restricted to the assigned lawyer's team. Opening it is logged and the assigned lawyer
            is notified immediately.
          </p>
        </div>

        <div>
          <label className={MODAL_LABEL_CLASS} htmlFor="break-glass-reason">
            Reason (required, min. 15 characters)
          </label>
          <textarea
            id="break-glass-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${MODAL_INPUT_CLASS} resize-none`}
          />
          <p
            className={`mt-1.5 text-xs tabular-nums ${
              ok ? "text-emerald-600" : "text-[#8a9ab5]"
            }`}
          >
            {reason.trim().length} / 15 characters
          </p>
        </div>

        {err && (
          <p role="alert" className={MODAL_ERROR_CLASS}>
            {err}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ok || busy}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-3 rounded-lg transition-all duration-200 hover:shadow-[0_8px_24px_-4px_rgb(217_119_6/0.4)] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
        >
          {busy ? "Opening…" : "Log reason and open"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
