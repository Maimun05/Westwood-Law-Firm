import { supabase, handleSupabaseError } from "./supabase";

import type { User } from "@supabase/supabase-js";

import { logAuditEvent } from "./services/audit";

import type { Database } from "./database.types";

export interface AuthUser {
  id: string;

  email: string;

  fullName: string;

  name: string; // alias for fullName for compatibility

  phone: string | null;

  role: "client" | "lawyer" | "admin";

  status?: string;

  dateCreated?: string;

  position?: string;

  lawyerId?: string;

  user_metadata?: {
    full_name?: string;

    phone?: string;

    address?: string;

    city?: string;

    date_of_birth?: string;

    [key: string]: any;
  };
}

export interface SignUpData {
  email: string;

  password: string;

  fullName?: string;

  firstName?: string;

  middleName?: string;

  lastName?: string;

  suffix?: string;

  phone?: string;

  address?: string;

  city?: string;

  dateOfBirth?: string;
}

// Sign up with email and password - OTP verification required

export async function signUp(data: SignUpData) {
  try {
    console.log("🔐 [SignUp] Starting signup for:", data.email);

    // Accept either name parts or a single full name (older callers): split the full name.

    if (!data.firstName || !data.lastName) {
      const parts = (data.fullName || "").trim().split(/\s+/).filter(Boolean);

      data = {
        ...data,

        firstName: data.firstName || parts[0] || "",

        lastName: data.lastName || (parts.length > 1 ? parts[parts.length - 1] : ""),

        middleName:
          data.middleName ?? (parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined),
      };
    }

    if (!data.firstName || !data.lastName) {
      return { data: null, error: "Please enter your first and last name." };
    }

    // Sign up WITHOUT email confirmation link - will use OTP instead

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,

      password: data.password,

      options: {
        // Do NOT use emailRedirectTo - we're using OTP verification

        data: {
          first_name: data.firstName!.trim(),

          middle_name: data.middleName?.trim() || null,

          last_name: data.lastName!.trim(),

          suffix: data.suffix?.trim() || null,

          full_name: [data.firstName, data.middleName, data.lastName]
            .map((p) => p?.trim())
            .filter(Boolean)
            .join(" "),

          phone: data.phone || null,

          address: data.address || null,

          city: data.city || null,

          date_of_birth: data.dateOfBirth || null,
        },
      },
    });

    if (error) {
      console.error("❌ [SignUp] Error:", error);

      throw error;
    }

    // Supabase may return an obfuscated empty user for an existing email.

    if (authData.user && authData.user.identities?.length === 0) {
      return {
        data: null,

        error: "An account with this email already exists. Please sign in instead.",
      };
    }

    console.log("✅ [SignUp] Success:", {
      userId: authData.user?.id,

      email: authData.user?.email,

      emailConfirmedAt: authData.user?.email_confirmed_at,

      hasIdentities: !!authData.user?.identities?.length,

      session: !!authData.session,
    });

    // Note: User is created but email is NOT verified yet

    // They must verify with OTP before session is active

    // The profile will be created by database trigger

    // Log the signup event (but not verified yet)

    if (authData.user) {
      await logAuditEvent(
        "ACCOUNT_CREATED",
        `New account registered (pending verification): ${data.email}`,
        {
          resource_type: "user",

          resource_id: authData.user.id,

          metadata: {
            registration_method: "email_password_otp",

            verified: false,
          },
        },
      );
    }

    return { data: authData, error: null };
  } catch (error: any) {
    return { data: null, error: handleSupabaseError(error) };
  }
}

// Verify OTP code

export async function verifyOTP(email: string, token: string) {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,

      token,

      type: "email",
    });

    if (error) throw error;

    // Log successful verification

    if (data.user) {
      await logAuditEvent("EMAIL_VERIFIED", `Email verified successfully: ${email}`, {
        resource_type: "user",

        resource_id: data.user.id,
      });
    }

    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: handleSupabaseError(error) };
  }
}

// Resend OTP code

export async function resendOTP(email: string) {
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",

      email,
    });

    if (error) throw error;

    // Log resend event

    await logAuditEvent("EMAIL_VERIFICATION_SENT", `Verification code resent: ${email}`, {
      resource_type: "verification",
    });

    return { error: null };
  } catch (error: any) {
    return { error: handleSupabaseError(error) };
  }
}

// How many digits is the emailed verification code?

//

// Supabase's `mailer_otp_length` is a server-side setting and the app used to

// hardcode 8, so when the project was left at the default of 6 every new

// registration dead-ended on "invalid code".

//

// GET /auth/v1/settings is public (it is what the hosted login page reads), so

// this needs no credentials beyond the anon key already in the bundle.

// NOTE (verified against the live project 2026-09-30): that endpoint does NOT

// actually return `mailer_otp_length` — its keys are external, disable_signup,

// mailer_autoconfirm, phone_autoconfirm, sms_provider, saml_enabled, … So in

// practice this always falls back to DEFAULT_OTP_LENGTH. The read stays in

// case Supabase exposes it again; the OTP screen also resizes on paste, so a

// server configured to anything else still works.

const DEFAULT_OTP_LENGTH = 6;

let cachedOtpLength: number | null = null;

export async function getEmailOtpLength(): Promise<number> {
  if (cachedOtpLength !== null) return cachedOtpLength;

  const base = import.meta.env.VITE_SUPABASE_URL;

  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: key },
    });

    if (res.ok) {
      const settings = await res.json();

      const len = Number(settings?.mailer_otp_length);

      if (Number.isInteger(len) && len >= 4 && len <= 10) {
        cachedOtpLength = len;

        return len;
      }
    }
  } catch {
    // Offline, blocked, or the endpoint moved. The default below is what
    // Supabase uses when mailer_otp_length is unset, which is the common case.
  }

  cachedOtpLength = DEFAULT_OTP_LENGTH;

  return cachedOtpLength;
}

// Sign in with email and password

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,

      password,
    });

    if (error) throw error;

    // Check if email is verified

    if (data.user && !data.user.email_confirmed_at) {
      // Email not verified - return special error

      return {
        data: null,

        error: "EMAIL_NOT_VERIFIED",

        user: data.user, // Return user for resend functionality
      };
    }

    // Deactivated accounts must not get a session.

    //

    // The database already denies them everything (private.get_user_role() and

    // friends return nothing when is_active is false), but without this check

    // they would still land in the portal and see a wall of failed queries.

    // Sign them straight back out and say why.

    if (data.user) {
      const { data: profile } = await supabase

        .from("profiles")

        .select("is_active, deleted_at")

        .eq("id", data.user.id)

        .maybeSingle();

      if (profile && (profile.is_active === false || profile.deleted_at !== null)) {
        await supabase.auth.signOut();

        return {
          data: null,

          error: "ACCOUNT_DEACTIVATED",

          user: data.user,
        };
      }
    }

    // Log the login event

    if (data.user) {
      await logAuditEvent("LOGIN", `User logged in: ${email}`, {
        resource_type: "session",

        resource_id: data.session?.access_token,
      });
    }

    return { data, error: null };
  } catch (error: any) {
    // Log failed login attempt

    await logAuditEvent("LOGIN", `Failed login attempt: ${email}`, {
      success: false,

      metadata: { error: error.message },
    }).catch(() => {});

    return { data: null, error: handleSupabaseError(error) };
  }
}

// Sign out

export async function signOut() {
  try {
    // Log logout before signing out

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await logAuditEvent("LOGOUT", `User logged out: ${user.email}`);
    }

    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: handleSupabaseError(error) };
  }
}

// Get current user

export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

// Get current user profile

export async function getCurrentUserProfile(): Promise<AuthUser | null> {
  try {
    const user = await getCurrentUser();

    if (!user) return null;

    const { data, error } = await supabase

      .from("profiles")

      .select("id, email, full_name, phone, role, is_active, deleted_at, created_at, position")

      .eq("id", user.id)

      .single();

    if (error) {
      console.error("Error fetching user profile:", error);

      // Profile might not exist yet for new signups

      // Return null but don't throw - let the retry logic handle it

      return null;
    }

    if (!data) {
      console.warn("Profile data is null for user:", user.id);

      return null;
    }

    // A deactivated or soft-deleted account keeps a valid JWT until it expires,

    // so a restored session would otherwise sail into the portal. Drop it here,

    // which is the one place every caller reads the profile through.

    if (data.is_active === false || data.deleted_at !== null) {
      await supabase.auth.signOut();

      return null;
    }

    return {
      id: data.id,

      email: data.email,

      fullName: data.full_name,

      name: data.full_name,

      phone: data.phone,

      role: data.role,

      status: data.is_active ? "active" : "inactive",

      dateCreated: data.created_at,

      position: data.position ?? undefined,

      lawyerId: data.id, // placeholder - would need lawyer table join
    };
  } catch (error) {
    console.error("Unexpected error fetching user profile:", error);

    return null;
  }
}

// Update the signed-in user's own profile.

// Every change is recorded in audit_logs by the database trigger (old and new values),

// and the database refuses role/email/status changes from non-admins.

export interface ProfileUpdates {
  firstName?: string;

  middleName?: string | null;

  lastName?: string;

  suffix?: string | null;

  phone?: string | null;

  address?: string | null;

  city?: string | null;

  dateOfBirth?: string | null;

  // lawyers only (shown on the public lawyer page)

  bio?: string | null;

  education?: { school: string; degree: string; year?: string }[];
}

export async function updateProfile(updates: ProfileUpdates) {
  try {
    const user = await getCurrentUser();

    if (!user) throw new Error("No user logged in");

    if (updates.dateOfBirth) {
      const dob = new Date(updates.dateOfBirth);

      if (Number.isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900) {
        throw new Error("Please enter a valid birthday.");
      }
    }

    if (updates.firstName !== undefined && !updates.firstName.trim())
      throw new Error("First name is required.");

    if (updates.lastName !== undefined && !updates.lastName.trim())
      throw new Error("Last name is required.");

    const row: Database["public"]["Tables"]["profiles"]["Update"] = {};

    const set = (col: keyof Database["public"]["Tables"]["profiles"]["Update"], v: unknown) => {
      if (v !== undefined)
        (row as Record<string, unknown>)[col] = typeof v === "string" ? v.trim() || null : v;
    };

    set("first_name", updates.firstName);

    set("middle_name", updates.middleName);

    set("last_name", updates.lastName);

    set("suffix", updates.suffix);

    set("phone", updates.phone);

    set("address", updates.address);

    set("city", updates.city);

    set("date_of_birth", updates.dateOfBirth);

    set("bio", updates.bio);

    set("education", updates.education);

    // full_name is rebuilt by the database from the name parts

    const { error } = await supabase.from("profiles").update(row).eq("id", user.id);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: handleSupabaseError(error) };
  }
}

// Reset password

export async function resetPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: handleSupabaseError(error) };
  }
}

// Update password

export async function updatePassword(newPassword: string) {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    return { error: handleSupabaseError(error) };
  }
}

// Listen to auth state changes

export function onAuthStateChange(callback: (user: User | null) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return subscription;
}
