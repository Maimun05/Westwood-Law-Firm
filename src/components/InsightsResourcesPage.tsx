import { useState, useEffect, useCallback } from "react";
import {
  getPublishedArticles,
  getLawyers,
  getFAQs,
  getUpcomingSeminars,
  getRetainerPackages,
  type Article,
  type Lawyer,
  type FAQ,
  type SeminarEvent,
  type RetainerPackage,
} from "@/lib/content";
import { IconSearch, IconCheck } from "@/components/Icons";
import { onPortraitError } from "@/utils/image";
import { formatSeminarDate } from "@/utils/seminar";
import RetainerPackageCard from "@/components/RetainerPackageCard";
import SeminarRegistrationModal from "@/components/SeminarRegistrationModal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { articleJsonLd } from "@/lib/seo";
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

type InsightsResourcesPageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  selectedArticleId?: string;
};

// The category list is derived from the published articles at render time.
// It used to be a hardcoded array (Corporate, Employment, Property, ...) that
// matched none of the seeded categories (Corporate and Commercial Laws, Labor
// and Industrial Relations, ...), so picking any option showed an empty grid.
const ALL_CATEGORIES = "All";

export default function InsightsResourcesPage({
  onNavigate,
  selectedArticleId,
}: InsightsResourcesPageProps) {
  const [tab, setTab] = useState<"insights" | "guides" | "faq" | "seminars" | "business">(
    "insights",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [articleId, setArticleId] = useState<string | null>(selectedArticleId || null);

  // The open article is part of the URL, so Back closes it and the link can be
  // shared. Keep local state in step when the route changes underneath us.
  useEffect(() => {
    setArticleId(selectedArticleId || null);
  }, [selectedArticleId]);

  const openArticle = (id: string | null) => {
    setArticleId(id);
    onNavigate("insights-resources", id ? { article: id } : undefined);
  };
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Registrations are recorded as inquiries, so the firm sees them in the same
  // queue as every other request. The old code only flipped a local boolean:
  // the visitor saw "Registered!" and the firm never heard about it.
  const [registered, setRegistered] = useState<string[]>([]);
  const [registering, setRegistering] = useState<SeminarEvent | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [seminarEvents, setSeminarEvents] = useState<SeminarEvent[]>([]);
  const [retainerPackages, setRetainerPackages] = useState<RetainerPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount. The same function serves every live refetch.
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [articleResult, lawyerResult, faqResult, seminarResult, packageResult] =
        await Promise.all([
          getPublishedArticles(),
          getLawyers(),
          getFAQs(),
          getUpcomingSeminars(),
          getRetainerPackages(),
        ]);

      if (articleResult.data) setArticles(articleResult.data);
      if (lawyerResult.data) setLawyers(lawyerResult.data);
      if (faqResult.data) setFaqs(faqResult.data);
      if (seminarResult.data) setSeminarEvents(seminarResult.data);
      if (packageResult.data) setRetainerPackages(packageResult.data);
    } catch (error) {
      console.error("Failed to load insights resources data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live content: an article, FAQ, seminar or retainer edit saved in the
  // portal reaches this page without a reload. A silent refetch never flashes
  // the spinner over rendered content; the open article stays open.
  useEffect(() => {
    return subscribeToTables(
      ["articles", "profiles", "faqs", "seminar_events", "retainer_packages"],
      () => void loadData(true),
      { channelKey: "insights" },
    );
  }, [loadData]);

  const openRegistration = (event: SeminarEvent) => setRegistering(event);

  const article = articleId ? articles.find((a) => a.id === articleId) : null;

  usePageMeta(
    "insights-resources",
    article
      ? { title: `${article.title} — Westwood Law Firm`, description: article.excerpt }
      : undefined,
    article
      ? articleJsonLd(article, lawyers.find((l) => l.id === article.author_id)?.full_name)
      : null,
  );

  if (loading) {
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (article) {
    const lawyer = lawyers.find((l) => l.id === article.author_id);
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
          <button
            onClick={() => openArticle(null)}
            className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--ink-strong)] text-sm mb-8 transition-colors"
          >
            ← Back to Insights & Resources
          </button>
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--line)] overflow-hidden">
            <div className="bg-[var(--navy-solid)] p-10 relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
                  backgroundSize: "60px 60px",
                }}
              />
              <div className="relative">
                <span className="bg-[#c9a84c] text-[var(--ink-on-gold)] text-xs font-semibold px-3 py-1.5 rounded mb-6 inline-block">
                  {article.category}
                </span>
                <h1 className="font-serif text-3xl lg:text-4xl font-bold text-white leading-snug mb-4">
                  {article.title}
                </h1>
                <div className="flex items-center gap-4 text-white/50 text-sm">
                  <span>
                    {lawyer?.full_name || article.author?.full_name || "Westwood Law Firm"}
                  </span>
                  {article.reading_time && <span>·</span>}
                  <span>{article.reading_time}</span>
                </div>
              </div>
            </div>
            <div className="p-10">
              <p className="text-[var(--ink-body)] leading-relaxed text-lg">{article.excerpt}</p>
              {article.content?.trim() ? (
                <div className="mt-8 space-y-5">
                  {article.content
                    .split(/\n\s*\n/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className="text-[var(--ink-body)] leading-relaxed">
                        {para}
                      </p>
                    ))}
                </div>
              ) : (
                <div className="mt-8 p-5 bg-[var(--surface-sunken)] rounded-xl border border-[var(--line)] text-sm text-[var(--ink-muted)]">
                  This article has no body text yet. Add it from the admin content screen.
                </div>
              )}
              {lawyer && (
                <div className="mt-8 pt-8 border-t border-[var(--line)] flex items-center gap-4">
                  <img
                    src={lawyer.profile_image || "/lawyers/placeholder.svg"}
                    alt={lawyer.full_name}
                    loading="lazy"
                    decoding="async"
                    className="w-12 h-12 rounded-full object-cover object-top"
                    onError={onPortraitError}
                  />
                  <div>
                    <p className="font-semibold text-[var(--ink-strong)] text-sm">
                      {lawyer.full_name}
                    </p>
                    <p className="text-[#c9a84c] text-xs font-medium">
                      {lawyer.position || "Lawyer"}
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate("lawyers", { lawyer: lawyer.id })}
                    className="ml-auto text-xs text-[#c9a84c] hover:underline"
                  >
                    View Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredArticles = articles.filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === ALL_CATEGORIES || a.category === category;
    return matchSearch && matchCat;
  });

  // Only categories that actually have published articles.
  const categories = [
    ALL_CATEGORIES,
    ...Array.from(new Set(articles.map((a) => a.category).filter(Boolean))).sort(),
  ];

  // Guides & Updates reads articles flagged as a guide or a legal update. The
  // seed publishes neither yet, so the tab shows an honest empty state instead
  // of a silently blank grid.
  const guidesAndUpdates = articles.filter(
    (a) => a.category === "Guide" || a.category === "Legal Update",
  );

  return (
    <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
      <div className="bg-[var(--navy-solid)] py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            Knowledge Hub
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-4">
            Insights & Resources
          </h1>
          <p className="text-white/60 text-lg max-w-xl">
            Legal insights, updates, guides, FAQs, and seminars from the Westwood team.
          </p>
        </div>
      </div>

      <div className="bg-[var(--surface-card)] border-b border-[var(--line)] sticky top-16 lg:top-20 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex gap-0 overflow-x-auto">
          {(
            [
              { key: "insights", label: "Legal Insights" },
              { key: "guides", label: "Guides & Updates" },
              { key: "faq", label: "FAQ" },
              { key: "seminars", label: "Seminars & Events" },
              { key: "business", label: "Business Resources" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "border-[#c9a84c] text-[var(--ink-strong)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        {/* Legal Insights */}
        {tab === "insights" && (
          <div>
            <div className="flex flex-col md:flex-row gap-4 mb-10">
              <div className="flex-1 relative">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
                <input
                  type="text"
                  placeholder="Search insights..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[var(--surface-card)] border border-[var(--line)] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#c9a84c]"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-[var(--surface-card)] border border-[var(--line)] rounded-lg px-4 py-3 text-sm text-[var(--ink-strong)] focus:outline-none focus:border-[#c9a84c]"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            {filteredArticles.length === 0 && (
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-10 text-center">
                <p className="font-serif text-lg font-bold text-[var(--ink-strong)] mb-2">
                  No articles match that filter
                </p>
                <p className="text-[var(--ink-muted)] text-sm">
                  {search ? <>Nothing found for “{search}”. </> : null}
                  Try a different category or clear the search.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {filteredArticles.map((article, i) => (
                <button
                  key={article.id}
                  onClick={() => openArticle(article.id)}
                  className={`group text-left ${i === 0 ? "lg:col-span-2" : ""}`}
                >
                  <div
                    className={`bg-[var(--surface-card)] rounded-xl overflow-hidden border border-[var(--line)] hover:border-[#c9a84c] transition-all hover:shadow-lg h-full ${
                      i === 0 ? "flex flex-col md:flex-row" : "flex flex-col"
                    }`}
                  >
                    <div
                      className={`bg-[var(--placeholder)] ${
                        i === 0 ? "md:w-2/5 min-h-[200px]" : "h-44"
                      } relative overflow-hidden flex-shrink-0`}
                    >
                      <img
                        src={
                          article.cover_image ||
                          "https://images.unsplash.com/photo-1571055931484-22dce9d6c510?w=600&h=400&fit=crop&auto=format"
                        }
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                      />
                      <span className="absolute top-4 left-4 bg-[#c9a84c] text-[var(--ink-on-gold)] text-xs font-semibold px-2.5 py-1 rounded">
                        {article.category}
                      </span>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3
                        className={`font-serif font-bold text-[var(--ink-strong)] group-hover:text-[#c9a84c] transition-colors mb-2 leading-snug ${
                          i === 0 ? "text-xl" : "text-base"
                        }`}
                      >
                        {article.title}
                      </h3>
                      <p className="text-[var(--ink-muted)] text-sm leading-relaxed mb-4 flex-1">
                        {article.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                        <span>
                          {lawyers.find((l) => l.id === article.author_id)?.full_name ||
                            article.author?.full_name ||
                            "Westwood Law Firm"}
                        </span>
                        <span>{article.reading_time}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Guides & Updates */}
        {tab === "guides" &&
          (guidesAndUpdates.length === 0 ? (
            <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-10 text-center max-w-xl mx-auto">
              <p className="font-serif text-xl font-bold text-[var(--ink-strong)] mb-3">
                No guides published yet
              </p>
              <p className="text-[var(--ink-muted)] text-sm leading-relaxed">
                Step-by-step guides and legal updates will appear here once the firm publishes them.
                In the meantime, the articles under <strong>Legal Insights</strong> cover the same
                subject areas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {guidesAndUpdates.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--surface-card)] rounded-xl p-6 border border-[var(--line)] hover:border-[#c9a84c] transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded ${
                        r.category === "Legal Update"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {r.category}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)]">{r.reading_time}</span>
                  </div>
                  <h3 className="font-serif text-base font-bold text-[var(--ink-strong)] mb-2 leading-snug group-hover:text-[#c9a84c] transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4">
                    {r.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--ink-muted)]">
                      {new Date(r.published_at || r.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => openArticle(r.id)}
                      className="text-xs text-[#c9a84c] font-medium hover:underline"
                    >
                      Read More →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {/* FAQ */}
        {tab === "faq" && (
          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-semibold text-[var(--ink-strong)] pr-4">
                    {faq.question}
                  </span>
                  <span
                    className={`text-[#c9a84c] text-xl transition-transform flex-shrink-0 ${
                      openFaq === i ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-[var(--ink-body)] text-sm leading-relaxed border-t border-[var(--line)] pt-4">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Business Resources — Retainer Packages */}
        {tab === "business" && (
          <div className="space-y-8">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-2">
                Legal Retainer Packages
              </p>
              <h2 className="font-serif text-3xl font-bold text-[var(--ink-strong)] mb-3">
                Business Legal Services
              </h2>
              <p className="text-[var(--ink-muted)] text-base max-w-2xl">
                Westwood offers structured retainer arrangements for businesses seeking ongoing
                legal support. Contact us to discuss the right arrangement for your organization.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {retainerPackages.map((pkg) => (
                <RetainerPackageCard
                  key={pkg.id}
                  pkg={pkg}
                  onSelect={() => onNavigate("contact")}
                />
              ))}
            </div>
            <div className="bg-[var(--surface-sunken)] rounded-xl p-6 border border-[var(--line)]">
              <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
                <strong className="text-[var(--ink-body)]">Note:</strong> Retainer packages are
                customized to each client&apos;s needs. Pricing shown is indicative. Contact our
                team for a formal proposal and engagement terms tailored to your business.
              </p>
            </div>
          </div>
        )}

        {/* Seminars */}
        {tab === "seminars" && (
          <div className="space-y-6">
            {seminarEvents.map((event) => (
              <div
                key={event.id}
                className="bg-[var(--surface-card)] rounded-xl p-8 border border-[var(--line)]"
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded ${
                          event.mode === "Online"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {event.mode}
                      </span>
                    </div>
                    <h3 className="font-serif text-xl font-bold text-[var(--ink-strong)] mb-3">
                      {event.title}
                    </h3>
                    <p className="text-[var(--ink-body)] text-sm leading-relaxed mb-4">
                      {event.description}
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {[
                        ["Date", formatSeminarDate(event.date)],
                        ["Time", event.time],
                        ["Location", event.location],
                        ["Speaker", event.speaker],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span className="text-[var(--ink-muted)] text-xs">{label}</span>
                          <p className="text-[var(--ink-strong)] font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    {registered.includes(event.id) ? (
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-[#c9a84c]/20 flex items-center justify-center mx-auto mb-3">
                          <IconCheck className="w-5 h-5 text-[#c9a84c]" />
                        </div>
                        <p className="font-semibold text-[var(--ink-strong)] text-sm">
                          Registered!
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => openRegistration(event)}
                        className="bg-[var(--navy-solid)] hover:bg-[#162d52] text-white font-semibold px-8 py-4 rounded transition-colors text-sm"
                      >
                        Register
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seminar registration modal */}
      <SeminarRegistrationModal
        event={registering}
        onClose={() => setRegistering(null)}
        onRegistered={(id) => setRegistered((prev) => [...prev, id])}
      />
    </div>
  );
}
