// ============================================================================
// Documents Service
// ============================================================================
// Upload / list / open / delete client-portal documents.
//
// Files live in the private "documents" storage bucket at
//   <matter_id>/<timestamp>-<sanitized-file-name>
// and each file has a row in public.documents. Access is enforced by RLS on
// both the table and storage.objects (see supabase/migrations/
// 20260929_documents_and_notifications.sql); nothing here is a security
// boundary, it only produces friendly errors and keeps the two in sync.
// ============================================================================

import { supabase } from "@/lib/supabase";
import { logAuditEvent } from "@/lib/services/audit";
import type { Database } from "@/lib/database.types";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type DocAccessLevel = Database["public"]["Enums"]["access_level"];

export const DOCUMENTS_BUCKET = "documents";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // must match the bucket limit

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const ALLOWED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);
export const FILE_INPUT_ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Access levels a given role may choose when uploading (mirrors can_upload_document in SQL). */
export function uploadableAccessLevels(role: "client" | "lawyer" | "admin"): DocAccessLevel[] {
  if (role === "client") return ["Client & Assigned Lawyer"];
  if (role === "lawyer")
    return ["Client & Assigned Lawyer", "Staff Shared", "Lawyer Only", "Confidential"];
  // Admins are view-only on documents (20261012): the database refuses every
  // admin upload, so the UI must not offer one.
  return [];
}

export const ACCESS_LEVEL_HELP: Record<DocAccessLevel, string> = {
  "Client & Assigned Lawyer": "Visible to the client and the assigned lawyer on this matter.",
  "Staff Shared": "Visible to lawyers and admins only. Not shown to the client.",
  "Lawyer Only": "Visible to the assigned lawyer only (and admins).",
  Confidential:
    "Visible to the assigned lawyer's team only. Admins see the file name and must log a reason to open it.",
  Public: "Visible to every signed-in user. Use with care.",
};

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/** Returns an error message, or null when the file is acceptable. */
export function validateFile(file: File): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This file is ${formatFileSize(file.size)}. The maximum size is ${formatFileSize(MAX_UPLOAD_BYTES)}.`;
  }
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `.${ext || "unknown"} files are not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage keys must be plain ASCII; keep the extension, replace everything else. */
function sanitizeFileName(fileName: string): string {
  const ext = extensionOf(fileName);
  const base =
    (ext ? fileName.slice(0, -(ext.length + 1)) : fileName)
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

function friendlyStorageError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("row-level security") ||
    m.includes("not authorized") ||
    m.includes("unauthorized")
  ) {
    return "You don't have permission to upload to this matter.";
  }
  if (m.includes("mime") || m.includes("not supported")) return "This file type is not allowed.";
  if (m.includes("size") || m.includes("exceeded") || m.includes("too large"))
    return "This file is too large.";
  if (m.includes("bucket not found"))
    return "Document storage is not set up yet. Please contact your administrator.";
  if (m.includes("duplicate") || m.includes("already exists"))
    return "A file with this name was just uploaded. Please try again.";
  return message || "Upload failed. Please try again.";
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Every document the current user is allowed to see (RLS does the filtering). */
export async function getMyDocuments() {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return { data: (data ?? []) as DocumentRow[], error: null as string | null };
  } catch (error: any) {
    return {
      data: [] as DocumentRow[],
      error: (error?.message as string) || "Failed to load documents",
    };
  }
}

// ── Upload ──────────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  file: File;
  matterId: string;
  accessLevel: DocAccessLevel;
  userId: string;
}

export async function uploadDocument({ file, matterId, accessLevel, userId }: UploadDocumentInput) {
  const invalid = validateFile(file);
  if (invalid) return { data: null, error: invalid };

  const ext = extensionOf(file.name);
  const filePath = `${matterId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  // 1. File -> storage (policy: user must belong to the matter in the path)
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: MIME_BY_EXTENSION[ext] ?? file.type ?? "application/octet-stream",
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    return { data: null, error: friendlyStorageError(uploadError.message) };
  }

  // 2. Metadata row (policy: uploaded_by = me and access level allowed for my role)
  const { data, error: insertError } = await supabase
    .from("documents")
    .insert({
      matter_id: matterId,
      name: file.name,
      file_path: filePath,
      file_type: ext.toUpperCase() || "FILE",
      file_size: file.size,
      access_level: accessLevel,
      uploaded_by: userId,
    })
    .select("*")
    .single();

  if (insertError || !data) {
    console.error("Document row insert failed, rolling back upload:", insertError);
    // Don't leave an orphaned file behind.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    const denied = insertError?.message?.toLowerCase().includes("row-level security");
    return {
      data: null,
      error: denied
        ? "You can't upload a document with that access level to this matter."
        : insertError?.message || "Could not save the document record.",
    };
  }

  void logAuditEvent("DOCUMENT_UPLOADED", `Uploaded document "${file.name}"`, {
    resource_type: "document",
    resource_id: data.id,
    metadata: {
      matter_id: matterId,
      access_level: accessLevel,
      size: file.size,
    },
  });

  return { data: data as DocumentRow, error: null as string | null };
}

// ── Open / download ─────────────────────────────────────────────────────────

/**
 * Short-lived signed URL. `denied` is true when storage refused access, so the
 * UI can show the "Restricted" screen instead of a raw error.
 */
export async function getDocumentUrl(doc: DocumentRow, mode: "open" | "download" = "open") {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_path, 60, mode === "download" ? { download: doc.name } : undefined);

  if (error || !data?.signedUrl) {
    const msg = error?.message ?? "Could not create a link for this document.";
    const denied = /not found|not authorized|row-level|unauthorized|forbidden/i.test(msg);
    if (denied) {
      void logAuditEvent("RESTRICTED_ACCESS_ATTEMPTED", `Denied access to document "${doc.name}"`, {
        resource_type: "document",
        resource_id: doc.id,
        success: false,
      });
    }
    return {
      url: null,
      denied,
      error: denied ? "You do not have access to this document." : msg,
    };
  }

  void logAuditEvent(
    "DOCUMENT_DOWNLOADED",
    `${mode === "download" ? "Downloaded" : "Opened"} document "${doc.name}"`,
    {
      resource_type: "document",
      resource_id: doc.id,
    },
  );

  return { url: data.signedUrl, denied: false, error: null as string | null };
}

// ── Delete ──────────────────────────────────────────────────────────────────

/** Removes the file first (its policy needs the row's uploader), then the row. */
export async function deleteDocument(doc: DocumentRow) {
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([doc.file_path]);
  if (storageError) {
    return { error: storageError.message || "Could not delete the file." };
  }

  // .select("id") is the point of this call: a DELETE the RLS policy filters
  // affects zero rows and still exits 0, so without reading the rows back the
  // UI would report "Document deleted" while the row survived.
  const { data: deletedRows, error: rowError } = await supabase
    .from("documents")
    .delete()
    .eq("id", doc.id)
    .select("id");
  if (rowError) {
    return {
      error: rowError.message || "Could not delete the document record.",
    };
  }
  if (!deletedRows || deletedRows.length === 0) {
    return { error: "Only the person who uploaded a document can delete it." };
  }

  void logAuditEvent("DOCUMENT_DELETED", `Deleted document "${doc.name}"`, {
    resource_type: "document",
    resource_id: doc.id,
  });
  return { error: null as string | null };
}

// ── Confidential documents: admin "break-glass" ─────────────────────────────
// Admins see a Confidential file's name and metadata only. To open the content they
// must type a reason; the database logs it, opens a 15-minute window for that one
// document, and notifies the assigned lawyer.
export async function breakGlassOpen(documentId: string, reason: string) {
  const { error } = await supabase.rpc("break_glass_open_document", {
    p_document_id: documentId,
    p_reason: reason,
  });
  return { error: error ? error.message : null };
}
