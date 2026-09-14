// ============================================================================

// Forgot Password Page

// ============================================================================

// Allows users to request a password reset email

// ============================================================================

import { useState } from "react";

import { supabase } from "@/lib/supabase";

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

interface ForgotPasswordPageProps {
  onNavigate: (page: Page) => void;
}

export default function ForgotPasswordPage({ onNavigate }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");

  const [error, setError] = useState("");

  const [success, setSuccess] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (!email) {
      setError("Please enter your email address");

      return;
    }

    // Basic email validation

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");

      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setSuccess(true);
    } catch (error: any) {
      console.error("Password reset request error:", error);

      // Don't reveal if email exists or not for security

      // Show success message regardless to prevent email enumeration

      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1f3c] via-[#162d52] to-[#0d1f3c] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#c9a84c]/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">Forgot Password?</h1>
          <p className="text-white/70 text-sm">Enter your email and we'll send you a reset link</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <span className="text-3xl">📧</span>
              </div>
              <h2 className="text-xl font-semibold text-[#0d1f3c] mb-2">Check Your Email</h2>
              <p className="text-sm text-[#8a9ab5] mb-6">
                If an account exists with <strong className="text-[#0d1f3c]">{email}</strong>,
                you'll receive password reset instructions shortly.
              </p>
              <p className="text-xs text-[#8a9ab5] mb-6">
                Don't see the email? Check your spam folder or try again.
              </p>
              <button
                onClick={() => onNavigate("auth")}
                className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-colors"
              >
                Back to Login
              </button>
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

              {/* Info Message */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  💡 You'll receive an email with a link to reset your password. The link expires
                  after 60 minutes.
                </p>
              </div>

              {/* Email Input */}
              <div>
                <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-2.5 border border-[#e8e4dc] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a84c] transition-all text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                  placeholder="Enter your email address"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              {/* Back to Login */}
              <div className="text-center pt-4 border-t border-[#e8e4dc]">
                <button
                  type="button"
                  onClick={() => onNavigate("auth")}
                  className="text-sm text-[#8a9ab5] hover:text-[#0d1f3c] hover:underline"
                >
                  ← Back to Login
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/50">Westwood Law Firm - Secure Password Recovery</p>
        </div>
      </div>
    </div>
  );
}
