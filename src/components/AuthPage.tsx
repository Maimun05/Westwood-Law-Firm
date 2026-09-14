// ============================================================================

// Authentication Page

// ============================================================================

// Unified authentication page with Login ↔ Register transition.

// Uses OTP email verification for registration; the code length is a

// Supabase project setting (Auth → Email OTP Length), not an app constant.

// ============================================================================

import { useState } from "react";

import { signIn, signUp, verifyOTP, resendOTP } from "@/lib/auth";

import OTPVerification from "@/components/OTPVerification";

import type { Page } from "@/types/navigation";

type AuthPageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;

  initialMode?: "login" | "register";
};

export default function AuthPage({ onNavigate, initialMode = "login" }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "verify">(initialMode);

  const [formData, setFormData] = useState({
    email: "",

    password: "",

    confirmPassword: "",

    firstName: "",

    middleName: "",

    lastName: "",

    suffix: "",

    dateOfBirth: "",

    city: "",

    phone: "",
  });

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (mode === "login") {
      // Login

      if (!formData.email || !formData.password) {
        setError("Please enter your email and password.");

        return;
      }

      setLoading(true);

      const {
        data,
        error: signInError,
        user,
      } = (await signIn(formData.email, formData.password)) as any;

      setLoading(false);

      if (signInError === "EMAIL_NOT_VERIFIED") {
        // Email not verified - show verification screen

        setPendingVerificationEmail(formData.email);

        setMode("verify");

        setError("");

        return;
      }

      if (signInError === "ACCOUNT_DEACTIVATED") {
        setError(
          "This account has been deactivated. Please contact the firm if you believe this is a mistake.",
        );

        return;
      }

      if (signInError) {
        setError(signInError);

        return;
      }

      if (data) {
        // Auth successful, navigate to portal

        onNavigate("portal");
      }
    } else {
      // Register

      if (
        !formData.email ||
        !formData.password ||
        !formData.confirmPassword ||
        !formData.firstName.trim() ||
        !formData.lastName.trim()
      ) {
        setError("Please fill in all required fields.");

        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");

        return;
      }

      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters.");

        return;
      }

      if (
        formData.dateOfBirth &&
        (new Date(formData.dateOfBirth) > new Date() ||
          new Date(formData.dateOfBirth).getFullYear() < 1900)
      ) {
        setError("Please enter a valid birthday.");

        return;
      }

      setLoading(true);

      const { data, error: signUpError } = await signUp({
        email: formData.email,

        password: formData.password,

        firstName: formData.firstName,

        middleName: formData.middleName || undefined,

        lastName: formData.lastName,

        suffix: formData.suffix || undefined,

        dateOfBirth: formData.dateOfBirth || undefined,

        city: formData.city || undefined,

        phone: formData.phone || undefined,
      });

      setLoading(false);

      if (signUpError) {
        // Check if account already exists

        if (signUpError.includes("already registered") || signUpError.includes("already exists")) {
          setError(
            "An account with this email already exists. Please sign in or use a different email.",
          );
        } else {
          setError(signUpError);
        }

        return;
      }

      if (data) {
        // Registration successful - show OTP verification screen

        setPendingVerificationEmail(formData.email);

        setMode("verify");

        setError("");
      }
    }
  };

  const handleVerifyOTP = async (code: string) => {
    setError("");

    setLoading(true);

    const { data, error: verifyError } = await verifyOTP(pendingVerificationEmail, code);

    setLoading(false);

    if (verifyError) {
      // User-friendly error messages

      if (verifyError.includes("expired") || verifyError.includes("invalid")) {
        setError(
          "Invalid or expired verification code. Please check the code in your email or request a new one.",
        );
      } else if (verifyError.includes("too many")) {
        setError("Too many verification attempts. Please wait a few minutes and try again.");
      } else {
        setError("Unable to verify your email. Please try again or request a new code.");
      }

      return;
    }

    if (data) {
      // Verification successful - navigate to portal

      onNavigate("portal");
    }
  };

  const handleResendOTP = async () => {
    setError("");

    const { error: resendError } = await resendOTP(pendingVerificationEmail);

    if (resendError) {
      setError("Unable to resend verification code. Please try again.");

      throw new Error(resendError);
    }
  };

  const handleChangeEmail = () => {
    // Go back to register mode

    setMode("register");

    setPendingVerificationEmail("");

    setError("");
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");

    setError("");

    setFormData({
      email: "",

      password: "",

      confirmPassword: "",

      firstName: "",

      middleName: "",

      lastName: "",

      suffix: "",

      dateOfBirth: "",

      city: "",

      phone: "",
    });

    setShowPassword(false);

    setShowConfirmPassword(false);
  };

  // Show OTP verification screen

  if (mode === "verify") {
    return (
      <OTPVerification
        email={pendingVerificationEmail}
        onVerify={handleVerifyOTP}
        onResend={handleResendOTP}
        onChangeEmail={handleChangeEmail}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1f3c] via-[#162d52] to-[#0d1f3c] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => onNavigate("home")}
            className="text-white/60 hover:text-white text-sm mb-4 inline-flex items-center gap-2"
          >
            ← Back to Home
          </button>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h1>
          <p className="text-white/70 text-sm">
            {mode === "login"
              ? "Sign in to access your Westwood LegalConnect portal"
              : "Join Westwood LegalConnect to manage your legal matters"}
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name parts (Register Only) */}
            {mode === "register" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder="Juan"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder="Dela Cruz"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      Middle Name
                    </label>
                    <input
                      type="text"
                      value={formData.middleName}
                      onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      Suffix
                    </label>
                    <input
                      type="text"
                      value={formData.suffix}
                      onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder="Jr., III (optional)"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      Birthday
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          dateOfBirth: e.target.value,
                        })
                      }
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder=""
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      disabled={loading}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                      placeholder="e.g. San Juan City"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={loading}
                className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                placeholder="you@example.com"
              />
            </div>

            {/* Phone (Register Only) */}
            {mode === "register" && (
              <div>
                <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={loading}
                  className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
                  placeholder="+63 9XX XXX XXXX"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={loading}
                  className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50 pr-10"
                  placeholder={mode === "login" ? "Enter your password" : "Minimum 6 characters"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Confirm Password (Register Only) */}
            {mode === "register" && (
              <div>
                <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmPassword: e.target.value,
                      })
                    }
                    disabled={loading}
                    className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-2.5 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50 pr-10"
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <span className="text-red-500 text-sm">⚠️</span>
                <p className="text-red-700 text-xs leading-relaxed">{error}</p>
              </div>
            )}

            {/* Verification Notice (Register Only) */}
            {mode === "register" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  📧 You'll receive a verification code after registration. Enter the code to
                  activate your account.
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? mode === "login"
                  ? "Signing In..."
                  : "Creating Account..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          {/* Forgot Password (Login Only) */}
          {mode === "login" && (
            <div className="mt-4 text-center">
              <button
                onClick={() => onNavigate("forgot-password")}
                className="text-sm text-[#8a9ab5] hover:text-[#0d1f3c] hover:underline"
              >
                Forgot your password?
              </button>
            </div>
          )}

          {/* Mode Switch */}
          <div className="mt-6 pt-6 border-t border-[#e8e4dc] text-center">
            <p className="text-sm text-[#8a9ab5]">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button onClick={switchMode} className="text-[#c9a84c] hover:underline font-semibold">
                {mode === "login" ? "Create Account" : "Sign In"}
              </button>
            </p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/50 leading-relaxed">
            By continuing, you agree to Westwood Law Firm's Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
