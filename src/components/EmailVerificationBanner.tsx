// ============================================================================

// Email Verification Banner

// ============================================================================

// Displays a persistent banner when user's email is not verified.

// Provides "Resend Verification Email" functionality.

// ============================================================================

import { useState, useEffect } from "react";

import { getVerificationStatus, resendVerificationEmail } from "@/lib/services/email";

export default function EmailVerificationBanner() {
  const [show, setShow] = useState(false);

  const [email, setEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkVerification();
  }, []);

  const checkVerification = async () => {
    const { verified, email: userEmail } = await getVerificationStatus();

    if (!verified && userEmail) {
      setShow(true);

      setEmail(userEmail);
    } else {
      setShow(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;

    setLoading(true);

    setMessage(null);

    const { error } = await resendVerificationEmail(email);

    setLoading(false);

    if (error) {
      setMessage(`Error: ${error}`);

      setTimeout(() => setMessage(null), 5000);
    } else {
      setMessage(`✓ Verification email sent to ${email}`);

      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);

    // Store in sessionStorage so it doesn't show again this session

    sessionStorage.setItem("emailVerificationBannerDismissed", "true");
  };

  // Check if banner was dismissed this session

  useEffect(() => {
    const wasDismissed = sessionStorage.getItem("emailVerificationBannerDismissed");

    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-sm font-bold">!</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Please verify your email address to access all features.
              {email && (
                <span className="font-normal">
                  {" "}
                  We sent a verification link to <strong>{email}</strong>
                </span>
              )}
            </p>
            {message && <p className="text-xs mt-1 opacity-90">{message}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleResend}
            disabled={loading}
            className="text-sm font-semibold bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Sending..." : "Resend Email"}
          </button>
          <button
            onClick={handleDismiss}
            className="text-white/60 hover:text-white text-xl leading-none px-2"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
