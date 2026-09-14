import { useState, useEffect } from "react";
import {
  getLawyers,
  getPracticeAreas,
  getPublishedArticles,
  type Lawyer,
  type PracticeArea,
  type Article,
} from "@/lib/content";
import { IconBookmark, IconSearch, IconArrowRight } from "@/components/Icons";
import { PracticeAreaIcon } from "@/components/Icons";
import { onPortraitError } from "@/utils/image";
import { useAuth } from "@/hooks/useAuth";
import InquiryFallback from "@/components/InquiryFallback";

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

type LawyersPageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  selectedLawyerId?: string;
  savedLawyers: string[];
  onToggleSave: (id: string) => void;
};

const matchSteps = [
  { key: "area", question: "What practice area do you need?" },
  { key: "client_type", question: "Are you an individual or a business?" },
  { key: "assistance", question: "What kind of assistance do you need?" },
  { key: "preference", question: "How would you prefer to consult?" },
];

const clientTypes = ["Individual / Personal", "Business / Corporate"];
const assistanceTypes = [
  "Legal Advice",
  "Document Drafting",
  "Representation",
  "Ongoing Counsel",
  "Not Sure",
];
const preferenceTypes = ["In-Person", "Video Call", "Phone Call", "No Preference"];

export default function LawyersPage({
  onNavigate,
  selectedLawyerId,
  savedLawyers,
  onToggleSave,
}: LawyersPageProps) {
  const { user } = useAuth();
  // Inquiries and consultations are for registered clients; everyone else is
  // pointed at the Contact page.
  const canInquire = user?.role === "client";
  const [search, setSearch] = useState("");
  const [filterPA, setFilterPA] = useState("all");
  const [profileId, setProfileId] = useState<string | null>(selectedLawyerId || null);
  const [showMatcher, setShowMatcher] = useState(false);

  // The open profile lives in the URL so Back closes it and the link is
  // shareable. Track the route when it changes underneath us.
  useEffect(() => {
    setProfileId(selectedLawyerId || null);
  }, [selectedLawyerId]);

  const openProfile = (id: string | null) => {
    setProfileId(id);
    onNavigate("lawyers", id ? { lawyer: id } : undefined);
  };
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [lawyerResult, paResult, articleResult] = await Promise.all([
          getLawyers(),
          getPracticeAreas(),
          getPublishedArticles(),
        ]);

        if (lawyerResult.data) setLawyers(lawyerResult.data);
        if (paResult.data) setPracticeAreas(paResult.data);
        if (articleResult.data) setArticles(articleResult.data);
      } catch (error) {
        console.error("Failed to load lawyers page data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filtered = lawyers.filter((l) => {
    const matchSearch =
      !search ||
      l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.practice_areas?.some((pa) => pa.name.toLowerCase().includes(search.toLowerCase()));
    const matchPA = filterPA === "all" || l.practice_areas?.some((pa) => pa.id === filterPA);
    return matchSearch && matchPA;
  });

  const profile = profileId ? lawyers.find((l) => l.id === profileId) : null;

  if (loading) {
    return (
      <div className="bg-[var(--color-bg-primary)] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (profile) {
    return (
      <LawyerProfile
        lawyer={profile}
        onBack={() => openProfile(null)}
        onNavigate={onNavigate}
        savedLawyers={savedLawyers}
        onToggleSave={onToggleSave}
        articles={articles}
        practiceAreas={practiceAreas}
        canInquire={canInquire}
      />
    );
  }

  if (showMatcher) {
    return (
      <FindMyLawyer
        onBack={() => setShowMatcher(false)}
        onNavigate={onNavigate}
        onView={(id) => openProfile(id)}
        practiceAreas={practiceAreas}
        lawyers={lawyers}
        canInquire={canInquire}
      />
    );
  }

  return (
    <div className="bg-[var(--color-bg-primary)] min-h-screen pt-20">
      <section className="gradient-navy py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pattern-grid" />
        <div className="relative container-page flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="animate-slide-up">
            <p className="text-accent-sm mb-3">Our Team</p>
            <h1 className="heading-display text-[length:var(--text-display-lg)] text-white mb-4">
              Our Lawyers
            </h1>
            <p className="text-lead text-white/70 max-w-xl">
              Experienced, specialized, and client-centered legal professionals committed to your
              best outcome.
            </p>
          </div>
          <button
            onClick={() => setShowMatcher(true)}
            className="btn-primary self-start lg:self-auto animate-slide-up stagger-1"
          >
            Find My Lawyer
          </button>
        </div>
      </section>

      <section className="section-py container-page">
        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-10 animate-slide-up">
          <div className="flex-1 relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search lawyers by name or expertise..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base pl-11"
            />
          </div>
          <select
            value={filterPA}
            onChange={(e) => setFilterPA(e.target.value)}
            className="input-base min-w-[220px] appearance-none pr-10"
          >
            <option value="all">All Practice Areas</option>
            {practiceAreas.map((pa) => (
              <option key={pa.id} value={pa.id}>
                {pa.name}
              </option>
            ))}
          </select>
        </div>

        <p className="text-muted mb-8">
          {filtered.length} lawyer{filtered.length !== 1 ? "s" : ""} found
        </p>

        {/* Lawyer Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((lawyer, index) => (
              <LawyerCard
                key={lawyer.id}
                lawyer={lawyer}
                onView={() => openProfile(lawyer.id)}
                onInquiry={() => onNavigate("inquiry")}
                onContact={() => onNavigate("contact")}
                canInquire={canInquire}
                saved={savedLawyers.includes(lawyer.id)}
                onToggleSave={() => onToggleSave(lawyer.id)}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 animate-slide-up">
            <p className="text-body">No lawyers match your search.</p>
            <button
              onClick={() => {
                setSearch("");
                setFilterPA("all");
              }}
              className="mt-4 btn-link"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Find My Lawyer questionnaire ────────────────────────────────────────────

function FindMyLawyer({
  onBack,
  onNavigate,
  onView,
  practiceAreas,
  lawyers,
  canInquire,
}: {
  onBack: () => void;
  onNavigate: (p: Page, params?: Record<string, string>) => void;
  onView: (id: string) => void;
  practiceAreas: PracticeArea[];
  lawyers: Lawyer[];
  canInquire: boolean;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Lawyer[] | null>(null);

  const answer = (key: string, value: string) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (step < matchSteps.length - 1) {
      setStep(step + 1);
    } else {
      const pa = next.area;
      const matched = pa
        ? lawyers.filter((l) => l.practice_areas?.some((p) => p.id === pa))
        : lawyers.slice(0, 3);
      setResults(matched.length > 0 ? matched : lawyers.slice(0, 3));
    }
  };

  return (
    <div className="bg-[var(--color-bg-primary)] min-h-screen pt-20">
      <section className="gradient-navy py-16 lg:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pattern-grid" />
        <div className="relative container-page max-w-3xl">
          <button onClick={onBack} className="btn-link text-white/60 hover:text-white mb-6 text-sm">
            ← Back to Our Lawyers
          </button>
          <p className="text-accent-sm mb-3">Lawyer Matching</p>
          <h1 className="heading-display text-[length:var(--text-display-md)] text-white">
            Find My Lawyer
          </h1>
        </div>
      </section>

      <section className="section-py container-page max-w-3xl">
        {results ? (
          <div className="animate-slide-up">
            <h2 className="heading-section mb-2">Recommended Lawyers</h2>
            <p className="text-body mb-8">
              Based on your responses, we recommend the following Westwood lawyers.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              {results.map((l, index) => (
                <article
                  key={l.id}
                  className="card-hover-lift animate-slide-up"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <img
                    src={l.profile_image || "/lawyers/placeholder.svg"}
                    alt={l.full_name}
                    className="w-full aspect-[4/5] object-cover object-top"
                    onError={onPortraitError}
                  />
                  <div className="p-5">
                    <h3 className="heading-card text-sm mb-0.5">{l.full_name}</h3>
                    <p className="text-accent-sm text-[var(--color-gold)] mb-4">
                      {l.position || "Lawyer"}
                    </p>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => onView(l.id)} className="btn-secondary text-sm py-2.5">
                        View Profile
                      </button>
                      {canInquire && (
                        <button
                          onClick={() => onNavigate("consultation", { lawyer: l.id })}
                          className="btn-primary text-sm py-2.5"
                        >
                          Schedule Consultation
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setResults(null);
                  setStep(0);
                  setAnswers({});
                }}
                className="btn-outline"
              >
                Start Over
              </button>
              {canInquire ? (
                <>
                  <button onClick={() => onNavigate("consultation")} className="btn-primary">
                    Schedule Consultation
                  </button>
                  <button onClick={() => onNavigate("inquiry")} className="btn-secondary">
                    Start a Legal Inquiry
                  </button>
                </>
              ) : (
                <button onClick={() => onNavigate("contact")} className="btn-primary">
                  Contact Us
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="card p-8 animate-slide-up">
            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-8">
              {matchSteps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= step ? "bg-[var(--color-gold)]" : "bg-[var(--color-border-light)]"
                  }`}
                />
              ))}
            </div>

            <p className="text-accent-sm mb-2">
              Step {step + 1} of {matchSteps.length}
            </p>
            <h2 className="heading-section mb-8">{matchSteps[step].question}</h2>

            <div className="space-y-3">
              {step === 0 &&
                practiceAreas.map((pa) => (
                  <button
                    key={pa.id}
                    onClick={() => answer("area", pa.id)}
                    className="w-full card p-4 flex items-center gap-4 text-left group hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                  >
                    <PracticeAreaIcon
                      id={pa.id}
                      className="w-5 h-5 text-[var(--color-gold)] flex-shrink-0"
                    />
                    <span className="font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-gold)] transition-colors">
                      {pa.name}
                    </span>
                    <IconArrowRight className="w-4 h-4 text-[var(--color-text-muted)] ml-auto group-hover:text-[var(--color-gold)] transition-all" />
                  </button>
                ))}
              {step === 1 &&
                clientTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => answer("client_type", t)}
                    className="w-full card p-4 text-left hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                  >
                    <span className="font-medium text-[var(--color-text-primary)]">{t}</span>
                  </button>
                ))}
              {step === 2 &&
                assistanceTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => answer("assistance", t)}
                    className="w-full card p-4 text-left hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                  >
                    <span className="font-medium text-[var(--color-text-primary)]">{t}</span>
                  </button>
                ))}
              {step === 3 &&
                preferenceTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => answer("preference", t)}
                    className="w-full card p-4 text-left hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                  >
                    <span className="font-medium text-[var(--color-text-primary)]">{t}</span>
                  </button>
                ))}
            </div>

            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="mt-6 btn-link">
                ← Back
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Lawyer Card ─────────────────────────────────────────────────────────────

function LawyerCard({
  lawyer,
  onView,
  onInquiry,
  onContact,
  canInquire,
  saved,
  onToggleSave,
  index = 0,
}: {
  lawyer: Lawyer;
  onView: () => void;
  onInquiry: () => void;
  onContact: () => void;
  canInquire: boolean;
  saved: boolean;
  onToggleSave: () => void;
  index?: number;
}) {
  return (
    <article
      className="card-hover-lift group animate-slide-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative overflow-hidden bg-[var(--color-slate-muted)]">
        {/* 4:5 with object-top: the source portraits are 4:5, so nothing is
            cropped off the top of anyone's head the way the old h-56 wide
            band did. */}
        <img
          src={lawyer.profile_image || "/lawyers/placeholder.svg"}
          onError={onPortraitError}
          alt={lawyer.full_name}
          className="w-full aspect-[4/5] object-cover object-top group-hover:scale-[1.03] transition-transform duration-700"
        />
        <button
          onClick={onToggleSave}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
            saved
              ? "bg-[var(--color-gold)] text-[var(--color-navy)] shadow-[var(--shadow-gold-sm)]"
              : "bg-white/90 text-[var(--color-text-muted)] hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:shadow-[var(--shadow-gold-sm)]"
          }`}
          aria-label={saved ? "Remove from saved" : "Save lawyer"}
        >
          <IconBookmark className="w-4.5 h-4.5" filled={saved} />
        </button>
      </div>
      <div className="p-5">
        <h3 className="heading-card text-sm mb-1 group-hover:text-[var(--color-gold)] transition-colors">
          {lawyer.full_name}
        </h3>
        <p className="text-accent-sm text-[var(--color-gold)] mb-4">
          {lawyer.position || "Lawyer"}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {lawyer.practice_areas?.slice(0, 3).map((pa) => (
            <span key={pa.id} className="badge-outline">
              {pa.name}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border-light)]">
          <button onClick={onView} className="btn-secondary text-sm py-2.5">
            View Profile
          </button>
          {canInquire ? (
            <button onClick={onInquiry} className="btn-outline text-sm py-2.5">
              Start Inquiry
            </button>
          ) : (
            <button onClick={onContact} className="btn-outline text-sm py-2.5">
              Contact Us
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Lawyer Profile ──────────────────────────────────────────────────────────

function LawyerProfile({
  lawyer,
  onBack,
  onNavigate,
  savedLawyers,
  onToggleSave,
  articles,
  practiceAreas,
  canInquire,
}: {
  lawyer: Lawyer;
  onBack: () => void;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  savedLawyers: string[];
  onToggleSave: (id: string) => void;
  articles: Article[];
  practiceAreas: PracticeArea[];
  canInquire: boolean;
}) {
  const saved = savedLawyers.includes(lawyer.id);
  const lawyerArticles = articles.filter((a) => a.author_id === lawyer.id);
  const lawyerPAs = lawyer.practice_areas || [];

  return (
    <div className="bg-[var(--color-bg-primary)] min-h-screen pt-20">
      <section className="section-py container-page">
        <button onClick={onBack} className="btn-link text-sm mb-8">
          ← Back to Lawyers
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="card sticky top-24 overflow-hidden">
              <div className="relative bg-[var(--color-navy)]">
                <img
                  src={lawyer.profile_image || "/lawyers/placeholder.svg"}
                  onError={onPortraitError}
                  alt={lawyer.full_name}
                  className="w-full aspect-[4/5] object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy)] to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h1 className="heading-display text-2xl lg:text-3xl text-white mb-1">
                    {lawyer.full_name}
                  </h1>
                  <p className="text-accent-sm text-[var(--color-gold)]">
                    {lawyer.position || "Lawyer"}
                  </p>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {canInquire ? (
                  <>
                    <button
                      onClick={() => onNavigate("consultation", { lawyer: lawyer.id })}
                      className="btn-primary w-full"
                    >
                      Schedule a Consultation
                    </button>
                    <button onClick={() => onNavigate("inquiry")} className="btn-secondary w-full">
                      Start a Legal Inquiry
                    </button>
                  </>
                ) : (
                  <InquiryFallback onNavigate={onNavigate} />
                )}
                <button
                  onClick={() => onToggleSave(lawyer.id)}
                  className={`w-full btn flex items-center justify-center gap-2 ${
                    saved
                      ? "border-[var(--color-gold)] text-[var(--color-gold)] bg-[var(--color-gold-muted)]"
                      : "btn-outline"
                  }`}
                >
                  <IconBookmark className="w-4 h-4" filled={saved} />
                  {saved ? "Saved" : "Save Lawyer"}
                </button>
                <div className="border-t border-[var(--color-border-light)] pt-4 space-y-4">
                  <div>
                    <p className="text-micro uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                      Email
                    </p>
                    <p className="text-body font-medium text-[var(--color-text-primary)]">
                      {lawyer.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-micro uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                      Availability
                    </p>
                    <p className="text-body-sm text-[var(--color-text-secondary)]">
                      Contact for availability
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <section className="card p-8">
              <h2 className="heading-section mb-5">Biography</h2>
              <p className="text-body text-[var(--color-text-secondary)] leading-relaxed">
                {lawyer.bio || "Bio not available."}
              </p>
              {Array.isArray(lawyer.education) && lawyer.education.length > 0 && (
                <div className="mt-4">
                  <p className="text-body font-semibold text-[var(--color-text-primary)] mb-1">
                    Education
                  </p>
                  <ul className="text-body text-[var(--color-text-secondary)] space-y-1">
                    {lawyer.education.map(
                      (e: { school: string; degree: string; year?: string }, i: number) => (
                        <li key={i}>{[e.degree, e.school, e.year].filter(Boolean).join(" · ")}</li>
                      ),
                    )}
                  </ul>
                </div>
              )}
              {Array.isArray(lawyer.bar_admissions) && lawyer.bar_admissions.length > 0 && (
                <p className="mt-3 text-body text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    Admitted to:{" "}
                  </span>
                  {lawyer.bar_admissions.join(", ")}
                </p>
              )}
            </section>

            <section className="card p-8">
              <h2 className="heading-section mb-5">Areas of Expertise</h2>
              <div className="flex flex-wrap gap-2">
                {lawyerPAs.map((pa) => (
                  <span key={pa.id} className="badge-navy">
                    {pa.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="card p-8">
              <h2 className="heading-section mb-5">Practice Areas</h2>
              <div className="space-y-2">
                {lawyerPAs.map((pa) => (
                  <button
                    key={pa.id}
                    onClick={() => onNavigate("expertise", { area: pa.id })}
                    className="w-full card p-4 flex items-center justify-between gap-4 text-left group hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <PracticeAreaIcon
                        id={pa.id}
                        className="w-5 h-5 text-[var(--color-gold)] flex-shrink-0"
                      />
                      <div>
                        <div className="font-semibold text-[var(--color-text-primary)]">
                          {pa.name}
                        </div>
                        <div className="text-caption text-[var(--color-text-muted)] mt-0.5">
                          {(pa.services || []).length} services
                        </div>
                      </div>
                    </div>
                    <IconArrowRight className="w-4 h-4 text-[var(--color-gold)] group-hover:translate-x-1 transition-transform flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>

            {lawyerArticles.length > 0 && (
              <section className="card p-8">
                <h2 className="heading-section mb-5">Related Insights</h2>
                <div className="space-y-3">
                  {lawyerArticles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() =>
                        onNavigate("insights-resources", {
                          article: article.id,
                        })
                      }
                      className="w-full card p-4 text-left group hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-all"
                    >
                      <span className="text-accent-sm text-[var(--color-gold)] mb-1 block">
                        {article.category}
                      </span>
                      <h4 className="font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-gold)] transition-colors leading-snug">
                        {article.title}
                      </h4>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="card p-6 bg-[var(--color-bg-tertiary)]">
              <p className="text-caption text-[var(--color-text-muted)] leading-relaxed">
                <strong className="text-[var(--color-text-primary)]">Important Notice:</strong>{" "}
                Submitting a legal inquiry does not establish an attorney-client relationship. A
                formal relationship is formed only upon execution of an engagement agreement with
                Westwood Law Firm.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
