// ============================================================================

// Email Verification Service

// ============================================================================

// Handles email verification for user registration and email updates.

// ============================================================================

import { supabase } from "@/lib/supabase";

/**
 * Resend verification email to user
 */

export async function resendVerificationEmail(email: string) {
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",

      email,
    });

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error("Error resending verification email:", error);

    return {
      error: error.message || "Failed to resend verification email",
    };
  }
}

/**
 * Check if current user's email is verified
 */

export async function checkEmailVerified() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { verified: false, error: "No user logged in" };
    }

    // Check email_confirmed_at field

    const verified = !!user.email_confirmed_at;

    return { verified, error: null };
  } catch (error: any) {
    console.error("Error checking email verification:", error);

    return {
      verified: false,

      error: error.message || "Failed to check email verification",
    };
  }
}

/**
 * Get verification status with user info
 */

export async function getVerificationStatus() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        user: null,

        verified: false,

        email: null,

        error: null,
      };
    }

    const verified = !!user.email_confirmed_at;

    return {
      user,

      verified,

      email: user.email,

      confirmedAt: user.email_confirmed_at,

      error: null,
    };
  } catch (error: any) {
    console.error("Error getting verification status:", error);

    return {
      user: null,

      verified: false,

      email: null,

      error: error.message || "Failed to get verification status",
    };
  }
}

/**
 * Handle email verification callback (called from verification link)
 * This is automatically handled by Supabase when user clicks verification link
 */

export async function handleVerificationCallback() {
  try {
    // Supabase automatically handles the token from URL

    // We just need to refresh the session

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    if (session?.user) {
      return {
        success: true,

        verified: !!session.user.email_confirmed_at,

        error: null,
      };
    }

    return { success: false, verified: false, error: "No session found" };
  } catch (error: any) {
    console.error("Error handling verification callback:", error);

    return {
      success: false,

      verified: false,

      error: error.message || "Failed to verify email",
    };
  }
}

/**
 * Request password reset email
 */

export async function requestPasswordReset(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error("Error requesting password reset:", error);

    return {
      error: error.message || "Failed to send password reset email",
    };
  }
}

/**
 * Update password (after reset or change)
 */

export async function updatePassword(newPassword: string) {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error("Error updating password:", error);

    return {
      error: error.message || "Failed to update password",
    };
  }
}
