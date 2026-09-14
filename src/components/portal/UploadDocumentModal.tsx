import { useEffect, useRef, useState } from "react";

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

export type UploadMatterOption = {
  id: string;
  matter_number: string;
  title: string;
};

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

  // Close on Escape (not while a upload is running)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [uploading, onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upload document"
        className="bg-white rounded-2xl w-full max-w-lg border border-[#e8e4dc]"
      >
        <div className="bg-[#0d1f3c] rounded-t-2xl px-6 py-5 flex items-start justify-between">
          <div>
            <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-1">
              Documents
            </p>
            <h2 className="font-serif text-xl font-bold text-white">Upload Document</h2>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
            className="text-white/40 hover:text-white text-2xl leading-none disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          {matters.length === 0 ? (
            <p className="text-sm text-[#8a9ab5] text-center py-6">
              You need a matter before you can upload documents. Submit an inquiry to get started.
            </p>
          ) : (
            <>
              <div>
                <label
                  className="block text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-1.5"
                  htmlFor="upload-matter"
                >
                  Matter
                </label>
                <select
                  id="upload-matter"
                  value={matterId}
                  onChange={(e) => setMatterId(e.target.value)}
                  disabled={uploading || matters.length === 1}
                  className="w-full border border-[#e8e4dc] rounded px-3 py-2.5 text-sm text-[#0d1f3c] bg-white focus:outline-none focus:border-[#c9a84c] disabled:bg-[#f7f5f0]"
                >
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.matter_number} — {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-1.5"
                  htmlFor="upload-access"
                >
                  Who can see it
                </label>
                <select
                  id="upload-access"
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)}
                  disabled={uploading || levels.length === 1}
                  className="w-full border border-[#e8e4dc] rounded px-3 py-2.5 text-sm text-[#0d1f3c] bg-white focus:outline-none focus:border-[#c9a84c] disabled:bg-[#f7f5f0]"
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
                className={`border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-colors ${
                  dragging
                    ? "border-[#c9a84c] bg-[#c9a84c]/5"
                    : "border-[#e8e4dc] hover:border-[#c9a84c]"
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
                    <p className="text-2xl mb-1">📎</p>
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
                <p
                  role="alert"
                  className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2"
                >
                  {error}
                </p>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={uploading}
              className="flex-1 border border-[#e8e4dc] hover:border-[#0d1f3c] text-[#0d1f3c] text-sm font-medium py-3 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!file || !matterId || uploading}
              className="flex-1 bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold py-3 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
