import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import BrandLogo from "@/components/BrandLogo";
import type { Page } from "@/types/navigation";

type NavigationProps = {
  currentPage: Page | string;
  onNavigate: (page: Page) => void;
};

export default function Navigation({ currentPage, onNavigate }: NavigationProps) {
  const { user, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks: { label: string; page: Page }[] = [
    { label: "Home", page: "home" },
    { label: "About", page: "about" },
    { label: "Practice Areas", page: "expertise" },
    { label: "Our Lawyers", page: "lawyers" },
    { label: "Partner Network", page: "specialists" },
    { label: "Insights", page: "insights-resources" },
    { label: "Contact", page: "contact" },
  ];

  const handleNav = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  // Only the home hero runs edge-to-edge under the fixed nav (min-h-screen
  // gradient-navy). Every other page pads its top by the nav height, so an
  // off-white strip sits behind the transparent nav and the dark tone is the
  // one that stays readable.
  const overHero = !scrolled && currentPage === "home";

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[var(--z-fixed)] transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm shadow-sm shadow-black/5 border-b border-[var(--color-border-light)]"
          : "bg-transparent"
      }`}
    >
      <div className="container-page">
        <div className="flex items-center justify-between h-16 lg:h-18">
          {/* Logo */}
          <button
            onClick={() => handleNav("home")}
            className="flex items-center gap-3 flex-shrink-0"
            aria-label="Westwood Law Firm - Home"
          >
            <BrandLogo tone={overHero ? "light" : "dark"} />
          </button>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <button
                key={link.page}
                onClick={() => handleNav(link.page)}
                className={`px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                  currentPage === link.page
                    ? overHero
                      ? "text-[var(--color-gold)] bg-white/10"
                      : "text-[var(--color-gold)] bg-[var(--color-gold)]/5"
                    : overHero
                      ? "text-white/75 hover:text-white hover:bg-white/10"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Desktop Actions — inquiries are for registered clients; visitors
              get the Contact page instead. */}
          <div className="hidden lg:flex items-center gap-2">
            {!loading && (
              <>
                <button
                  onClick={() => handleNav(user ? "portal" : "auth")}
                  className={`btn-ghost text-sm ${
                    overHero ? "text-white/80 hover:text-white hover:bg-white/10" : ""
                  }`}
                >
                  {user ? "Account" : "Sign In"}
                </button>
                {user?.role === "client" && (
                  <button
                    onClick={() => handleNav("inquiry")}
                    className="btn-primary text-sm px-5 py-2.5 whitespace-nowrap"
                  >
                    Start a Legal Inquiry
                  </button>
                )}
                {!user && (
                  <button
                    onClick={() => handleNav("contact")}
                    className="btn-primary text-sm px-5 py-2.5 whitespace-nowrap"
                  >
                    Contact Us
                  </button>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`lg:hidden p-2 ${
              overHero ? "text-white" : "text-[var(--color-text-primary)]"
            }`}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <div className="w-6 h-5 flex flex-col justify-between">
              <span
                className={`block h-0.5 bg-current transition-transform origin-left duration-200 ${
                  mobileOpen ? "rotate-45 translate-y-2" : ""
                }`}
              />
              <span
                className={`block h-0.5 bg-current transition-opacity duration-100 ${
                  mobileOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 bg-current transition-transform origin-left duration-200 ${
                  mobileOpen ? "-rotate-45 -translate-y-2" : ""
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[var(--color-navy)] border-t border-white/10 animate-slide-down">
          <div className="container-page px-6 py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.page}
                onClick={() => handleNav(link.page)}
                className={`text-left px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  currentPage === link.page
                    ? "text-[var(--color-gold)] bg-white/5"
                    : "text-white/80 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </button>
            ))}
            <div className="border-t border-white/10 pt-3 mt-2 flex flex-col gap-2">
              {!loading && (
                <>
                  <button
                    onClick={() => handleNav(user ? "portal" : "auth")}
                    className="text-left px-4 py-3 text-sm text-white/80 hover:text-white font-medium"
                  >
                    {user ? "Account" : "Sign In"}
                  </button>
                  {user?.role === "client" && (
                    <button
                      onClick={() => handleNav("inquiry")}
                      className="btn-primary text-sm px-4 py-3"
                    >
                      Start a Legal Inquiry
                    </button>
                  )}
                  {!user && (
                    <button
                      onClick={() => handleNav("contact")}
                      className="btn-primary text-sm px-4 py-3"
                    >
                      Contact Us
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
