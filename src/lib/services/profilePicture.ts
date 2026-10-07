// ============================================================================
// Profile picture service
// ============================================================================
// Upload / replace / remove a square profile picture in the public `avatars`
// bucket, keeping `profiles.profile_image` in step with the stored object.
//
// The browser always hands us a 512x512 image (SquareCropper exports one), so
// the only validation left here is the bucket contract: an image mime type and
// a size under the bucket's 5 MB limit.
//
// Object path is `<userId>/<uuid>.webp`. The uid prefix is what the storage
// INSERT policy checks, so a signed-in user can only write under their own
// uid (admins may write any); the random uuid means a new upload never
// collides with — or can be guessed from — an existing one.
//
// Order matters: upload the object first, then write the column, then delete
// the previous object. If the column write fails we delete the object we just
// uploaded, so the row never points at a file that isn't there.

import { supabase } from "@/lib/supabase";

export const AVATARS_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // must match the bucket limit
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",");

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/`;

/** Returns an error message, or null when the file is acceptable. */
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG or WEBP image.";
  }
  if (file.size === 0) return "That image is empty.";
  if (file.size > MAX_AVATAR_BYTES) {
    return "That image is larger than 5 MB. Please choose a smaller one.";
  }
  return null;
}

/**
 * If `url` points at an object in our own `avatars` bucket, return its path
 * (`<uid>/<uuid>.webp`); otherwise null.
 *
 * Only our own objects may be deleted — an existing `profile_image` might be a
 * seeded external URL or a bundled `/lawyers/*.svg`, and removing those from
 * storage is impossible and would be wrong.
 */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(PUBLIC_PREFIX)) return null;
  const path = url.slice(PUBLIC_PREFIX.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

function friendlyStorageError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("bucket not found"))
    return "Profile picture storage is not set up yet. Please contact your administrator.";
  if (m.includes("mime") || m.includes("not supported")) return "That image type is not allowed.";
  if (m.includes("size") || m.includes("exceeded") || m.includes("too large"))
    return "That image is larger than 5 MB. Please choose a smaller one.";
  if (
    m.includes("row-level security") ||
    m.includes("not authorized") ||
    m.includes("unauthorized")
  )
    return "You don't have permission to change this profile picture.";
  if (m.includes("duplicate") || m.includes("already exists"))
    return "That upload clashed with an existing file. Please try again.";
  return message || "Upload failed. Please try again.";
}

/**
 * Store a new picture for `userId` and point their profile at it. Deletes the
 * previous picture (when it lived in our bucket) once the new one is saved.
 */
export async function setProfilePicture(
  userId: string,
  blob: Blob,
  previousUrl: string | null,
): Promise<{ url: string | null; error: string | null }> {
  try {
    const path = `${userId}/${crypto.randomUUID()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(path, blob, { upsert: false, contentType: "image/webp", cacheControl: "3600" });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
    const url = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ profile_image: url })
      .eq("id", userId);

    if (updateError) {
      // Roll the object back so we never leave an orphan behind a failed write.
      await supabase.storage.from(AVATARS_BUCKET).remove([path]);
      throw updateError;
    }

    // Best-effort cleanup of the picture this one replaces. A failure here is
    // not worth surfacing — the new picture is already live.
    const oldPath = avatarPathFromUrl(previousUrl);
    if (oldPath) {
      const { error: removeError } = await supabase.storage.from(AVATARS_BUCKET).remove([oldPath]);
      if (removeError) console.warn("Could not remove the previous profile picture:", removeError);
    }

    return { url, error: null };
  } catch (error: any) {
    console.error("Error setting profile picture:", error);
    return { url: null, error: friendlyStorageError(error?.message || "") };
  }
}

/** Clear the profile picture and return to the initials fallback. */
export async function removeProfilePicture(
  userId: string,
  currentUrl: string | null,
): Promise<{ error: string | null }> {
  try {
    // Clear the column first, so the UI can never render a URL to an object
    // that is about to be deleted.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ profile_image: null })
      .eq("id", userId);

    if (updateError) throw updateError;

    const path = avatarPathFromUrl(currentUrl);
    if (path) {
      const { error: removeError } = await supabase.storage.from(AVATARS_BUCKET).remove([path]);
      if (removeError) console.warn("Could not remove the profile picture object:", removeError);
    }

    return { error: null };
  } catch (error: any) {
    console.error("Error removing profile picture:", error);
    return { error: friendlyStorageError(error?.message || "") };
  }
}
