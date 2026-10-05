// ============================================================================
// send-seminar-email — email every registrant of one seminar
// ============================================================================
// Called from the admin portal (Website Content → Seminars → Registrants).
// The admin composes the subject and the body in a dialog; this function does
// the sending, so RESEND_API_KEY never reaches the browser.
//
// Auth is the admin-create-user shape: resolve the caller's JWT to a user
// (401), require profiles.role = 'admin' (403), and only then build the
// service-role client. That client reads the registrants — inquiries rows are
// not admin-readable by email through RLS — and writes the send log.
//
// Sending is sequential, one request per recipient, ~150 ms apart. Resend's
// batch endpoint needs an audience, and the log has to say which address
// failed and why. 429 responses are honoured through Retry-After and retried
// once. At most 250 recipients per call: a bigger list would run past the
// edge function's wall clock and should be split.
//
// The message is one template with a single {name} placeholder, replaced per
// recipient (an empty name falls back to the address's local part).
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY      (required) API key from resend.com
//   SEMINAR_FROM_EMAIL  (optional) e.g. "Westwood Law Firm <seminars@westwoodlaw.ph>".
//                       Falls back to INQUIRY_FROM_EMAIL, then Resend's
//                       onboarding sender — which only delivers to the Resend
//                       account owner, so bulk sending needs a verified domain.
//   SEMINAR_REPLY_TO    (optional) defaults to INQUIRY_TO_EMAIL, then
//                       westwoodlawfirm1@gmail.com.
//
// Deploy AFTER migration 20261013 adds inquiries.seminar_id:
//   supabase functions deploy send-seminar-email
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

// The admin's body is plain text and lands in an HTML email.
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Blank-line-separated paragraphs; single newlines become <br>.
function renderHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0d1f3c;max-width:640px;font-size:14px;line-height:1.6">
    ${paragraphs
      .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("")}
  </div>`;
}

const MAX_RECIPIENTS = 250;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Not authenticated" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ ok: false, error: "Not authenticated" }, 401);

    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return json({ ok: false, error: "Admin access is required" }, 403);
    }

    const payload = await req.json().catch(() => ({}));
    const seminarId = typeof payload?.seminarId === "string" ? payload.seminarId.trim() : "";
    // Header injection is not possible through JSON, but a stray newline in a
    // subject still breaks the rendered message — refuse it outright.
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";

    if (!seminarId || seminarId.length > 100) {
      return json({ ok: false, error: "A seminar is required" }, 400);
    }
    if (!subject || subject.length > MAX_SUBJECT || /[\r\n]/.test(subject)) {
      return json(
        { ok: false, error: `The subject must be one line of at most ${MAX_SUBJECT} characters` },
        400,
      );
    }
    if (!message || message.length > MAX_MESSAGE) {
      return json(
        { ok: false, error: `The message must be between 1 and ${MAX_MESSAGE} characters` },
        400,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: seminar, error: seminarError } = await admin
      .from("seminar_events")
      .select("id, title")
      .eq("id", seminarId)
      .maybeSingle();
    if (seminarError) throw new Error(`could not load the seminar: ${seminarError.message}`);
    if (!seminar) return json({ ok: false, error: "That seminar no longer exists" }, 404);

    const { data: rows, error: rowsError } = await admin
      .from("inquiries")
      .select("name, email")
      .eq("seminar_id", seminarId)
      .order("created_at", { ascending: true });
    if (rowsError) throw new Error(`could not load the registrants: ${rowsError.message}`);

    // One address is one recipient: the same person may have registered twice.
    const seen = new Set<string>();
    const recipients: { name: string; email: string }[] = [];
    for (const row of rows ?? []) {
      const email = String(row.email ?? "").trim();
      const key = email.toLowerCase();
      if (!email || seen.has(key)) continue;
      seen.add(key);
      recipients.push({ name: String(row.name ?? "").trim(), email });
    }

    if (recipients.length === 0) {
      return json({ ok: true, recipients: 0, sent: 0, failed: 0, failures: [] });
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return json(
        {
          ok: false,
          error: `This seminar has ${recipients.length} registrants. One send covers at most ${MAX_RECIPIENTS} — split the list.`,
        },
        400,
      );
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    const from =
      Deno.env.get("SEMINAR_FROM_EMAIL") ??
      Deno.env.get("INQUIRY_FROM_EMAIL") ??
      "Westwood Law Firm <onboarding@resend.dev>";
    const replyTo =
      Deno.env.get("SEMINAR_REPLY_TO") ??
      Deno.env.get("INQUIRY_TO_EMAIL") ??
      "westwoodlawfirm1@gmail.com";

    const failures: { email: string; error: string }[] = [];
    let sent = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      // {name} is the one placeholder the compose form offers. An empty name
      // falls back to the local part of the address, which still beats
      // greeting somebody with a literal "{name}". The replacer is a function
      // because a name containing $& or $' would otherwise be treated as a
      // substitution pattern by String.replace.
      const name = recipient.name || recipient.email.split("@")[0];
      const personalMessage = message.replace(/\{name\}/gi, () => name);
      const personalSubject = subject.replace(/\{name\}/gi, () => name);

      for (let attempt = 0; ; attempt++) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [recipient.email],
            reply_to: replyTo,
            subject: personalSubject,
            html: renderHtml(personalMessage),
            text: personalMessage,
          }),
        });

        if (res.ok) {
          sent++;
          break;
        }

        const detail = await res.text().catch(() => "");
        if (res.status === 429 && attempt === 0) {
          // Honour Retry-After, but never wait more than 10 s: the wall clock
          // is shared with every remaining recipient.
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 10_000)
              : 1000;
          await sleep(waitMs);
          continue;
        }

        console.error("Resend rejected a seminar email", res.status, detail);
        failures.push({
          email: recipient.email,
          error: `Resend ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        });
        break;
      }
      if (i < recipients.length - 1) await sleep(150);
    }

    // The log is the record of what happened; a failure to write it must not
    // hide the result of the sends.
    const { error: logError } = await admin.from("seminar_email_log").insert({
      seminar_id: seminarId,
      sent_by: user.id,
      subject,
      recipient_count: recipients.length,
      sent_count: sent,
      failed_count: failures.length,
      failures,
    });
    if (logError) console.error("could not write the seminar email log", logError);

    if (sent === 0) {
      return json(
        {
          ok: false,
          error: "The email provider rejected every message",
          recipients: recipients.length,
          sent,
          failed: failures.length,
          failures,
        },
        502,
      );
    }

    return json({
      ok: true,
      recipients: recipients.length,
      sent,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    console.error("send-seminar-email failed", e);
    return json({ ok: false, error: "Unexpected error" }, 500);
  }
});
