import { useState, useEffect, useCallback } from "react";
import {
  getPracticeAreas,
  getLawyers,
  getPublishedArticles,
  type PracticeArea,
  type Lawyer,
  type Article,
} from "@/lib/content";
import { PracticeAreaIcon, IconArrowRight, IconCheck } from "@/components/Icons";
import { onPortraitError } from "@/utils/image";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { practiceAreaJsonLd } from "@/lib/seo";
import { subscribeToTables } from "@/lib/realtime";

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

type ExpertisePageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  selectedArea?: string;
};

export default function ExpertisePage({ onNavigate, selectedArea }: ExpertisePageProps) {
  const { user } = useAuth();
  // Consultations are for registered clients; visitors are pointed at the
  // Contact page instead.
  const canInquire = user?.role === "client";
  const [activeArea, setActiveArea] = useState<string | null>(selectedArea || null);

  // The open practice area lives in the URL so Back closes it and the link is
  // shareable. Track the route when it changes underneath us.
  useEffect(() => {
    setActiveArea(selectedArea || null);
  }, [selectedArea]);

  const openArea = (id: string | null) => {
    setActiveArea(id);
    onNavigate("expertise", id ? { area: id } : undefined);
  };
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all content on mount. The same function serves every live refetch.
  const loadContent = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [paResult, lawyerResult, articleResult] = await Promise.all([
        getPracticeAreas(),
        getLawyers(),
        getPublishedArticles(),
      ]);

      if (paResult.data) setPracticeAreas(paResult.data);
      if (lawyerResult.data) setLawyers(lawyerResult.data);
      if (articleResult.data) setArticles(articleResult.data);
    } catch (error) {
      console.error("Failed to load expertise content:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  // Live content: an edit saved in the portal reaches this page without a
  // reload. A silent refetch never flashes the spinner over rendered content.
  useEffect(() => {
    return subscribeToTables(
      ["practice_areas", "profiles", "articles"],
      () => void loadContent(true),
      { channelKey: "expertise" },
    );
  }, [loadContent]);

  const detail = activeArea ? practiceAreas.find((p) => p.id === activeArea) : null;
  const areaLawyers = detail
    ? lawyers.filter((l) => l.practice_areas?.some((pa) => pa.id === detail.id))
    : [];
  const areaArticles = detail
    ? articles.filter((a) => areaLawyers.some((l) => l.id === a.author_id))
    : [];

  usePageMeta(
    "expertise",
    detail
      ? { title: `${detail.name} — Westwood Law Firm`, description: detail.description }
      : undefined,
    detail ? practiceAreaJsonLd(detail) : null,
  );

  if (loading) {
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (detail) {
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
        <div className="bg-[var(--navy-solid)] py-12 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
              backgroundSize: "80px 80px",
            }}
          />
          <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
            <button
              onClick={() => openArea(null)}
              className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-8 transition-colors"
            >
              ← All Practice Areas
            </button>
            <PracticeAreaIcon id={detail.id} className="w-10 h-10 text-[#c9a84c] mb-5" />
            <h1 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-4">
              {detail.name}
            </h1>
            <p className="text-white/50 text-lg max-w-2xl">{detail.description}</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]">
              <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mb-4">
                Overview
              </h2>
              <p className="text-[var(--ink-body)] leading-relaxed">{detail.description}</p>
            </div>

            <div className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]">
              <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mb-6">
                Services
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(detail.services || []).map((s) => (
                  <div
                    key={s}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface-sunken)]"
                  >
                    <span className="w-px h-5 bg-[#c9a84c] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[var(--ink-body)]">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]">
              <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mb-5">
                Client Needs We Address
              </h2>
              <ul className="space-y-3">
                {(detail.client_needs || []).map((need) => (
                  <li key={need} className="flex items-start gap-3">
                    <IconCheck className="w-4 h-4 text-[#c9a84c] mt-0.5 flex-shrink-0" />
                    <span className="text-[var(--ink-body)] text-sm">{need}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]">
              <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mb-5">
                Related Legal Matters
              </h2>
              <div className="flex flex-wrap gap-2">
                {(detail.related_matters || []).map((m) => (
                  <span
                    key={m}
                    className="px-4 py-2 border border-[var(--line)] rounded-lg text-sm text-[var(--ink-body)] hover:border-[#c9a84c] cursor-default transition-colors"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {areaArticles.length > 0 && (
              <div className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]">
                <h2 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mb-5">
                  Related Insights
                </h2>
                <div className="space-y-3">
                  {areaArticles.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onNavigate("insights-resources", { article: a.id })}
                      className="w-full text-left p-4 bg-[var(--surface-sunken)] rounded-lg border border-[var(--line)] hover:border-[#c9a84c] transition-all group"
                    >
                      <span className="text-xs text-[#c9a84c] font-medium">{a.category}</span>
                      <p className="text-sm font-semibold text-[var(--ink-strong)] group-hover:text-[#c9a84c] transition-colors mt-1">
                        {a.title}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-5">
            <div className="bg-[var(--surface-card)] rounded-xl p-6 border border-[var(--line)]">
              <h3 className="font-serif text-lg font-bold text-[var(--ink-strong)] mb-5">
                Lawyers in This Practice
              </h3>
              <div className="space-y-4">
                {areaLawyers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onNavigate("lawyers", { lawyer: l.id })}
                    className="w-full flex items-center gap-3 group"
                  >
                    <img
                      src={l.profile_image || "/lawyers/placeholder.svg"}
                      onError={onPortraitError}
                      alt={l.full_name}
                      loading="lazy"
                      decoding="async"
                      className="w-11 h-11 rounded-full object-cover object-top flex-shrink-0"
                    />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-[var(--ink-strong)] group-hover:text-[#c9a84c] transition-colors">
                        {l.full_name}
                      </div>
                      <div className="text-xs text-[var(--ink-muted)]">
                        {l.position || "Lawyer"}
                      </div>
                    </div>
                  </button>
                ))}
                {areaLawyers.length === 0 && (
                  <p className="text-[var(--ink-muted)] text-sm text-center py-4">
                    No lawyers assigned to this practice area yet.
                  </p>
                )}
              </div>
            </div>

            {canInquire && (
              <div className="bg-[var(--navy-solid)] rounded-xl p-6">
                <h3 className="font-serif text-base font-bold text-white mb-2">
                  Ready to discuss your matter?
                </h3>
                <p className="text-white/50 text-sm mb-5">
                  Schedule a consultation with one of our {detail.name} specialists.
                </p>
                <button
                  onClick={() => onNavigate("consultation", { area: detail.id })}
                  className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[var(--ink-on-gold)] text-sm font-semibold py-3 rounded transition-colors"
                >
                  Schedule Consultation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
      <div className="bg-[var(--navy-solid)] py-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-4">
            What We Do
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-4">
            Areas of Expertise
          </h1>
          <p className="text-white/50 text-lg max-w-xl">
            {practiceAreas.length} specialized practice areas staffed by experienced Philippine
            lawyers.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {practiceAreas.map((pa) => {
            const paLawyers = lawyers.filter((l) => l.practice_areas?.some((p) => p.id === pa.id));
            return (
              <button
                key={pa.id}
                onClick={() => openArea(pa.id)}
                className="group bg-[var(--surface-card)] rounded-xl p-8 text-left border border-[var(--line)] hover:border-[#c9a84c] transition-all hover:shadow-xl hover:shadow-[#0d1f3c]/5"
              >
                <PracticeAreaIcon id={pa.id} className="w-8 h-8 text-[#c9a84c] mb-5" />
                <h3 className="font-serif text-xl font-bold text-[var(--ink-strong)] mb-3 group-hover:text-[#c9a84c] transition-colors">
                  {pa.name}
                </h3>
                <p className="text-[var(--ink-muted)] text-sm leading-relaxed mb-6">
                  {pa.description}
                </p>
                <div className="border-t border-[var(--line)] pt-4 flex items-center justify-between">
                  <div className="text-xs text-[var(--ink-muted)]">
                    {(pa.services || []).length} services · {paLawyers.length} lawyer
                    {paLawyers.length !== 1 ? "s" : ""}
                  </div>
                  <span className="text-[#c9a84c] text-xs font-medium inline-flex items-center gap-1 group-hover:underline">
                    Explore <IconArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-14 bg-[var(--navy-solid)] rounded-xl p-10 text-center">
          <h2 className="font-serif text-3xl font-bold text-white mb-3">
            Not sure which practice area applies?
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            Our team will help identify the right legal expertise for your specific concern.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate("lawyers")}
              className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[var(--ink-on-gold)] font-semibold px-8 py-3 rounded transition-colors text-sm"
            >
              Browse Our Lawyers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
