import { useRef, useState } from "react";

import type { AuthUser } from "@/lib/auth";

import {
  ACCESS_LEVEL_HELP,
  FILE_INPUT_ACCEPT,
  MAX_UPLOAD_BYTES,
  formatFileSize,
  uploadDocument,
  uploadableAccessLevels,
  validateFile,
  type DocumentRow,
} from "@/lib/services/documents";

import {
  MODAL_BUTTON_PRIMARY_CLASS,
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";

export type UploadMatterOption = {
  id: string;
  matter_number: string;
  title: string;
};

const TITLE_ID = "upload-document-title";

export default function UploadDocumentModal({
  currentUser,

  matters,

  initialMatterId,

  onClose,

  onUploaded,
}: {
  currentUser: AuthUser;

  matters: UploadMatterOption[];

  initialMatterId?: string;

  onClose: () => void;

  onUploaded: (doc: DocumentRow) => void;
}) {
  const levels = uploadableAccessLevels(currentUser.role);

  const [matterId, setMatterId] = useState(initialMatterId ?? matters[0]?.id ?? "");

  const [accessLevel, setAccessLevel] = useState(levels[0]);

  const [file, setFile] = useState<File | null>(null);

  const [dragging, setDragging] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;

    const problem = validateFile(f);

    setError(problem);

    setFile(problem ? null : f);
  };

  const submit = async () => {
    if (!file || !matterId) return;

    setUploading(true);

    setError(null);

    const { data, error: err } = await uploadDocument({
      file,
      matterId,
      accessLevel,
      userId: currentUser.id,
    });

    setUploading(false);

    if (err || !data) {
      setError(err ?? "Upload failed.");

      return;
    }

    onUploaded(data);

    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      labelledBy={TITLE_ID}
      // Escape and backdrop dismissal are both blocked mid-upload.
      dismissible={!uploading}
    >
      <ModalHeader
        eyebrow="Documents"
        title="Upload Document"
        titleId={TITLE_ID}
        onClose={onClose}
        closeDisabled={uploading}
      />

      <ModalBody stagger className="space-y-5">
        {matters.length === 0 ? (
          <p className="text-sm text-[#8a9ab5] text-center py-6">
            You need a matter before you can upload documents. Submit an inquiry to get started.
          </p>
        ) : (
          <>
            <div>
              <label className={MODAL_LABEL_CLASS} htmlFor="upload-matter">
                Matter
              </label>
              <select
                id="upload-matter"
                value={matterId}
                onChange={(e) => setMatterId(e.target.value)}
                disabled={uploading || matters.length === 1}
                className={MODAL_INPUT_CLASS}
              >
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.matter_number} — {m.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={MODAL_LABEL_CLASS} htmlFor="upload-access">
                Who can see it
              </label>
              <select
                id="upload-access"
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)}
                disabled={uploading || levels.length === 1}
                className={MODAL_INPUT_CLASS}
              >
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#8a9ab5] mt-1.5">{ACCESS_LEVEL_HELP[accessLevel]}</p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!uploading) pick(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !uploading && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploading) {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all duration-200 ${
                uploading
                  ? "cursor-default border-[#e8e4dc] opacity-60"
                  : "cursor-pointer"
              } ${
                dragging
                  ? "border-[#c9a84c] bg-[#c9a84c]/10 scale-[1.01] shadow-[var(--shadow-gold-sm)]"
                  : "border-[#e8e4dc] hover:border-[#c9a84c] hover:bg-[#c9a84c]/[0.04]"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={FILE_INPUT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file ? (
                <>
                  <p className="text-sm font-semibold text-[#0d1f3c] break-all">{file.name}</p>
                  <p className="text-xs text-[#8a9ab5] mt-1">
                    {formatFileSize(file.size)} · click to choose a different file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl mb-1" aria-hidden="true">
                    📎
                  </p>
                  <p className="text-sm font-medium text-[#0d1f3c]">
                    Drop a file here or click to browse
                  </p>
                  <p className="text-xs text-[#8a9ab5] mt-1">
                    PDF, Word, Excel, PowerPoint, text or image · up to{" "}
                    {formatFileSize(MAX_UPLOAD_BYTES)}
                  </p>
                </>
              )}
            </div>

            {error && (
              <p role="alert" className={MODAL_ERROR_CLASS}>
                {error}
              </p>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={uploading}
          className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!file || !matterId || uploading}
          className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
