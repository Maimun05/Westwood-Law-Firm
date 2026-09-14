import { useState, useEffect } from "react";
import {
  getPracticeAreas,
  getLawyers,
  getPublishedArticles,
  type PracticeArea,
  type Lawyer,
  type Article,
} from "@/lib/content";
import { PracticeAreaIcon, IconArrowRight } from "@/components/Icons";
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

type HomePageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
};

const stats = [
  { value: "Est. 1998", label: "Founded" },
  { value: "12", label: "Practice Areas" },
  { value: "40+", label: "Corporate Clients" },
  { value: "Nationwide", label: "Lawyer Network" },
] as const;

export default function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  // Consultations are for registered clients; visitors are pointed at the
  // Contact page instead.
  const canInquire = user?.role === "client";
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    async function loadData() {
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
        console.error("Failed to load home page data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-primary)] min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-primary)]">
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-navy">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] pattern-grid" />

        {/* Side accent lines */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[var(--color-gold)]/40 to-transparent" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[var(--color-gold)]/15 to-transparent" />

        <div className="relative container-page text-center py-20 lg:py-28">
          {/* Location badge */}
          <div className="inline-flex items-center gap-2.5 mb-10 px-5 py-2.5 rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/5 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-[var(--color-gold)] animate-pulse" />
            <span className="text-[var(--color-gold)] text-xs tracking-widest uppercase font-medium">
              Westwood Law Firm — San Juan City, Philippines
            </span>
          </div>

          {/* Main headline */}
          <h1 className="heading-display text-[length:var(--text-display-xl)] text-white mb-6 animate-slide-up stagger-1">
            Specialized Legal Expertise.
            <br />
            <span className="text-[var(--color-gold)]">Trusted Guidance.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lead text-white/70 max-w-3xl mx-auto mb-12 animate-slide-up stagger-2">
            Westwood Law Firm provides specialized legal practice — ensuring that every case is
            handled by lawyers with expertise in the relevant field of law.
          </p>

          {/* CTA Group */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up stagger-3">
            {canInquire ? (
              <button onClick={() => onNavigate("consultation")} className="btn-primary-lg">
                Schedule a Consultation
              </button>
            ) : (
              <button onClick={() => onNavigate("contact")} className="btn-primary-lg">
                Contact Us
              </button>
            )}
            <button
              onClick={() => onNavigate("expertise")}
              className="btn-secondary-lg border-white/20 text-white hover:border-white/50 hover:text-white"
            >
              Explore Our Expertise
            </button>
          </div>

          {/* Trust Stats */}
          <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-8 border-t border-white/8 pt-12 animate-slide-up stagger-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="heading-display text-[var(--color-gold)] text-3xl lg:text-4xl mb-2">
                  {stat.value}
                </div>
                <div className="text-white/40 text-micro tracking-widest uppercase">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/20 animate-fade-in stagger-5">
          <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      </section>

      {/* ── How Can We Help / Practice Areas ── */}
      <section className="section-py-lg bg-[var(--color-bg-primary)]">
        <div className="container-page">
          {/* Section Header */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
            <div className="max-w-2xl">
              <p className="text-accent-sm mb-4">Start Here</p>
              <h2 className="heading-section">How Can We Help?</h2>
              <p className="text-body mt-4 max-w-lg">
                Select a practice area to explore our services, meet the relevant lawyers, and get
                started.
              </p>
            </div>
            <button
              onClick={() => onNavigate("expertise")}
              className="btn-link self-start lg:self-end whitespace-nowrap"
            >
              All Practice Areas
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Practice Area Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1 rounded-2xl overflow-hidden">
            {practiceAreas.map((pa, index) => {
              const paLawyers = lawyers.filter((l) =>
                l.practice_areas?.some((p) => p.id === pa.id),
              );
              return (
                <button
                  key={pa.id}
                  onClick={() => onNavigate("expertise", { area: pa.id })}
                  className="group relative overflow-hidden bg-[var(--color-navy)] hover:bg-[var(--color-navy-light)] p-8 text-left transition-all duration-300 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-gold)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <PracticeAreaIcon
                    id={pa.id}
                    className="w-8 h-8 text-[var(--color-gold)]/60 group-hover:text-[var(--color-gold)] mb-6 transition-colors duration-300"
                  />
                  <div className="text-[var(--color-gold)] text-xs tracking-widest uppercase font-medium mb-2 relative z-10">
                    Westwood
                  </div>
                  <h3 className="font-serif text-xl lg:text-2xl font-bold text-white leading-snug mb-3 relative z-10">
                    {pa.name}
                  </h3>
                  <p className="text-white/40 text-sm leading-relaxed line-clamp-2 mb-6 relative z-10">
                    {pa.description}
                  </p>

                  <div className="flex items-center justify-between relative z-10 pt-4 border-t border-white/5">
                    <span className="text-white/20 text-caption">
                      {paLawyers.length} lawyer
                      {paLawyers.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-white/20 group-hover:text-[var(--color-gold)] text-caption flex items-center gap-1 transition-colors duration-200">
                      Explore
                      <IconArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Our Lawyers ── */}
      <section className="section-py-lg bg-[var(--color-bg-primary)]">
        <div className="container-page">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
            <div>
              <p className="text-accent-sm mb-4">Our Team</p>
              <h2 className="heading-section">The Westwood Lawyers</h2>
            </div>
            <button
              onClick={() => onNavigate("lawyers")}
              className="btn-link self-start lg:self-end"
            >
              View All Lawyers
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {lawyers.slice(0, 4).map((lawyer, index) => (
              <button
                key={lawyer.id}
                onClick={() => onNavigate("lawyers", { lawyer: lawyer.id })}
                className="card-hover-lift group text-left animate-slide-up"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="relative overflow-hidden bg-[var(--color-slate-muted)]">
                  <img
                    src={lawyer.profile_image || "/lawyers/placeholder.svg"}
                    onError={onPortraitError}
                    alt={lawyer.full_name}
                    className="img-cover h-64 group-hover:scale-[1.03] transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <div className="p-6">
                  <h3 className="font-serif text-base font-bold text-[var(--color-text-primary)] mb-1 group-hover:text-[var(--color-gold)] transition-colors">
                    {lawyer.full_name}
                  </h3>
                  <p className="text-accent-sm text-[var(--color-gold)] mb-4">
                    {lawyer.position || "Lawyer"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lawyer.practice_areas?.slice(0, 3).map((pa) => (
                      <span key={pa.id} className="badge-outline">
                        {pa.name}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Insights ── */}
      <section className="section-py-lg bg-white">
        <div className="container-page">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
            <div>
              <p className="text-accent-sm mb-4">Westwood Insights</p>
              <h2 className="heading-section">Legal Perspectives</h2>
            </div>
            <button
              onClick={() => onNavigate("insights-resources")}
              className="btn-link self-start lg:self-end"
            >
              All Insights
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {articles.slice(0, 3).map((article, i) => (
              <button
                key={article.id}
                onClick={() => onNavigate("insights-resources", { article: article.id })}
                className={`group text-left card-hover-lift ${
                  i === 0 ? "lg:col-span-2" : ""
                } animate-slide-up`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`relative overflow-hidden ${i === 0 ? "md:h-64 lg:h-72" : "h-48"}`}>
                  <img
                    src="https://images.unsplash.com/photo-1571055931484-22dce9d6c510?w=800&h=600&fit=crop&auto=format"
                    alt=""
                    className="img-cover opacity-70 group-hover:scale-105 transition-transform duration-700"
                  />
                  <span className="absolute top-4 left-4 badge-gold">{article.category}</span>
                </div>
                <div className="p-6 flex flex-col">
                  <h3
                    className={`font-serif font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-gold)] transition-colors mb-3 leading-snug ${
                      i === 0 ? "text-xl lg:text-2xl" : "text-base lg:text-lg"
                    }`}
                  >
                    {article.title}
                  </h3>
                  <p className="text-body text-sm flex-1">{article.excerpt}</p>
                  <div className="flex items-center justify-between text-caption text-[var(--color-text-muted)] mt-auto pt-4 border-t border-[var(--color-border-light)]">
                    <span>{article.author?.full_name || "Westwood Law Firm"}</span>
                    <span>{article.reading_time}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="section-py-lg relative overflow-hidden gradient-navy">
        <div className="absolute inset-0 opacity-[0.03] pattern-grid" />
        <div className="relative container-page text-center max-w-4xl">
          <p className="text-accent-sm mb-5">Ready to Begin</p>
          <h2 className="heading-display text-[length:var(--text-display-md)] text-white mb-6">
            Speak With a Westwood Lawyer
          </h2>
          <p className="text-lead text-white/60 mb-10 max-w-xl mx-auto">
            Schedule a confidential consultation or browse our team of lawyers to find the right
            expertise for your concern.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {canInquire ? (
              <button onClick={() => onNavigate("consultation")} className="btn-primary-lg">
                Schedule a Consultation
              </button>
            ) : (
              <button onClick={() => onNavigate("contact")} className="btn-primary-lg">
                Contact Us
              </button>
            )}
            <button
              onClick={() => onNavigate("expertise")}
              className="btn-secondary-lg border-white/20 text-white hover:border-white/50 hover:text-white"
            >
              Learn About Our Services
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
