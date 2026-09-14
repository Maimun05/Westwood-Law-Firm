// ============================================================================

// Reset Password Page

// ============================================================================

// Allows users to set a new password after clicking the reset link from email

// ============================================================================

import { useState, useEffect } from "react";

import { supabase } from "@/lib/supabase";

import { logAuditEvent } from "@/lib/services/audit";

type Page =
  | "home"
  | "about"
  | "expertise"
  | "lawyers"
  | "specialists"
  | "insights-resources"
  | "contact"
  | "inquiry"
  | "consultation"
  | "portal"
  | "auth";

interface ResetPasswordPageProps {
  onNavigate: (page: Page) => void;
}

export default function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  const [loading, setLoading] = useState(false);

  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    // Check if we have a valid session from the password reset link

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setValidSession(true);
      } else {
        setError("Invalid or expired reset link. Please request a new password reset.");
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    // Validation

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");

      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");

      return;
    }

    setLoading(true);

    try {
      // Update the password

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      // Log the password reset

      await logAuditEvent(
        "PASSWORD_CHANGED",

        "Password reset successfully completed",

        {
          resource_type: "authentication",

          success: true,
        },
      );

      setSuccess(true);

      // Redirect to login after 2 seconds

      setTimeout(() => {
        onNavigate("auth");
      }, 2000);
    } catch (error: any) {
      console.error("Password reset error:", error);

      setError(error.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!validSession && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0d1f3c] via-[#162d52] to-[#0d1f3c] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/70 text-sm">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1f3c] via-[#162d52] to-[#0d1f3c] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#c9a84c]/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">Reset Your Password</h1>
          <p className="text-white/70 text-sm">Enter your new password below</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <span className="text-3xl">✓</span>
              </div>
              <h2 className="text-xl font-semibold text-[#0d1f3c] mb-2">
                Password Reset Successful!
              </h2>
              <p className="text-sm text-[#8a9ab5] mb-6">
                Your password has been updated. Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <span className="text-red-500 text-sm">⚠️</span>
                  <p className="text-red-700 text-xs leading-relaxed">{error}</p>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                  New Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading || !validSession}
                  className="w-full px-4 py-2.5 border border-[#e8e4dc] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a84c] transition-all text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  placeholder="Enter your new password"
                  minLength={6}
                />
                <p className="text-xs text-[#8a9ab5] mt-1">Minimum 6 characters</p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading || !validSession}
                  className="w-full px-4 py-2.5 border border-[#e8e4dc] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a84c] transition-all text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  placeholder="Confirm your new password"
                  minLength={6}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !validSession}
                className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Resetting Password..." : "Reset Password"}
              </button>

              {/* Back to Login */}
              <div className="text-center pt-4 border-t border-[#e8e4dc]">
                <button
                  type="button"
                  onClick={() => onNavigate("auth")}
                  className="text-sm text-[#8a9ab5] hover:text-[#0d1f3c] hover:underline"
                >
                  Back to Login
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/50">Westwood Law Firm - Secure Password Reset</p>
        </div>
      </div>
    </div>
  );
}
