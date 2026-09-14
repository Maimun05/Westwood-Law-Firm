import { IconLinkedin } from "@/components/Icons";
import { useAuth } from "@/hooks/useAuth";
import InquiryFallback from "@/components/InquiryFallback";
import { FIRM_EMAIL, FIRM_EMAIL_HREF } from "@/lib/firm";

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
  | "portal";

type FooterProps = {
  onNavigate: (page: Page) => void;
};

export default function Footer({ onNavigate }: FooterProps) {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    practiceAreas: [
      "Labor and Industrial Relations",
      "Banking Laws",
      "Asset Recovery",
      "Corporate and Commercial Laws",
      "Civil and Administrative Matters",
      "Criminal Cases",
      "Immigration",
      "Annulment of Marriages",
      "Taxation",
    ],
    firm: [
      { label: "About", page: "about" as Page },
      { label: "Our Lawyers", page: "lawyers" as Page },
      { label: "Partner Network", page: "specialists" as Page },
      { label: "Insights & Resources", page: "insights-resources" as Page },
      { label: "Contact", page: "contact" as Page },
    ],
  };

  return (
    <footer className="bg-[var(--color-navy-dark)] text-white" role="contentinfo">
      {/* Top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--color-gold)]/40 to-transparent" />

      <div className="container-page pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="md:col-span-2 lg:col-span-4 space-y-6">
            <div>
              <p className="text-accent-sm mb-2">Westwood</p>
              <p className="font-serif text-2xl lg:text-3xl font-bold text-white tracking-tight">
                Law Firm
              </p>
            </div>
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              Specialized legal expertise. Trusted guidance. Serving individuals, families, and
              businesses across the Philippines.
            </p>

            <address className="not-italic space-y-2 text-sm text-white/40 leading-relaxed">
              <p>Suite 1004 Atlanta Center</p>
              <p>31 Annapolis St., Greenhills</p>
              <p>1502 San Juan City, Metro Manila</p>
              <p className="pt-1">
                <a
                  href={FIRM_EMAIL_HREF}
                  className="hover:text-[var(--color-gold)] transition-colors"
                >
                  {FIRM_EMAIL}
                </a>
              </p>
              <p>(02) 7957 2121</p>
            </address>

            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-white/30 hover:text-[var(--color-gold)] transition-colors duration-200 group"
              aria-label="Westwood Law Firm on LinkedIn"
            >
              <IconLinkedin className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              <span className="text-xs tracking-wide">LinkedIn</span>
            </a>
          </div>

          {/* Practice Areas */}
          <div className="md:col-span-2 lg:col-span-3">
            <h4 className="text-accent-sm mb-6">Practice Areas</h4>
            <ul className="space-y-2.5" role="list">
              {footerLinks.practiceAreas.map((area) => (
                <li key={area}>
                  <button
                    onClick={() => onNavigate("expertise")}
                    className="text-white/50 hover:text-white text-sm transition-colors duration-200 leading-none"
                  >
                    {area}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Firm Links */}
          <div className="md:col-span-2 lg:col-span-2">
            <h4 className="text-accent-sm mb-6">The Firm</h4>
            <ul className="space-y-2.5" role="list">
              {footerLinks.firm.map(({ label, page }) => (
                <li key={label}>
                  <button
                    onClick={() => onNavigate(page)}
                    className="text-white/50 hover:text-white text-sm transition-colors duration-200"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA Column — the inquiry button is for registered clients only */}
          <div className="md:col-span-2 lg:col-span-3">
            <h4 className="text-accent-sm mb-6">Get Started</h4>
            {user?.role === "client" ? (
              <>
                <p className="text-white/50 text-sm leading-relaxed mb-6">
                  Have a legal concern? Submit an inquiry and our team will get in touch within 1–2
                  business days.
                </p>
                <button
                  onClick={() => onNavigate("inquiry")}
                  className="w-full btn-primary text-sm px-5 py-3"
                >
                  Start a Legal Inquiry
                </button>
              </>
            ) : (
              <InquiryFallback
                tone="dark"
                onNavigate={onNavigate}
                message="Have a legal concern? Email us and our team will get in touch within 1–2 business days."
              />
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/8 mt-14 pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <p className="text-white/25 text-xs leading-relaxed max-w-xl">
            © {currentYear} Westwood Law Firm. All rights reserved. This website is for
            informational purposes only and does not constitute legal advice. Submitting an inquiry
            does not establish an attorney-client relationship.
          </p>
          <p className="text-white/20 text-xs whitespace-nowrap">Manila, Philippines</p>
        </div>
      </div>
    </footer>
  );
}
