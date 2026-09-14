// ============================================================================
// Public Form Submissions & Session Utilities
// ============================================================================
// Form submissions from public-facing flows and saved-lawyer session sync.
// ============================================================================

import { supabase } from "@/lib/supabase";

// ── Inquiries ─────────────────────────────────────────────────────────────

export type InquiryPayload = {
  name: string;
  email: string;
  phone?: string;
  concern?: string;
  method?: string;
  message: string;
  practiceArea?: string;
};

// Signed-out visitors' inquiries are emailed to the firm and hidden from
// Client Intake (only registered clients' inquiries stay in the queue). The
// edge function claims the row before sending, so calling this twice — or from
// two tabs — never sends the same inquiry twice. Failures are swallowed: the
// inquiry is already recorded and the visitor must not see an error because an
// email provider hiccupped.
export async function notifyFirmOfInquiry(referenceNumber: string) {
  if (!referenceNumber) return;
  try {
    await supabase.functions.invoke("notify-inquiry", {
      body: { reference: referenceNumber },
    });
  } catch (error) {
    console.error("Firm notification failed:", error);
  }
}

export async function submitInquiry(data: InquiryPayload, options?: { notifyFirm?: boolean }) {
  try {
    // public.submit_inquiry() rather than a direct table insert. A signed-out
    // visitor cannot complete `.insert().select().single()`:
    //   * inquiry_number's DEFAULT runs as the inserting role, and anon has no
    //     USAGE on inquiry_number_seq, so the insert dies before it starts;
    //   * and even once that is granted, RETURNING is subject to the SELECT
    //     policy, which is authenticated-only — so the row is created but comes
    //     back empty and .single() raises PGRST116.
    // The function is SECURITY DEFINER, so it can do both, and it hands back
    // just the reference number the visitor needs. It also validates server
    // side, which the browser-side checks were never enough for.
    const { data: referenceNumber, error } = await supabase.rpc("submit_inquiry", {
      p_name: data.name,
      p_email: data.email,
      p_phone: data.phone || null,
      p_practice_area: data.practiceArea || null,
      p_method: data.method || null,
      p_message: data.message,
      p_subject: data.concern || null,
    });

    if (error) throw error;
    // Fire and forget: the visitor's success screen must not wait on email.
    // InquiryFlow passes notifyFirm:false and notifies itself once the
    // attachments are linked, so the email can include them.
    if (options?.notifyFirm !== false && referenceNumber) {
      void notifyFirmOfInquiry(referenceNumber);
    }
    return {
      success: true,
      data: null,
      referenceNumber: referenceNumber ?? null,
    };
  } catch (error) {
    console.error("Error submitting inquiry:", error);
    return { success: false, error, data: null, referenceNumber: null };
  }
}

// ── Inquiry attachments ─────────────────────────────────────────────────────
//
// The public form lets visitors attach files, photos or videos. Uploads go to
// the private `inquiry-attachments` bucket (anon may INSERT, nobody anonymous
// may read), and are then linked to the inquiry through the
// attach_inquiry_files() RPC, which is keyed by the reference number the
// submitter already holds. See 20261008_inquiry_attachments.sql.

export type InquiryFileMeta = {
  path: string;
  name: string;
  mime: string;
  size: number;
};

const ATTACHMENT_BUCKET = "inquiry-attachments";

export async function uploadInquiryAttachment(
  file: File,
): Promise<{ path: string; error: null } | { path: null; error: string }> {
  // One folder per file keeps uploads from colliding and stops anyone from
  // guessing a path; the RPC only accepts paths under inquiries/.
  const folder =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "attachment";
  const path = `inquiries/${folder}/${safeName}`;

  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function attachInquiryFiles(referenceNumber: string, files: InquiryFileMeta[]) {
  try {
    const { data, error } = await supabase.rpc("attach_inquiry_files", {
      p_reference: referenceNumber,
      p_files: files.map((f) => ({
        path: f.path,
        name: f.name,
        mime: f.mime,
        size: String(f.size),
      })),
    });
    if (error) throw error;
    return {
      success: true,
      count: typeof data === "number" ? data : 0,
      error: null,
    };
  } catch (error) {
    console.error("Error attaching inquiry files:", error);
    return { success: false, count: 0, error };
  }
}

// ── Consultation bookings ─────────────────────────────────────────────────
//
// A consultation is a pre-matter request, so it is stored as an inquiry. That
// puts it in the same queue the admin already works from (Inquiries → Convert
// to Matter) instead of in a separate table nobody reads. The previous
// implementation only flipped a UI flag, so the client saw a confirmation
// screen and a CS- reference number for a booking that was never recorded.

export type ConsultationPayload = {
  name: string;
  email: string;
  phone?: string;
  practiceArea: string;
  assistanceType: string;
  lawyerName?: string;
  method: string;
  date: string;
  time: string;
  notes?: string;
};

export async function submitConsultation(data: ConsultationPayload) {
  const details = [
    `Type of assistance: ${data.assistanceType}`,
    `Preferred method: ${data.method}`,
    `Requested date: ${data.date}`,
    `Requested time: ${data.time}`,
    data.lawyerName
      ? `Requested lawyer: ${data.lawyerName}`
      : "Requested lawyer: Westwood recommendation",
    "",
    data.notes?.trim() ? `Client notes:\n${data.notes.trim()}` : "Client notes: (none provided)",
  ].join("\n");

  return submitInquiry({
    name: data.name,
    email: data.email,
    phone: data.phone,
    concern: `Consultation request — ${data.assistanceType}`,
    method: data.method,
    message: details,
    practiceArea: data.practiceArea,
  });
}

// ── Saved lawyers (uses localStorage, not database) ────────────────────────

const SAVED_LAWYERS_KEY = "westwood_saved_lawyers";

export async function syncSavedLawyers(sessionId: string, lawyerIds: string[]) {
  try {
    // Store in localStorage
    localStorage.setItem(`${SAVED_LAWYERS_KEY}_${sessionId}`, JSON.stringify(lawyerIds));
    return { success: true };
  } catch (error) {
    console.error("Error syncing saved lawyers:", error);
    return { success: false, error };
  }
}

export async function fetchSavedLawyers(sessionId: string) {
  try {
    const stored = localStorage.getItem(`${SAVED_LAWYERS_KEY}_${sessionId}`);
    const lawyerIds = stored ? JSON.parse(stored) : [];
    return { data: lawyerIds };
  } catch (error) {
    console.error("Error fetching saved lawyers:", error);
    return { data: [] };
  }
}
