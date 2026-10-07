// ============================================================================
// admin-create-user — create staff accounts with emailed credentials
// ============================================================================
// Two actions, both admin-only (the caller's JWT is resolved and its profile
// must be role = 'admin' before anything else happens):
//
//   action: "create"  Create an account.
//     - role = client  The admin supplies the password; nothing is emailed.
//     - role = lawyer/admin
//                      The password is generated here with a CSPRNG, the
//                      profile is flagged `must_change_password`, and the
//                      credentials are emailed to the new user. The portal
//                      refuses to let them past the sign-in screen until they
//                      replace it.
//
//   action: "resend"  Issue a fresh temporary password for an existing staff
//                      account and email it again. Supabase Auth only stores
//                      the password hashed, so a resend cannot repeat the
//                      original — it always mints a new one and re-arms the
//                      forced change.
//
// The password is NEVER returned in the response and NEVER logged. The only
// place it exists in plaintext is the outbound email.
//
// Ordering (create): the auth user is created first, then the profile is
// updated with the role + the must_change_password flag. That profile write is
// FATAL — if it fails the auth user is deleted again, so we can never end up
// emailing a temporary password for an account that is not gated behind a
// forced change.
//
// Email goes out over Gmail SMTP with an App Password (same account and secrets
// as send-seminar-email). Resend is not an option: westwoodlaw.ph's DNS is
// parked, so no verified sending domain exists.
//
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD, and optionally SITE_URL (the login
// link falls back to the request's Origin header, then to the public site).
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type Role = "client" | "lawyer" | "admin";
const ROLES: Role[] = ["client", "lawyer", "admin"];

interface CreateRequest {
  action?: "create" | "resend";
  email?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  phone?: string;
  address?: string;
  city?: string;
  dateOfBirth?: string;
  position?: string;
  userId?: string;
}

const PASSWORD_LENGTH = 16;

// Ambiguous glyphs (0/O, 1/l/I) are left out: the password is read from an
// email and retyped by hand, and a misread character is an avoidable support
// call. Modulo bias against a 70-character alphabet is far too small to matter
// for a credential that is single-use and rotated on first login anyway.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

function generateTemporaryPassword(): string {
  const bytes = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

/** A short, friendly greeting name — the first word of the full name. */
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function renderEmail(opts: {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  resent: boolean;
}): { subject: string; text: string; html: string } {
  const { name, email, password, loginUrl, resent } = opts;
  const subject = resent
    ? "Your new Westwood Law Firm portal password"
    : "Your Westwood Law Firm portal account";

  const intro = resent
    ? "A new temporary password has been issued for your Westwood Law Firm portal account."
    : "An account has been created for you on the Westwood Law Firm client portal.";

  const text = [
    `Hello ${name},`,
    "",
    intro,
    "",
    `Sign-in page: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "",
    "For your security you will be asked to choose a new password the first time you sign in.",
    "",
    "If you were not expecting this, please contact the firm.",
    "",
    "Westwood Law Firm",
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0d1f3c;max-width:600px;font-size:14px;line-height:1.6">
  <div style="background:#0d1f3c;padding:20px 24px;border-radius:12px 12px 0 0">
    <p style="margin:0;color:#c9a84c;font-size:12px;letter-spacing:2px;text-transform:uppercase">Westwood Law Firm</p>
    <p style="margin:6px 0 0;color:#ffffff;font-size:18px;font-weight:bold">${resent ? "Your new password" : "Your portal account"}</p>
  </div>
  <div style="border:1px solid #e8e4dc;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="margin:0 0 12px">Hello ${esc(name)},</p>
    <p style="margin:0 0 16px">${esc(intro)}</p>
    <div style="background:#f7f5f0;border:1px solid #e8e4dc;border-radius:8px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 8px"><span style="color:#8a9ab5">Email:</span> <strong>${esc(email)}</strong></p>
      <p style="margin:0"><span style="color:#8a9ab5">Temporary password:</span> <strong style="font-family:monospace;font-size:15px">${esc(password)}</strong></p>
    </div>
    <p style="margin:0 0 16px">Sign in at <a href="${esc(loginUrl)}" style="color:#a8812c">${esc(loginUrl)}</a></p>
    <p style="margin:0 0 16px;background:#fbf7ea;border:1px solid #efe2bd;border-radius:8px;padding:12px">For your security you will be asked to choose a new password the first time you sign in.</p>
    <p style="margin:0;color:#8a9ab5;font-size:12px">If you were not expecting this, please contact the firm.</p>
  </div>
</div>`;

  return { subject, text, html };
}

async function sendCredentialsEmail(opts: {
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  resent: boolean;
}): Promise<{ sent: boolean; error: string | null }> {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!gmailUser || !gmailPassword) {
    return { sent: false, error: "Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)" };
  }

  const { subject, text, html } = renderEmail(opts);
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transport.sendMail({
      from: `Westwood Law Firm <${gmailUser}>`,
      to: opts.email,
      replyTo: gmailUser,
      subject,
      text,
      html,
    });
    return { sent: true, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Gmail rejected a credentials email for", opts.email, detail);
    return { sent: false, error: detail.slice(0, 200) };
  } finally {
    transport.close();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized: Not authenticated" }, 401);

    // Verify the caller with their own token before touching the service key.
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized: Not authenticated" }, 401);

    const { data: caller } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!caller || caller.role !== "admin") {
      return json({ error: "Unauthorized: Admin access required" }, 403);
    }

    const body: CreateRequest = await req.json().catch(() => ({}));
    const action = body.action === "resend" ? "resend" : "create";

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // The login link prefers an explicit SITE_URL, then the origin the admin's
    // browser is actually on (which is what the new user should be given), and
    // only then the public site as a last resort.
    const siteUrl = (
      Deno.env.get("SITE_URL") ??
      req.headers.get("Origin") ??
      "https://westwoodlaw.ph"
    ).replace(/\/+$/, "");
    const loginUrl = `${siteUrl}/auth`;

    if (action === "resend") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!userId) return json({ error: "A user is required" }, 400);

      const { data: target, error: targetError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (targetError || !target?.user?.email) {
        return json({ error: "That account could not be found" }, 404);
      }
      const email = target.user.email;

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, first_name")
        .eq("id", userId)
        .maybeSingle();

      if (targetProfile?.role === "client") {
        return json(
          {
            error:
              "Clients reset their own password from the sign-in page. Credentials can only be re-sent to lawyer and admin accounts.",
          },
          400,
        );
      }

      const fullName =
        targetProfile?.full_name || target.user.user_metadata?.full_name || email.split("@")[0];
      const name = firstNameOf(String(fullName));

      const temporaryPassword = generateTemporaryPassword();
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
      });
      if (passwordError) {
        console.error("Password reset failed for", userId, passwordError);
        return json({ error: `Could not reset the password: ${passwordError.message}` }, 400);
      }

      const { error: flagError } = await supabaseAdmin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", userId);
      if (flagError) {
        console.error("Could not re-arm the forced password change for", userId, flagError);
        return json(
          {
            error: `The password was reset but the account could not be flagged: ${flagError.message}`,
          },
          500,
        );
      }

      const { sent, error } = await sendCredentialsEmail({
        name,
        email,
        password: temporaryPassword,
        loginUrl,
        resent: true,
      });

      return json({ success: true, email, emailSent: sent, emailError: error });
    }

    // ── action: create ────────────────────────────────────────────────────────
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const role = body.role;
    const position = typeof body.position === "string" ? body.position.trim() : "";

    if (!email || !fullName || !role) {
      return json({ error: "Missing required fields: email, fullName, role" }, 400);
    }
    if (!ROLES.includes(role)) {
      return json({ error: "Invalid role. Must be client, lawyer, or admin" }, 400);
    }

    const isStaff = role !== "client";
    const suppliedPassword = typeof body.password === "string" ? body.password : "";

    if (!isStaff) {
      if (!suppliedPassword) {
        return json({ error: "A password is required for client accounts" }, 400);
      }
      if (suppliedPassword.length < 6) {
        return json({ error: "Password must be at least 6 characters" }, 400);
      }
    }

    // Staff get a generated password; clients get the admin's.
    const password = isStaff ? generateTemporaryPassword() : suppliedPassword;

    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? fullName;
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : null;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        full_name: fullName,
        phone: body.phone || null,
        address: body.address || null,
        city: body.city || null,
        date_of_birth: body.dateOfBirth || null,
      },
    });

    if (authError) {
      console.error("Auth creation error:", authError);
      if (authError.message.includes("already registered")) {
        return json({ error: "An account with this email already exists" }, 409);
      }
      return json({ error: `Failed to create user: ${authError.message}` }, 400);
    }

    if (!authData.user) {
      return json({ error: "User created but no user data returned" }, 500);
    }

    const newUserId = authData.user.id;

    // The trigger creates the profile as 'client'. This write sets the real
    // role and — for staff — the forced-change flag. It is FATAL: an account
    // that kept the 'client' role (or missed the flag) must not be handed a
    // temporary password, so the auth user is rolled back and the whole
    // creation fails.
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        role,
        must_change_password: isStaff,
        ...(position ? { position } : {}),
      })
      .eq("id", newUserId);

    if (profileError) {
      console.error("Profile update failed; rolling back", newUserId, profileError);
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUserId);
      if (rollbackError) {
        console.error("Rollback failed — orphaned auth user", newUserId, rollbackError);
      }
      return json(
        {
          error: rollbackError
            ? `The account could not be set up and may need manual cleanup: ${profileError.message}`
            : `Failed to set up the account: ${profileError.message}`,
        },
        500,
      );
    }

    let emailSent = false;
    let emailError: string | null = null;
    if (isStaff) {
      const result = await sendCredentialsEmail({
        name: firstNameOf(fullName),
        email,
        password,
        loginUrl,
        resent: false,
      });
      emailSent = result.sent;
      emailError = result.error;
    }

    return json(
      {
        success: true,
        user: {
          id: newUserId,
          email: authData.user.email,
          fullName,
          role,
          position: position || null,
          created: true,
        },
        emailSent,
        emailError,
        mustChangePassword: isStaff,
      },
      201,
    );
  } catch (error) {
    console.error("Error in admin-create-user function:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return json({ error: detail || "An unexpected error occurred" }, 500);
  }
});
