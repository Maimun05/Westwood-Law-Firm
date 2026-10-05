import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  getPracticeAreas,
  getLawyers,
  getPublishedArticles,
  getUpcomingSeminars,
  getRetainerPackages,
  type PracticeArea,
  type Lawyer,
  type Article,
  type SeminarEvent,
  type RetainerPackage,
} from "@/lib/content";
import { PracticeAreaIcon, IconArrowRight, IconCheck, IconClock } from "@/components/Icons";
import { onPortraitError } from "@/utils/image";
import { formatSeminarDate } from "@/utils/seminar";
import RetainerPackageCard from "@/components/RetainerPackageCard";
import SeminarRegistrationModal from "@/components/SeminarRegistrationModal";
import { useAuth } from "@/hooks/useAuth";
import { useReveal } from "@/hooks/useReveal";
import { useParallax } from "@/hooks/useParallax";
import { useSpotlight } from "@/hooks/useSpotlight";
import { useCountUp } from "@/hooks/useCountUp";

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

/** Splits a stat like "40+" into prefix "", target 40, suffix "+". */
function parseStat(value: string) {
  const match = value.match(/^(\D*?)(\d[\d,]*)(.*)$/);
  if (!match) return { prefix: "", target: 0, suffix: value, numeric: false };
  return {
    prefix: match[1],
    target: Number(match[2].replace(/,/g, "")),
    suffix: match[3],
    numeric: true,
  };
}

function StatValue({ value }: { value: string }) {
  const parsed = useMemo(() => parseStat(value), [value]);
  // Only bare counts animate — "Est. 1998" is a founding year, and counting
  // 0→1998 reads wrong.
  const animate = parsed.numeric && !/^\D/.test(value);
  const count = useCountUp(parsed.target, { start: animate });
  if (!parsed.numeric) return <>{value}</>;
  return (
    <>
      {parsed.prefix}
      {count}
      {parsed.suffix}
    </>
  );
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  // Consultations are for registered clients; visitors are pointed at the
  // Contact page instead.
  const canInquire = user?.role === "client";
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [seminars, setSeminars] = useState<SeminarEvent[]>([]);
  const [packages, setPackages] = useState<RetainerPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Seminar registration is recorded as an inquiry (see submitInquiry). The
  // "Registered!" state is per-session only, same as the Insights page.
  const [registering, setRegistering] = useState<SeminarEvent | null>(null);
  const [registered, setRegistered] = useState<string[]>([]);

  // Below-the-fold sections reveal as they scroll into view. The deps re-scan
  // the observer once the loading gate lifts and the sections actually exist.
  const revealRef = useReveal({
    deps: [loading, practiceAreas, lawyers, articles, seminars, packages],
  });
  const parallaxRef = useParallax(0.2, !loading);
  const spotlight = useSpotlight<HTMLButtonElement>();

  // Fetch all data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [paResult, lawyerResult, articleResult, seminarResult, packageResult] =
          await Promise.all([
            getPracticeAreas(),
            getLawyers(),
            getPublishedArticles(),
            getUpcomingSeminars(),
            getRetainerPackages(),
          ]);

        if (paResult.data) setPracticeAreas(paResult.data);
        if (lawyerResult.data) setLawyers(lawyerResult.data);
        if (articleResult.data) setArticles(articleResult.data);
        if (seminarResult.data) setSeminars(seminarResult.data);
        if (packageResult.data) setPackages(packageResult.data);
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
    <div ref={revealRef} className="bg-[var(--color-bg-primary)]">
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-navy">
        {/* Parallax background (grid + gold glow). Oversized so the lagging
            layer never exposes an edge at the section boundary. */}
        <div
          ref={parallaxRef}
          aria-hidden
          className="absolute -inset-[15%] pointer-events-none"
        >
          <div className="absolute inset-0 opacity-[0.03] pattern-grid animate-grid-drift" />
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[min(92vw,880px)] h-[min(92vw,880px)] hero-glow" />
        </div>

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
            <span className="relative inline-block">
              <span className="text-[var(--color-gold)]">Trusted Guidance.</span>
              <span aria-hidden className="hero-underline" />
            </span>
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
                  <StatValue value={stat.value} />
                </div>
                <div className="text-white/40 text-micro tracking-widest uppercase">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/25 animate-fade-in stagger-5">
          <span className="text-[10px] tracking-[0.3em] uppercase">Scroll</span>
          <span aria-hidden className="scroll-cue-track" />
        </div>
      </section>

      {/* ── How Can We Help / Practice Areas ── */}
      <section className="section-py-lg bg-[var(--color-bg-primary)]">
        <div className="container-page">
          {/* Section Header */}
          <div aria-hidden className="divider-gold reveal-x w-24 mb-10" />
          <div className="reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
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
                  onMouseEnter={spotlight.onMouseEnter}
                  onMouseMove={spotlight.onMouseMove}
                  className="spotlight group relative overflow-hidden bg-[var(--color-navy)] hover:bg-[var(--color-navy-light)] p-8 text-left transition-all duration-300 reveal"
                  style={{ "--reveal-delay": `${index * 60}ms` } as CSSProperties}
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

      {/* ── Business Resources / Retainer Packages ── */}
      {packages.length > 0 && (
        <section className="section-py-lg bg-[var(--color-bg-primary)]">
          <div className="container-page">
            <div aria-hidden className="divider-gold reveal-x w-24 mb-10" />
            <div className="reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
              <div className="max-w-2xl">
                <p className="text-accent-sm mb-4">For Businesses</p>
                <h2 className="heading-section">Legal Retainer Packages</h2>
                <p className="text-body mt-4 max-w-lg">
                  Structured retainer arrangements for organizations that need ongoing legal
                  support. Contact us to discuss the right fit for your business.
                </p>
              </div>
              <button
                onClick={() => onNavigate("contact")}
                className="btn-link self-start lg:self-end whitespace-nowrap"
              >
                Talk to Us
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packages.map((pkg, index) => (
                <div
                  key={pkg.id}
                  className="reveal [&>div]:h-full"
                  style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}
                >
                  <RetainerPackageCard pkg={pkg} onSelect={() => onNavigate("contact")} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Our Lawyers ── */}
      <section className="section-py-lg bg-[var(--color-bg-primary)]">
        <div className="container-page">
          <div aria-hidden className="divider-gold reveal-x w-24 mb-10" />
          <div className="reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
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
                className="card-hover-lift group text-left reveal"
                style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}
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

      {/* ── Upcoming Seminars ── */}
      {seminars.length > 0 && (
        <section className="section-py-lg bg-white">
          <div className="container-page">
            <div aria-hidden className="divider-gold reveal-x w-24 mb-10" />
            <div className="reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
              <div className="max-w-2xl">
                <p className="text-accent-sm mb-4">Seminars &amp; Events</p>
                <h2 className="heading-section">Upcoming Seminars</h2>
                <p className="text-body mt-4 max-w-lg">
                  Sessions on the legal topics that affect businesses and individuals most. Reserve
                  a seat and the firm will confirm by email.
                </p>
              </div>
              <button
                onClick={() => onNavigate("insights-resources")}
                className="btn-link self-start lg:self-end whitespace-nowrap"
              >
                All Events
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {seminars.map((event, index) => (
                <div
                  key={event.id}
                  className="card flex flex-col p-6 reveal"
                  style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="badge-gold">{event.mode}</span>
                    <span className="text-caption text-[var(--color-text-muted)]">
                      {formatSeminarDate(event.date)}
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-bold text-[var(--color-text-primary)] leading-snug mb-3">
                    {event.title}
                  </h3>
                  <p className="text-body text-sm line-clamp-3 flex-1 mb-5">{event.description}</p>
                  <div className="flex items-center gap-2 text-caption text-[var(--color-text-muted)] mb-5">
                    <IconClock className="w-4 h-4 flex-shrink-0 text-[var(--color-gold)]" />
                    <span className="truncate">
                      {event.time} · {event.location}
                    </span>
                  </div>
                  {registered.includes(event.id) ? (
                    <div className="flex items-center justify-center gap-2 py-3 rounded-lg bg-[var(--color-gold)]/10 text-[var(--color-gold)] text-sm font-semibold">
                      <IconCheck className="w-4 h-4" />
                      Registered!
                    </div>
                  ) : (
                    <button
                      onClick={() => setRegistering(event)}
                      className="btn-primary w-full"
                    >
                      Register
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Insights ── */}
      <section className="section-py-lg bg-white">
        <div className="container-page">
          <div aria-hidden className="divider-gold reveal-x w-24 mb-10" />
          <div className="reveal flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-16">
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
                className={`group text-left card-hover-lift reveal ${
                  i === 0 ? "lg:col-span-2" : ""
                }`}
                style={{ "--reveal-delay": `${i * 80}ms` } as CSSProperties}
              >
                <div className={`relative overflow-hidden ${i === 0 ? "md:h-64 lg:h-72" : "h-48"}`}>
                  {/* Ken Burns drift owns transform, so no hover scale here. */}
                  <img
                    src="https://images.unsplash.com/photo-1571055931484-22dce9d6c510?w=800&h=600&fit=crop&auto=format"
                    alt=""
                    className="img-cover opacity-70 animate-kenburns"
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
        <div className="reveal relative container-page text-center max-w-4xl">
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

      {/* Seminar registration modal */}
      <SeminarRegistrationModal
        event={registering}
        onClose={() => setRegistering(null)}
        onRegistered={(id) => setRegistered((prev) => [...prev, id])}
      />
    </div>
  );
}
