// ============================================================================
// notify-event — transactional email for registered-user events
// ============================================================================
// Called by the portal (src/utils/api.ts -> notifyEvent) right after an action
// that already succeeded:
//
//   inquiry_submitted      (id = inquiry id)      → client confirmation,
//                                                   firm copy, requested/assigned lawyer
//   inquiry_assigned       (id = inquiry id)      → the newly assigned lawyer
//                                                   (fired by Client Intake on assign)
//   consultation_requested (id = appointment id)  → client confirmation, firm, lawyer
//   appointment_status     (id = appointment id)  → the other party
//                                                   (approve / cancel / reschedule)
//   inquiry_message        (id = message id)      → the other participant,
//                                                   deliberately without content
//
// Trust model: the caller must be signed in, and the record is re-read with
// THE CALLER'S OWN JWT so RLS decides whether it exists for them — a forged or
// guessed id sends nothing. Every recipient address is then resolved from
// database records with the service role; an address supplied by the browser
// is never accepted.
//
// Dedup: each (event, entity, recipient) is claimed in public.email_events
// (20261019) before sending, so a retry, a double-click or two tabs cannot
// send the same email twice.
//
// Signed-out visitors are deliberately not covered here: their inquiries are
// emailed to the firm by notify-inquiry, keyed by the reference number.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY      (required) API key from resend.com
//   INQUIRY_TO_EMAIL    (optional) firm inbox, defaults to firmwestwoodlaw@gmail.com
//   INQUIRY_FROM_EMAIL  (optional) defaults to Resend's onboarding sender.
//                       With no verified domain Resend only accepts
//                       onboarding@resend.dev and only delivers to the address
//                       the Resend account was created with.
//
// Deploy: supabase functions deploy notify-event
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Values that reach an HTML email get escaped; names and subjects are
// visitor-supplied.
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const EVENTS = [
  "inquiry_submitted",
  "inquiry_assigned",
  "consultation_requested",
  "appointment_status",
  "inquiry_message",
] as const;
type EventName = (typeof EVENTS)[number];

const wrap = (heading: string, lines: string[]) => `<!doctype html>
<html><body style="margin:0;background:#f7f5f0;font-family:Georgia,serif;color:#0d1f3c">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#0d1f3c;padding:20px 24px;border-radius:12px 12px 0 0">
      <p style="margin:0;color:#c9a84c;letter-spacing:2px;font-size:12px">WESTWOOD LAW FIRM</p>
    </div>
    <div style="background:#ffffff;padding:24px;border:1px solid #e8e4dc;border-top:0;border-radius:0 0 12px 12px">
      <h1 style="font-size:18px;margin:0 0 12px">${esc(heading)}</h1>
      ${lines.map((l) => `<p style="font-size:14px;line-height:1.6;margin:0 0 10px">${l}</p>`).join("")}
      <p style="font-size:12px;color:#8a9ab5;margin:20px 0 0">
        This is an automated message from the Westwood Law Firm client portal.
        Please do not reply to this email.
      </p>
    </div>
  </div>
</body></html>`;

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("INQUIRY_FROM_EMAIL") || "onboarding@resend.dev",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    // Log status and body, never the message content.
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
}

/**
 * Claim (event, entity, recipient) in public.email_events. Returns false when
 * an earlier request already claimed it, so the caller skips the send. If the
 * claim table itself fails, log and send anyway — losing the email would be
 * worse than the rare duplicate the claim exists to prevent.
 */
async function claim(
  admin: ReturnType<typeof createClient>,
  event: EventName,
  entityId: string,
  recipient: string,
): Promise<boolean> {
  const { error } = await admin
    .from("email_events")
    .insert({ event, entity_id: entityId, recipient });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("email claim failed, sending anyway:", error.message);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return json({ ok: false, error: "RESEND_API_KEY is not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const event = typeof body?.event === "string" ? (body.event as EventName) : ("" as EventName);
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!EVENTS.includes(event) || !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ ok: false, error: "Invalid event or id" }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "Sign in required" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // The caller's client: RLS applies, so a record they may not see simply
    // does not come back and nothing is sent.
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await asCaller.auth.getUser();
    const caller = userData?.user;
    if (userError || !caller) {
      return json({ ok: false, error: "Sign in required" }, 401);
    }

    const admin = createClient(url, serviceKey);
    const firmInbox = Deno.env.get("INQUIRY_TO_EMAIL") || "firmwestwoodlaw@gmail.com";

    const emailOf = async (uid: string | null): Promise<string | null> => {
      if (!uid) return null;
      const { data } = await admin.from("profiles").select("email").eq("id", uid).maybeSingle();
      return (data as { email: string | null } | null)?.email ?? null;
    };

    let sent = 0;
    const send = async (recipient: string | null, subject: string, html: string) => {
      if (!recipient) return;
      if (!(await claim(admin, event, id, recipient))) return;
      await sendEmail(apiKey, recipient, subject, html);
      sent++;
    };

    if (event === "inquiry_submitted") {
      const { data: inq } = await asCaller
        .from("inquiries")
        .select(
          "id, inquiry_number, name, email, phone, subject, practice_area, message, client_id, assigned_to, requested_lawyer_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (!inq) return json({ ok: false, error: "Not found" }, 404);

      // Signed-out visitors' inquiries are notify-inquiry's job (firm only).
      if (inq.client_id) {
        await send(
          inq.email,
          `We received your inquiry ${inq.inquiry_number}`,
          wrap("Your inquiry has reached us", [
            `Thank you, ${esc(inq.name)}. Your inquiry <strong>${esc(inq.inquiry_number)}</strong> is with our team.`,
            "A lawyer will review it and the firm will contact you within 1–2 business days.",
          ]),
        );

        await send(
          firmInbox,
          `New inquiry ${esc(inq.inquiry_number)} from ${esc(inq.name)}`,
          wrap(
            "New client inquiry",
            [
              `<strong>Reference:</strong> ${esc(inq.inquiry_number)}`,
              `<strong>Name:</strong> ${esc(inq.name)}`,
              `<strong>Email:</strong> ${esc(inq.email)}`,
              inq.phone ? `<strong>Phone:</strong> ${esc(inq.phone)}` : "",
              `<strong>Practice area:</strong> ${esc(inq.practice_area || "General")}`,
              `<strong>Subject:</strong> ${esc(inq.subject || "General inquiry")}`,
              `<strong>Message:</strong><br/>${esc(inq.message)}`,
            ].filter(Boolean),
          ),
        );

        // The assigned (or requested) lawyer gets a heads-up; the content
        // stays in the portal.
        const lawyerEmail = await emailOf(inq.assigned_to ?? inq.requested_lawyer_id);
        await send(
          lawyerEmail,
          `New inquiry assigned to you — ${esc(inq.inquiry_number)}`,
          wrap("A new inquiry is waiting for you", [
            `Inquiry <strong>${esc(inq.inquiry_number)}</strong> (${esc(inq.practice_area || "General")}) from ${esc(inq.name)} is assigned to you.`,
            "Open your portal to read it and reply to the client.",
          ]),
        );
      }
    }

    if (event === "inquiry_assigned") {
      // Fired by Client Intake when the front desk assigns (or reassigns) an
      // inquiry. The bell trigger (inquiries_notify_assigned) already pings the
      // lawyer in-app; this is the email half, to the newly assigned lawyer.
      const { data: inq } = await asCaller
        .from("inquiries")
        .select("id, inquiry_number, name, practice_area, assigned_to")
        .eq("id", id)
        .maybeSingle();
      if (!inq) return json({ ok: false, error: "Not found" }, 404);
      if (!inq.assigned_to) return json({ ok: true, sent: 0 });

      const lawyerEmail = await emailOf(inq.assigned_to);
      await send(
        lawyerEmail,
        `New inquiry assigned to you — ${esc(inq.inquiry_number)}`,
        wrap("A new inquiry is waiting for you", [
          `Inquiry <strong>${esc(inq.inquiry_number)}</strong> (${esc(inq.practice_area || "General")}) from ${esc(inq.name)} is assigned to you.`,
          "Open your portal to read it and reply to the client.",
        ]),
      );
    }

    if (event === "consultation_requested" || event === "appointment_status") {
      const { data: appt } = await asCaller
        .from("appointments")
        .select("id, client_id, lawyer_id, appointment_type, date, time, mode, status")
        .eq("id", id)
        .maybeSingle();
      if (!appt) return json({ ok: false, error: "Not found" }, 404);

      const when = `${esc(appt.date)} at ${esc(appt.time)} (${esc(appt.mode)})`;

      if (event === "consultation_requested") {
        const clientEmail = await emailOf(appt.client_id);
        const lawyerEmail = await emailOf(appt.lawyer_id);
        await send(
          clientEmail,
          `Consultation request received — ${esc(appt.date)} at ${esc(appt.time)}`,
          wrap("We received your consultation request", [
            `Your ${esc(appt.appointment_type)} request for <strong>${when}</strong> is pending confirmation.`,
            "The firm will confirm or propose another time, and you will see the update in your portal.",
          ]),
        );
        await send(
          firmInbox,
          `Consultation request — ${esc(appt.date)} at ${esc(appt.time)}`,
          wrap("New consultation request", [
            `A ${esc(appt.appointment_type)} was requested for <strong>${when}</strong>.`,
            "Open the portal to confirm or reschedule it.",
          ]),
        );
        await send(
          lawyerEmail,
          `Consultation request — ${esc(appt.date)} at ${esc(appt.time)}`,
          wrap("A consultation has been requested", [
            `A ${esc(appt.appointment_type)} was requested with you for <strong>${when}</strong>.`,
            "Open your portal to review and confirm it.",
          ]),
        );
      } else {
        // appointment_status: notify both parties except whoever acted.
        const clientEmail = await emailOf(appt.client_id);
        const lawyerEmail = await emailOf(appt.lawyer_id);
        const recipients = [
          { uid: appt.client_id, email: clientEmail },
          { uid: appt.lawyer_id, email: lawyerEmail },
        ].filter((r) => r.email && r.uid !== caller.id);

        for (const r of recipients) {
          await send(
            r.email,
            `Appointment update — ${esc(appt.date)} at ${esc(appt.time)}`,
            wrap("Your appointment has been updated", [
              `The ${esc(appt.appointment_type)} on <strong>${when}</strong> is now <strong>${esc(appt.status)}</strong>.`,
              "Open the portal to see the details.",
            ]),
          );
        }
      }
    }

    if (event === "inquiry_message") {
      const { data: msg } = await asCaller
        .from("inquiry_messages")
        .select("id, inquiry_id, author_id")
        .eq("id", id)
        .maybeSingle();
      if (!msg) return json({ ok: false, error: "Not found" }, 404);

      const { data: inq } = await admin
        .from("inquiries")
        .select("inquiry_number, client_id, assigned_to")
        .eq("id", msg.inquiry_id)
        .maybeSingle();
      if (!inq) return json({ ok: false, error: "Not found" }, 404);

      // The other participant — never the author.
      const recipientUid = msg.author_id === inq.client_id ? inq.assigned_to : inq.client_id;
      const recipientEmail = await emailOf(recipientUid);

      // No message content in the subject or body: the portal holds it.
      await send(
        recipientEmail,
        `New message about inquiry ${esc(inq.inquiry_number)}`,
        wrap("You have a new message", [
          `There is a new message about inquiry <strong>${esc(inq.inquiry_number)}</strong>.`,
          "Sign in to your portal to read it and reply.",
        ]),
      );
    }

    return json({ ok: true, sent });
  } catch (err) {
    // Log the failure, never the content of the record.
    console.error("notify-event failed:", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "Email could not be sent" }, 500);
  }
});
