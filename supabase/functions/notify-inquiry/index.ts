// ============================================================================
// notify-inquiry — email a signed-out visitor's inquiry to the firm
// ============================================================================
// Called by src/utils/api.ts right after a public form submits. When the
// visitor is signed out the inquiry has client_id IS NULL; those are the rows
// Client Intake deliberately does not show (AdminIntake.tsx). This function is
// how the firm hears about them.
//
// The row is claimed atomically through firm_notified_at before the email is
// sent, so a double-click, a retry or two tabs cannot email the same inquiry
// twice. If Resend rejects the message the claim is released so a retry can
// still deliver it.
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY      (required) API key from resend.com
//   INQUIRY_TO_EMAIL    (optional) defaults to westwoodlawfirm1@gmail.com
//   INQUIRY_FROM_EMAIL  (optional) defaults to Resend's onboarding sender.
//                       With no verified domain Resend only accepts
//                       onboarding@resend.dev and only delivers to the address
//                       the Resend account was created with.
//
// Deploy AFTER migration 20261010 adds firm_notified_at:
//   supabase functions deploy notify-inquiry
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

// Inquiry fields are visitor-supplied and land in an HTML email.
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function manila(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let claimedId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
    if (!/^WI-\d{4}-\d{3,6}$/.test(reference)) {
      return json({ ok: false, error: "Invalid reference" }, 400);
    }

    admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Atomic claim. Zero rows means: unknown reference, a registered client's
    // inquiry (not ours to email), or one already emailed — all a no-op.
    const { data: inquiry, error: claimError } = await admin
      .from("inquiries")
      .update({ firm_notified_at: new Date().toISOString() })
      .eq("inquiry_number", reference)
      .is("client_id", null)
      .is("firm_notified_at", null)
      .select("*")
      .maybeSingle();

    if (claimError) throw new Error(`claim failed: ${claimError.message}`);
    if (!inquiry) return json({ ok: true, sent: false });
    claimedId = inquiry.id;

    // Attachments are best-effort: the email must go out even if signing fails.
    const links: { name: string; url: string }[] = [];
    try {
      const { data: files } = await admin
        .from("inquiry_attachments")
        .select("file_name, storage_path")
        .eq("inquiry_id", inquiry.id);
      for (const f of files ?? []) {
        const { data: signed } = await admin.storage
          .from("inquiry-attachments")
          .createSignedUrl(f.storage_path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) links.push({ name: f.file_name, url: signed.signedUrl });
      }
    } catch (e) {
      console.error("attachment links failed (sending without them)", e);
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    const to = Deno.env.get("INQUIRY_TO_EMAIL") ?? "westwoodlawfirm1@gmail.com";
    const from =
      Deno.env.get("INQUIRY_FROM_EMAIL") ?? "Westwood Law Firm Website <onboarding@resend.dev>";

    const rows: [string, string][] = [
      ["Reference", inquiry.inquiry_number],
      ["Name", inquiry.name],
      ["Email", inquiry.email],
      ["Phone", inquiry.phone ?? "—"],
      ["Practice area", inquiry.practice_area || "—"],
      ["Preferred contact", inquiry.preferred_contact_method ?? "—"],
      ["Subject", inquiry.subject],
      ["Submitted", manila(inquiry.created_at)],
    ];

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0d1f3c;max-width:640px">
        <h2 style="font-size:18px;margin:0 0 4px">New website inquiry</h2>
        <p style="color:#8a9ab5;font-size:12px;margin:0 0 16px">
          From a visitor without a client account — it is not in Client Intake. Reply directly to this email.
        </p>
        <table style="border-collapse:collapse;font-size:14px">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:4px 12px 4px 0;color:#8a9ab5;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`,
            )
            .join("")}
        </table>
        <h3 style="font-size:14px;margin:18px 0 6px">Message</h3>
        <p style="font-size:14px;white-space:pre-wrap;margin:0">${esc(inquiry.message)}</p>
        ${
          links.length
            ? `<h3 style="font-size:14px;margin:18px 0 6px">Attachments</h3>
               <ul style="font-size:14px;margin:0;padding-left:18px">
                 ${links.map((l) => `<li><a href="${esc(l.url)}">${esc(l.name)}</a> (link valid 7 days)</li>`).join("")}
               </ul>`
            : ""
        }
      </div>`;

    const text = [
      "New website inquiry (visitor without a client account — not in Client Intake)",
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      "Message:",
      inquiry.message,
      ...(links.length
        ? ["", "Attachments (links valid 7 days):", ...links.map((l) => `${l.name}: ${l.url}`)]
        : []),
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: inquiry.email,
        subject: `New website inquiry — ${inquiry.name} (${inquiry.inquiry_number})`,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Resend rejected the message", res.status, detail);
      // Release the claim so a later attempt can still deliver it.
      await admin.from("inquiries").update({ firm_notified_at: null }).eq("id", inquiry.id);
      claimedId = null;
      return json({ ok: false, error: "Email provider rejected the message" }, 502);
    }

    return json({ ok: true, sent: true });
  } catch (e) {
    console.error("notify-inquiry failed", e);
    // Release the claim: whatever broke, the inquiry has not been emailed and a
    // retry must be able to pick it up.
    if (claimedId && admin) {
      try {
        await admin.from("inquiries").update({ firm_notified_at: null }).eq("id", claimedId);
      } catch (releaseError) {
        console.error("could not release the claim", releaseError);
      }
    }
    return json({ ok: false, error: "Unexpected error" }, 500);
  }
});
