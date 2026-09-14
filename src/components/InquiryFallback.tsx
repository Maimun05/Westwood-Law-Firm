import { FIRM_EMAIL, FIRM_EMAIL_HREF } from "@/lib/firm";

// ============================================================================
// What an unregistered visitor gets instead of an inquiry CTA
// ============================================================================
// The owner's rule: only registered clients start legal inquiries. Everyone
// else is pointed at the firm's email and the Contact page — deliberately no
// sign-in prompt here.

type Props = {
  onNavigate: (page: "contact") => void;
  tone?: "light" | "dark";
  title?: string;
  message?: string;
  className?: string;
};

export default function InquiryFallback({
  onNavigate,
  tone = "light",
  title,
  message,
  className = "",
}: Props) {
  const dark = tone === "dark";

  return (
    <div className={className}>
      {title && (
        <h3
          className={`font-serif text-lg font-bold mb-2 ${dark ? "text-white" : "text-[#0d1f3c]"}`}
        >
          {title}
        </h3>
      )}
      <p className={`text-sm leading-relaxed ${dark ? "text-white/60" : "text-[#8a9ab5]"}`}>
        {message ?? (
          <>
            Legal inquiries are submitted by registered clients. You can reach us directly — we
            respond within 1–2 business days. Email{" "}
            <a
              href={FIRM_EMAIL_HREF}
              className={`font-medium hover:underline ${
                dark ? "text-[#e2c87a]" : "text-[#0d1f3c]"
              }`}
            >
              {FIRM_EMAIL}
            </a>{" "}
            or visit our Contact page.
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-3 mt-5">
        <button
          onClick={() => onNavigate("contact")}
          className={
            dark
              ? "btn border border-white/25 text-white hover:border-[#c9a84c] hover:text-[#c9a84c] px-5 py-2.5 text-sm"
              : "btn-outline text-sm px-5 py-2.5"
          }
        >
          Contact Us
        </button>
      </div>
    </div>
  );
}
