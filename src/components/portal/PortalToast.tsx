import { useEffect } from "react";

export default function PortalToast({
  message,

  tone = "success",

  onClose,
}: {
  message: string;

  tone?: "success" | "error";

  onClose: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onClose, tone === "error" ? 6000 : 3500);

    return () => window.clearTimeout(t);
  }, [message, tone, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-[60] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg flex items-center gap-2 ${
        tone === "error" ? "bg-red-600" : "bg-[#0d1f3c]"
      }`}
    >
      <span className={tone === "error" ? "text-white" : "text-[#c9a84c]"}>
        {tone === "error" ? "!" : "✓"}
      </span>
      {message}
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="ml-2 text-white/60 hover:text-white leading-none"
      >
        ×
      </button>
    </div>
  );
}
