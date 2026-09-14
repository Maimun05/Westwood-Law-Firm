import { useState, useEffect } from "react";
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

  // Fetch all content on mount
  useEffect(() => {
    async function loadContent() {
      setLoading(true);
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
        setLoading(false);
      }
    }

    loadContent();
  }, []);

  const detail = activeArea ? practiceAreas.find((p) => p.id === activeArea) : null;
  const areaLawyers = detail
    ? lawyers.filter((l) => l.practice_areas?.some((pa) => pa.id === detail.id))
    : [];
  const areaArticles = detail
    ? articles.filter((a) => areaLawyers.some((l) => l.id === a.author_id))
    : [];

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (detail) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20">
        <div className="bg-[#0d1f3c] py-20 relative overflow-hidden">
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
            <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-4">
              {detail.name}
            </h1>
            <p className="text-white/50 text-lg max-w-2xl">{detail.description}</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-4">Overview</h2>
              <p className="text-[#2c3347] leading-relaxed">{detail.description}</p>
            </div>

            <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-6">Services</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(detail.services || []).map((s) => (
                  <div key={s} className="flex items-start gap-3 p-3 rounded-lg bg-[#f7f5f0]">
                    <span className="w-px h-5 bg-[#c9a84c] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[#2c3347]">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-5">
                Client Needs We Address
              </h2>
              <ul className="space-y-3">
                {(detail.client_needs || []).map((need) => (
                  <li key={need} className="flex items-start gap-3">
                    <IconCheck className="w-4 h-4 text-[#c9a84c] mt-0.5 flex-shrink-0" />
                    <span className="text-[#2c3347] text-sm">{need}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-5">
                Related Legal Matters
              </h2>
              <div className="flex flex-wrap gap-2">
                {(detail.related_matters || []).map((m) => (
                  <span
                    key={m}
                    className="px-4 py-2 border border-[#e8e4dc] rounded-lg text-sm text-[#2c3347] hover:border-[#c9a84c] cursor-default transition-colors"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {areaArticles.length > 0 && (
              <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
                <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-5">
                  Related Insights
                </h2>
                <div className="space-y-3">
                  {areaArticles.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onNavigate("insights-resources", { article: a.id })}
                      className="w-full text-left p-4 bg-[#f7f5f0] rounded-lg border border-[#e8e4dc] hover:border-[#c9a84c] transition-all group"
                    >
                      <span className="text-xs text-[#c9a84c] font-medium">{a.category}</span>
                      <p className="text-sm font-semibold text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors mt-1">
                        {a.title}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-xl p-6 border border-[#e8e4dc]">
              <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-5">
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
                      className="w-11 h-11 rounded-full object-cover object-top flex-shrink-0"
                    />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors">
                        {l.full_name}
                      </div>
                      <div className="text-xs text-[#8a9ab5]">{l.position || "Lawyer"}</div>
                    </div>
                  </button>
                ))}
                {areaLawyers.length === 0 && (
                  <p className="text-[#8a9ab5] text-sm text-center py-4">
                    No lawyers assigned to this practice area yet.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-[#0d1f3c] rounded-xl p-6">
              <h3 className="font-serif text-base font-bold text-white mb-2">
                Ready to discuss your matter?
              </h3>
              {canInquire ? (
                <>
                  <p className="text-white/50 text-sm mb-5">
                    Schedule a consultation with one of our {detail.name} specialists.
                  </p>
                  <button
                    onClick={() => onNavigate("consultation")}
                    className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded transition-colors"
                  >
                    Schedule Consultation
                  </button>
                </>
              ) : (
                <>
                  <p className="text-white/50 text-sm mb-5">
                    Contact us to discuss your {detail.name} matter.
                  </p>
                  <button
                    onClick={() => onNavigate("contact")}
                    className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded transition-colors"
                  >
                    Contact Us
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      <div className="bg-[#0d1f3c] py-20 relative overflow-hidden">
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
          <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-4">
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
                className="group bg-white rounded-xl p-8 text-left border border-[#e8e4dc] hover:border-[#c9a84c] transition-all hover:shadow-xl hover:shadow-[#0d1f3c]/5"
              >
                <PracticeAreaIcon id={pa.id} className="w-8 h-8 text-[#c9a84c] mb-5" />
                <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-3 group-hover:text-[#c9a84c] transition-colors">
                  {pa.name}
                </h3>
                <p className="text-[#8a9ab5] text-sm leading-relaxed mb-6">{pa.description}</p>
                <div className="border-t border-[#e8e4dc] pt-4 flex items-center justify-between">
                  <div className="text-xs text-[#8a9ab5]">
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

        <div className="mt-14 bg-[#0d1f3c] rounded-xl p-10 text-center">
          <h2 className="font-serif text-3xl font-bold text-white mb-3">
            Not sure which practice area applies?
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            Our team will help identify the right legal expertise for your specific concern.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate("lawyers")}
              className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold px-8 py-3 rounded transition-colors text-sm"
            >
              Browse Our Lawyers
            </button>
            <button
              onClick={() => onNavigate("contact")}
              className="border border-white/20 hover:border-white/40 text-white/70 hover:text-white font-medium px-8 py-3 rounded transition-colors text-sm"
            >
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
