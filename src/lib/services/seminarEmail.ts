// ============================================================================
// Seminar registrant email — I/O for the admin Registrants screen
// ============================================================================
// A registration is an inquiries row with inquiries.seminar_id set (see
// 20261013_seminar_registrations.sql). RLS already lets an admin read every
// inquiry (inquiries_select_staff), so the list is a plain select. The send
// goes through the send-seminar-email edge function, which holds
// RESEND_API_KEY and does the per-recipient loop; nothing here talks to Resend.
// ============================================================================

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export type SeminarEmailLogRow = Database["public"]["Tables"]["seminar_email_log"]["Row"];

export type SeminarRegistrant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
};

export type SeminarEmailFailure = { email: string; error: string };

export type SendSeminarEmailResult = {
  ok: boolean;
  error: string | null;
  recipients: number;
  sent: number;
  failed: number;
  failures: SeminarEmailFailure[];
};

const noSend = { recipients: 0, sent: 0, failed: 0, failures: [] as SeminarEmailFailure[] };

/** Everyone who registered for one seminar, in registration order. */
export async function listSeminarRegistrants(
  seminarId: string,
): Promise<{ data: SeminarRegistrant[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("inquiries")
      .select("id, name, email, phone, created_at")
      .eq("seminar_id", seminarId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { data: (data ?? []) as SeminarRegistrant[], error: null };
  } catch (error: any) {
    return { data: null, error: error.message ?? "Could not load the registrants." };
  }
}

/** The last few sends for one seminar, newest first. */
export async function listSeminarEmailLog(
  seminarId: string,
): Promise<{ data: SeminarEmailLogRow[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("seminar_email_log")
      .select("*")
      .eq("seminar_id", seminarId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return { data: (data ?? []) as SeminarEmailLogRow[], error: null };
  } catch (error: any) {
    return { data: null, error: error.message ?? "Could not load the send history." };
  }
}

/** Hand the composed email to the edge function, which sends it one by one. */
export async function sendSeminarEmail(input: {
  seminarId: string;
  subject: string;
  message: string;
}): Promise<SendSeminarEmailResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: "Your session expired. Sign in again.", ...noSend };
    }

    const { data, error } = await supabase.functions.invoke("send-seminar-email", {
      body: input,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      // A non-2xx reply carries the function's own message in the response
      // body ("split the list", "rejected every message", …), which is far
      // more useful than the generic "non-2xx status code".
      let detail: string | null = null;
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) detail = String(body.error);
      } catch {
        // keep the generic message
      }
      return { ok: false, error: detail ?? error.message, ...noSend };
    }

    const result = (data ?? {}) as Partial<SendSeminarEmailResult>;
    return {
      ok: result.ok !== false,
      error: null,
      recipients: result.recipients ?? 0,
      sent: result.sent ?? 0,
      failed: result.failed ?? 0,
      failures: result.failures ?? [],
    };
  } catch (error: any) {
    return { ok: false, error: error.message ?? "Could not send the email.", ...noSend };
  }
}
