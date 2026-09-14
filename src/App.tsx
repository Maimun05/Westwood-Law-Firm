import { useState, useEffect } from "react";

import Navigation from "@/components/Navigation";

import Footer from "@/components/Footer";

import HomePage from "@/components/HomePage";

import LawyersPage from "@/components/LawyersPage";

import ExpertisePage from "@/components/ExpertisePage";

import InsightsResourcesPage from "@/components/InsightsResourcesPage";

import SpecialistNetwork from "@/components/SpecialistNetwork";

import AboutPage from "@/components/AboutPage";

import ContactPage from "@/components/ContactPage";

import InquiryFlow from "@/components/InquiryFlow";

import ConsultationFlow from "@/components/ConsultationFlow";

import ClientPortal from "@/components/ClientPortal";

import AuthPage from "@/components/AuthPage";

import ForgotPasswordPage from "@/components/ForgotPasswordPage";

import ResetPasswordPage from "@/components/ResetPasswordPage";

import { syncSavedLawyers, fetchSavedLawyers } from "@/utils/api";

import { useAuth } from "@/hooks/useAuth";

import { readRoute, pageToUrl } from "@/lib/routes";

import type { Page } from "@/types/navigation";

// Read the address bar once, at module load, before Supabase's async handling

// of a password-recovery hash can clear it.

const initialRoute = readRoute();

export default function App() {
  const { user, loading } = useAuth();

  const [page, setPage] = useState<Page>(initialRoute.page);

  const [pageParams, setPageParams] = useState<Record<string, string>>(initialRoute.params);

  const [savedLawyers, setSavedLawyers] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("wlf-saved") || "[]");
    } catch {
      return [];
    }
  });

  const [toast, setToast] = useState<string | null>(null);

  const sessionId = (() => {
    let id = localStorage.getItem("wlf-session");

    if (!id) {
      id = `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("wlf-session", id);
    }

    return id;
  })();

  useEffect(() => {
    fetchSavedLawyers(sessionId)
      .then((res) => {
        const remote = res.data ?? [];

        if (remote.length > 0) {
          setSavedLawyers((local) => {
            const merged = Array.from(new Set([...local, ...remote]));

            localStorage.setItem("wlf-saved", JSON.stringify(merged));

            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  const navigate = (nextPage: Page | string, params?: Record<string, string>) => {
    const next = nextPage as Page;

    const nextParams = params || {};

    setPage(next);

    setPageParams(nextParams);

    // Keep the address bar in step so Back, refresh, and shared links work.

    const url = pageToUrl(next, nextParams);

    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState({ page: next, params: nextParams }, "", url);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Browser Back/Forward.

  useEffect(() => {
    const handlePopState = () => {
      const route = readRoute();

      setPage(route.page);

      setPageParams(route.params);

      window.scrollTo({ top: 0 });
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const toggleSave = (id: string) => {
    setSavedLawyers((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];

      localStorage.setItem("wlf-saved", JSON.stringify(next));

      setToast(prev.includes(id) ? "Removed from saved lawyers" : "Saved to My Lawyers");

      syncSavedLawyers(sessionId, next).catch(() => {});

      return next;
    });
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);

      return () => clearTimeout(t);
    }
  }, [toast]);

  const showFooter =
    page !== "inquiry" &&
    page !== "portal" &&
    page !== "consultation" &&
    page !== "auth" &&
    page !== "forgot-password" &&
    page !== "reset-password";

  const showNavigation = page !== "portal"; // Hide navigation for portal pages

  const showMobileCTA =
    page !== "portal" && page !== "auth" && page !== "forgot-password" && page !== "reset-password"; // Hide mobile CTA for portal and auth pages

  return (
    <div className="min-h-screen flex flex-col">
      {showNavigation && <Navigation currentPage={page} onNavigate={navigate} />}

      <main className="flex-1">
        {page === "home" && <HomePage onNavigate={navigate} />}
        {page === "about" && <AboutPage onNavigate={navigate} />}
        {page === "expertise" && (
          <ExpertisePage onNavigate={navigate} selectedArea={pageParams.area} />
        )}
        {page === "lawyers" && (
          <LawyersPage
            onNavigate={navigate}
            selectedLawyerId={pageParams.lawyer}
            savedLawyers={savedLawyers}
            onToggleSave={toggleSave}
          />
        )}
        {page === "specialists" && <SpecialistNetwork onNavigate={navigate} />}
        {page === "insights-resources" && (
          <InsightsResourcesPage onNavigate={navigate} selectedArticleId={pageParams.article} />
        )}
        {page === "contact" && <ContactPage onNavigate={navigate} />}
        {page === "consultation" && (
          <ConsultationFlow
            onNavigate={navigate}
            prefilledLawyerId={pageParams.lawyer}
            prefilledAreaId={pageParams.area}
          />
        )}
        {page === "inquiry" && (
          <InquiryFlow
            onNavigate={navigate}
            prefilledLawyerId={pageParams.lawyer}
            prefilledAreaId={pageParams.area}
          />
        )}
        {page === "portal" && <ClientPortal onNavigate={navigate} savedLawyers={savedLawyers} />}
        {page === "auth" && (
          <AuthPage
            onNavigate={navigate}
            initialMode={(pageParams.mode as "login" | "register") || "login"}
          />
        )}
        {page === "forgot-password" && <ForgotPasswordPage onNavigate={navigate} />}
        {page === "reset-password" && <ResetPasswordPage onNavigate={navigate} />}
      </main>

      {showFooter && <Footer onNavigate={navigate} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0d1f3c] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg flex items-center gap-2">
          <span className="text-[#c9a84c]">✓</span>
          {toast}
        </div>
      )}

      {/* Mobile sticky CTA - only show on public pages. Inquiries are for
          registered clients; visitors get the Contact page instead. */}
      {showMobileCTA && !loading && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#e8e4dc] px-4 py-3 flex gap-3">
          {user?.role === "client" ? (
            <>
              <button
                onClick={() => navigate("inquiry")}
                className="flex-1 bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded transition-colors"
              >
                Start a Legal Inquiry
              </button>
              <button
                onClick={() => navigate("portal")}
                className="bg-[#0d1f3c] text-white text-sm font-semibold px-4 py-3 rounded transition-colors"
              >
                Account
              </button>
            </>
          ) : user ? (
            <button
              onClick={() => navigate("portal")}
              className="flex-1 bg-[#0d1f3c] text-white text-sm font-semibold py-3 rounded transition-colors"
            >
              Account
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("contact")}
                className="flex-1 bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded transition-colors"
              >
                Contact Us
              </button>
              <button
                onClick={() => navigate("auth")}
                className="bg-[#0d1f3c] text-white text-sm font-semibold px-4 py-3 rounded transition-colors"
              >
                Sign In
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
