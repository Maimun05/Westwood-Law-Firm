// ============================================================================
// ProfilePictureModal — pick, crop, save or remove a profile picture
// ============================================================================
// One dialog drives the whole flow for every role (and for admins editing
// someone else):
//
//   1. Nothing picked yet  → show the picture as it is now, plus Choose / Remove.
//   2. A file is picked     → show the square cropper (its frame IS the live
//                             preview: the circle guide is exactly what gets
//                             saved), plus Back / Save.
//
// The cropper owns all geometry and hands back a finished 512x512 blob; this
// component owns validation, the in-flight state, error copy and the calls into
// `profilePicture.ts`. The result is reported through `onSaved`, which the
// callers use to update their local copy of the URL (and to refresh auth when
// the edited account is the signed-in one).

import { useId, useRef, useState } from "react";

import Modal, {
  MODAL_BODY_CLASS,
  MODAL_BUTTON_DANGER_CLASS,
  MODAL_BUTTON_PRIMARY_CLASS,
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";
import {
  AVATAR_ACCEPT,
  removeProfilePicture,
  setProfilePicture,
  validateAvatarFile,
} from "@/lib/services/profilePicture";

import Avatar from "./Avatar";
import SquareCropper, { type SquareCropperHandle } from "./SquareCropper";

export default function ProfilePictureModal({
  userId,
  currentUrl,
  subjectName,
  onClose,
  onSaved,
}: {
  /** The account whose picture is being changed (may be someone else for admins). */
  userId: string;
  /** The picture as it stands right now, used for the preview and for cleanup. */
  currentUrl: string | null;
  /** Display name for the dialog title and the initials fallback. */
  subjectName?: string;
  onClose: () => void;
  /** Called with the new public URL, or null after a removal. */
  onSaved: (url: string | null) => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<SquareCropperHandle>(null);

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const busy = saving || removing;
  const name = subjectName?.trim() || "This account";

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    // Reset so re-picking the same file still fires `change`.
    event.target.value = "";
    if (!picked) return;

    const problem = validateAvatarFile(picked);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setError(null);
    setFile(picked);
  };

  const handleSave = async () => {
    if (!file || !cropperRef.current) return;
    setSaving(true);
    setError(null);

    const blob = await cropperRef.current.getBlob();
    if (!blob) {
      setSaving(false);
      setError("That image could not be processed. Please try another file.");
      return;
    }

    const { url, error: saveError } = await setProfilePicture(userId, blob, currentUrl);
    setSaving(false);

    if (saveError || !url) {
      setError(saveError ?? "Upload failed. Please try again.");
      return;
    }
    onSaved(url);
    onClose();
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);

    const { error: removeError } = await removeProfilePicture(userId, currentUrl);
    setRemoving(false);

    if (removeError) {
      setError(removeError);
      return;
    }
    onSaved(null);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="lg" labelledBy={titleId} dismissible={!busy} align="top">
      <ModalHeader
        eyebrow="Profile picture"
        title={subjectName ? `Change ${subjectName}'s photo` : "Change your photo"}
        titleId={titleId}
        onClose={onClose}
        closeDisabled={busy}
        description={
          file
            ? "Drag to reposition, then zoom until it looks right."
            : "A square photo works best. JPG, PNG or WEBP up to 5 MB."
        }
      />

      <ModalBody className={`${MODAL_BODY_CLASS} space-y-5`}>
        {error && (
          <p className={MODAL_ERROR_CLASS} role="alert">
            {error}
          </p>
        )}

        {file ? (
          <div>
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-[#8a9ab5]">
              Preview
            </p>
            <SquareCropper ref={cropperRef} file={file} onError={setError} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar
              name={subjectName ?? "?"}
              src={currentUrl}
              className="h-28 w-28 text-3xl"
              ring={false}
            />
            <p className="max-w-xs text-center text-sm text-[#2c3347]">
              {currentUrl
                ? "Choose a new photo to replace this one, or remove it to go back to initials."
                : `${name} has no photo yet — the initials are shown instead.`}
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={onPick}
          tabIndex={-1}
        />
      </ModalBody>

      <ModalFooter>
        {file ? (
          <>
            <button
              type="button"
              className={`${MODAL_BUTTON_SECONDARY_CLASS} flex-1`}
              onClick={() => {
                setError(null);
                setFile(null);
              }}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className={`${MODAL_BUTTON_PRIMARY_CLASS} flex-1`}
              onClick={handleSave}
              disabled={busy}
            >
              {saving ? "Saving…" : "Save photo"}
            </button>
          </>
        ) : (
          <>
            {currentUrl && (
              <button
                type="button"
                className={`${MODAL_BUTTON_DANGER_CLASS} flex-1`}
                onClick={handleRemove}
                disabled={busy}
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            )}
            <button
              type="button"
              className={`${MODAL_BUTTON_PRIMARY_CLASS} flex-1`}
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Choose photo
            </button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
