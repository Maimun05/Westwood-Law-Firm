// ============================================================================
// send-seminar-email — email every registrant of one seminar
// ============================================================================
// Called from the admin portal (Website Content → Seminars → Registrants).
// The admin composes the subject and the message in a dialog; this function
// does the sending, so the mailbox password never reaches the browser.
//
// SENDER: the firm's Gmail account, over SMTP with an App Password. Resend
// would have been the first choice, but Resend can only send from a verified
// domain, and westwoodlaw.ph's DNS is parked at ParkLogic with no way to
// publish the DKIM/SPF records — so a domain-verified sender is not available.
// Gmail needs no DNS: the account is already the firm's public contact
// address, and Google signs the messages on the way out. Port 465, because
// Supabase's runtime refuses outgoing connections to 25 and 587. Free Gmail
// allows roughly 500 recipients a day, which is why one send is capped at 200
// and the log records exactly what went out.
//
// Auth is the admin-create-user shape: resolve the caller's JWT to a user
// (401), require profiles.role = 'admin' (403), and only then build the
// service-role client. That client reads the registrants — inquiries rows are
// not admin-readable by email through RLS — and writes the send log.
//
// The message is one template with a single {name} placeholder, replaced per
// recipient (an empty name falls back to the address's local part).
//
// Secrets (Edge Function Secrets in the dashboard):
//   GMAIL_USER          westwoodlawfirm1@gmail.com
//   GMAIL_APP_PASSWORD  the 16-character App Password for that account.
//                       Google Account → Security → 2-Step Verification must
//                       be ON first: App Passwords do not exist without it.
//
// Deploy AFTER migration 20261013 adds inquiries.seminar_id.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Pinned to the major Supabase's own send-email-smtp example uses, so the
// Node-compat surface is one that is known to work in this runtime.
import nodemailer from "npm:nodemailer@^9";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The admin's message is plain text and lands in an HTML email.
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

const MAX_RECIPIENTS = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

// nodemailer's codes for "the mailbox is not reachable at all", as opposed to
// one address being rejected. Any of these means every remaining recipient
// would fail the same way, so the run stops instead of burning the wall clock.
const FATAL_SMTP_CODES = new Set(["EAUTH", "ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS"]);

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

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPassword) {
      throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set");
    }

    // Pooled: one TLS connection serves the whole run, with a pause between
    // messages so a burst of a few hundred does not look like a flood to
    // Google. maxMessages reconnects before Gmail closes the session itself.
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPassword },
      pool: true,
      maxConnections: 1,
      maxMessages: 50,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    const failures: { email: string; error: string }[] = [];
    let sent = 0;
    let fatal: string | null = null;

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

      try {
        await transport.sendMail({
          from: `Westwood Law Firm <${gmailUser}>`,
          to: recipient.email,
          replyTo: gmailUser,
          subject: personalSubject,
          text: personalMessage,
          html: renderHtml(personalMessage),
        });
        sent++;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Gmail rejected a seminar email", recipient.email, code, detail);
        failures.push({ email: recipient.email, error: detail.slice(0, 200) });

        if (code && FATAL_SMTP_CODES.has(code)) {
          fatal =
            code === "EAUTH"
              ? "Gmail refused the sign-in — check GMAIL_USER and GMAIL_APP_PASSWORD"
              : `Gmail could not be reached (${code})`;
          break;
        }
      }

      if (i < recipients.length - 1) await sleep(150);
    }

    transport.close();

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

    if (fatal) {
      return json(
        {
          ok: false,
          error: `${fatal}. ${sent} of ${recipients.length} had already been sent — the rest were not attempted.`,
          recipients: recipients.length,
          sent,
          failed: failures.length,
          failures,
        },
        502,
      );
    }

    if (sent === 0) {
      return json(
        {
          ok: false,
          error: "The mail provider rejected every message",
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
