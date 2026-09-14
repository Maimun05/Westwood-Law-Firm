// ============================================================================

// OTP Verification Component

// ============================================================================

// Email verification code input for Westwood Law Firm.

//

// The number of digits is NOT hardcoded. Supabase's `mailer_otp_length` is a

// server setting (default 6) and the app previously assumed 8, so every new

// registration failed at this screen. The length is now read from

// getEmailOtpLength() and the input adapts: it renders that many boxes, but a

// pasted code of any plausible length is accepted and resizes the boxes to

// match, so the screen still works if the server setting changes.

// ============================================================================

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react";

import { getEmailOtpLength } from "@/lib/auth";

// Anything outside this range is not an OTP.

const MIN_CODE_LENGTH = 4;

const MAX_CODE_LENGTH = 10;

interface OTPVerificationProps {
  email: string;

  onVerify: (code: string) => Promise<void>;

  onResend: () => Promise<void>;

  onChangeEmail: () => void;

  loading?: boolean;

  error?: string;

  /** Overrides the length detected from the server. Mainly for tests. */

  length?: number;
}

export default function OTPVerification({
  email,

  onVerify,

  onResend,

  onChangeEmail,

  loading = false,

  error = "",

  length,
}: OTPVerificationProps) {
  const [codeLength, setCodeLength] = useState(length ?? 6);

  const [otp, setOtp] = useState<string[]>(() => Array(length ?? 6).fill(""));

  const [resendCooldown, setResendCooldown] = useState(0);

  const [resendMessage, setResendMessage] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);

      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Ask the server how many digits the code has. Starts at 6 (the Supabase

  // default) so the screen is usable immediately, then corrects itself.

  useEffect(() => {
    if (length) return;

    let cancelled = false;

    getEmailOtpLength().then((len) => {
      if (cancelled) return;

      setCodeLength(len);

      setOtp((prev) => {
        if (prev.length === len) return prev;

        const next = Array(len).fill("");

        for (let i = 0; i < Math.min(prev.length, len); i++) next[i] = prev[i];

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [length]);

  // Focus first input on mount

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const submit = (code: string) => {
    if (code.length < MIN_CODE_LENGTH) return;

    void onVerify(code);
  };

  const handleChange = (index: number, value: string) => {
    // Only allow digits

    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];

    newOtp[index] = value;

    setOtp(newOtp);

    // Auto-focus next input

    if (value && index < newOtp.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit once every box is filled

    if (value && index === newOtp.length - 1 && newOtp.every((digit) => digit !== "")) {
      submit(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace

    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    // Handle Enter key to submit

    if (e.key === "Enter" && otp.every((digit) => digit !== "")) {
      e.preventDefault();

      submit(otp.join(""));
    }

    // Handle left/right arrow keys

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();

      inputRefs.current[index - 1]?.focus();
    }

    if (e.key === "ArrowRight" && index < otp.length - 1) {
      e.preventDefault();

      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");

    if (pasted.length < MIN_CODE_LENGTH || pasted.length > MAX_CODE_LENGTH) return;

    // Resize the boxes to whatever was pasted, so a code that does not match

    // the detected length is still visible and submittable.

    const digits = pasted.split("");

    setCodeLength(digits.length);

    setOtp(digits);

    inputRefs.current[digits.length - 1]?.focus();

    submit(pasted);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendMessage("");

    await onResend();

    setResendCooldown(60);

    setResendMessage("A new verification code has been sent. Please check your email.");

    setTimeout(() => setResendMessage(""), 5000);
  };

  const handleSubmit = () => {
    const code = otp.join("");

    if (code.length === otp.length) submit(code);
  };

  const isComplete = otp.every((digit) => digit !== "");

  const digitCount = codeLength === 6 ? "6" : `${codeLength}`;

  // Split the boxes in half with a dash, the way most OTP screens do.

  const splitAt = Math.ceil(otp.length / 2);

  const renderBox = (index: number) => (
    <input
      key={index}
      ref={(el) => {
        inputRefs.current[index] = el;
      }}
      type="text"
      inputMode="numeric"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      maxLength={1}
      value={otp[index] ?? ""}
      onChange={(e) => handleChange(index, e.target.value)}
      onKeyDown={(e) => handleKeyDown(index, e)}
      onPaste={index === 0 ? handlePaste : undefined}
      disabled={loading}
      className={`w-11 h-13 text-center text-2xl font-bold border-2 rounded-lg transition-all ${
        otp[index] ? "border-[#c9a84c] bg-[#c9a84c]/5" : "border-[#e8e4dc] bg-[#f7f5f0]"
      } focus:outline-none focus:border-[#c9a84c] focus:ring-2 focus:ring-[#c9a84c]/20 disabled:opacity-50 disabled:cursor-not-allowed`}
      aria-label={`Digit ${index + 1} of ${otp.length}`}
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1f3c] via-[#162d52] to-[#0d1f3c] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#c9a84c]/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">📧</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">Verify Your Email</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            We've sent a {digitCount}-digit verification code to:
          </p>
          <p className="text-white font-semibold text-sm mt-2">{email}</p>
        </div>

        {/* Verification Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <p className="text-center text-sm text-[#2c3347] mb-6">
            Enter the unique code below to complete your registration.
          </p>

          {/* OTP Input */}
          <div className="flex justify-center gap-2 mb-6 flex-wrap">
            {otp.slice(0, splitAt).map((_, index) => renderBox(index))}
            <span className="text-2xl text-[#e8e4dc] flex items-center px-1">-</span>
            {otp.slice(splitAt).map((_, index) => renderBox(index + splitAt))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <span className="text-red-500 text-sm">⚠️</span>
              <p className="text-red-700 text-xs leading-relaxed">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {resendMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <span className="text-green-500 text-sm">✓</span>
              <p className="text-green-700 text-xs leading-relaxed">{resendMessage}</p>
            </div>
          )}

          {/* Verify Button */}
          <button
            onClick={handleSubmit}
            disabled={!isComplete || loading}
            className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {loading ? "Verifying..." : "Verify Email"}
          </button>

          {/* Resend Section */}
          <div className="text-center pt-4 border-t border-[#e8e4dc]">
            <p className="text-sm text-[#8a9ab5] mb-3">Didn't receive the code?</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-sm text-[#c9a84c] hover:underline font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
              </button>
              <span className="hidden sm:inline text-[#e8e4dc]">|</span>
              <button
                onClick={onChangeEmail}
                className="text-sm text-[#8a9ab5] hover:text-[#0d1f3c] hover:underline"
              >
                Change Email
              </button>
            </div>
          </div>

          {/* Security Note */}
          <div className="mt-6 pt-6 border-t border-[#e8e4dc]">
            <p className="text-xs text-[#8a9ab5] text-center leading-relaxed">
              🔒 <strong>Security Notice:</strong> Each verification code is unique to your account
              and expires after 60 minutes. Never share this code with anyone, including Westwood
              Law Firm staff.
            </p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-xs text-white/50 leading-relaxed">
            Westwood Law Firm - Secure Email Verification
          </p>
        </div>
      </div>
    </div>
  );
}
