import { useState, useEffect } from "react";
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
import { submitInquiry } from "@/utils/api";
import { useAuth } from "@/hooks/useAuth";
import {
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalHeader,
} from "@/components/ui/Modal";

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

// seminar_events.date is a TIMESTAMPTZ, so it arrives as a full ISO string and
// used to be printed verbatim ("2026-10-15T00:00:00+08:00"). Show the date the
// firm would write on a flyer instead. Manila time, to match the office.
const formatSeminarDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

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
  const [regForm, setRegForm] = useState({ name: "", email: "", phone: "" });
  const [regSending, setRegSending] = useState(false);
  const [regError, setRegError] = useState("");
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [seminarEvents, setSeminarEvents] = useState<SeminarEvent[]>([]);
  const [retainerPackages, setRetainerPackages] = useState<RetainerPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
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
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const openRegistration = (event: SeminarEvent) => {
    setRegForm({
      name: user?.fullName || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setRegError("");
    setRegistering(event);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registering) return;
    setRegError("");

    if (!regForm.name.trim() || !regForm.email.trim()) {
      setRegError("Please enter your name and email address.");
      return;
    }

    setRegSending(true);
    const result = await submitInquiry({
      name: regForm.name,
      email: regForm.email,
      phone: regForm.phone,
      concern: "Seminar registration",
      practiceArea: "",
      message: [
        `I would like to register for the following seminar:`,
        ``,
        `Seminar: ${registering.title}`,
        `Date: ${registering.date}`,
        `Time: ${registering.time}`,
        `Location: ${registering.location}`,
        `Speaker: ${registering.speaker}`,
      ].join("\n"),
    });
    setRegSending(false);

    if (!result.success) {
      setRegError("We could not record your registration. Please try again, or email us directly.");
      return;
    }

    setRegistered((prev) => [...prev, registering.id]);
    setRegistering(null);
  };

  const article = articleId ? articles.find((a) => a.id === articleId) : null;

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (article) {
    const lawyer = lawyers.find((l) => l.id === article.author_id);
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
          <button
            onClick={() => openArticle(null)}
            className="flex items-center gap-2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm mb-8 transition-colors"
          >
            ← Back to Insights & Resources
          </button>
          <div className="bg-white rounded-2xl border border-[#e8e4dc] overflow-hidden">
            <div className="bg-[#0d1f3c] p-10 relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
                  backgroundSize: "60px 60px",
                }}
              />
              <div className="relative">
                <span className="bg-[#c9a84c] text-[#0d1f3c] text-xs font-semibold px-3 py-1.5 rounded mb-6 inline-block">
                  {article.category}
                </span>
                <h1 className="font-serif text-3xl lg:text-4xl font-bold text-white leading-snug mb-4">
                  {article.title}
                </h1>
                <div className="flex items-center gap-4 text-white/50 text-sm">
                  <span>{article.author?.full_name || "Westwood Law Firm"}</span>
                  {article.reading_time && <span>·</span>}
                  <span>{article.reading_time}</span>
                </div>
              </div>
            </div>
            <div className="p-10">
              <p className="text-[#2c3347] leading-relaxed text-lg">{article.excerpt}</p>
              {article.content?.trim() ? (
                <div className="mt-8 space-y-5">
                  {article.content
                    .split(/\n\s*\n/)
                    .map((para) => para.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className="text-[#2c3347] leading-relaxed">
                        {para}
                      </p>
                    ))}
                </div>
              ) : (
                <div className="mt-8 p-5 bg-[#f7f5f0] rounded-xl border border-[#e8e4dc] text-sm text-[#8a9ab5]">
                  This article has no body text yet. Add it from the admin content screen.
                </div>
              )}
              {lawyer && (
                <div className="mt-8 pt-8 border-t border-[#e8e4dc] flex items-center gap-4">
                  <img
                    src={lawyer.profile_image || "/lawyers/placeholder.svg"}
                    alt={lawyer.full_name}
                    className="w-12 h-12 rounded-full object-cover object-top"
                    onError={onPortraitError}
                  />
                  <div>
                    <p className="font-semibold text-[#0d1f3c] text-sm">{lawyer.full_name}</p>
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
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      <div className="bg-[#0d1f3c] py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            Knowledge Hub
          </p>
          <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-4">
            Insights & Resources
          </h1>
          <p className="text-white/60 text-lg max-w-xl">
            Legal insights, updates, guides, FAQs, and seminars from the Westwood team.
          </p>
        </div>
      </div>

      <div className="bg-white border-b border-[#e8e4dc] sticky top-16 lg:top-20 z-30">
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
                  ? "border-[#c9a84c] text-[#0d1f3c]"
                  : "border-transparent text-[#8a9ab5] hover:text-[#0d1f3c]"
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
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a9ab5]" />
                <input
                  type="text"
                  placeholder="Search insights..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-[#e8e4dc] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#c9a84c]"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-white border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            {filteredArticles.length === 0 && (
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center">
                <p className="font-serif text-lg font-bold text-[#0d1f3c] mb-2">
                  No articles match that filter
                </p>
                <p className="text-[#8a9ab5] text-sm">
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
                    className={`bg-white rounded-xl overflow-hidden border border-[#e8e4dc] hover:border-[#c9a84c] transition-all hover:shadow-lg h-full ${
                      i === 0 ? "flex flex-col md:flex-row" : "flex flex-col"
                    }`}
                  >
                    <div
                      className={`bg-[#8a9ab5] ${
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
                        className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                      />
                      <span className="absolute top-4 left-4 bg-[#c9a84c] text-[#0d1f3c] text-xs font-semibold px-2.5 py-1 rounded">
                        {article.category}
                      </span>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3
                        className={`font-serif font-bold text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors mb-2 leading-snug ${
                          i === 0 ? "text-xl" : "text-base"
                        }`}
                      >
                        {article.title}
                      </h3>
                      <p className="text-[#8a9ab5] text-sm leading-relaxed mb-4 flex-1">
                        {article.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-[#8a9ab5]">
                        <span>{article.author?.full_name || "Westwood Law Firm"}</span>
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
            <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center max-w-xl mx-auto">
              <p className="font-serif text-xl font-bold text-[#0d1f3c] mb-3">
                No guides published yet
              </p>
              <p className="text-[#8a9ab5] text-sm leading-relaxed">
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
                  className="bg-white rounded-xl p-6 border border-[#e8e4dc] hover:border-[#c9a84c] transition-all group"
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
                    <span className="text-xs text-[#8a9ab5]">{r.reading_time}</span>
                  </div>
                  <h3 className="font-serif text-base font-bold text-[#0d1f3c] mb-2 leading-snug group-hover:text-[#c9a84c] transition-colors">
                    {r.title}
                  </h3>
                  <p className="text-sm text-[#8a9ab5] leading-relaxed mb-4">{r.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8a9ab5]">
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
              <div key={i} className="bg-white rounded-xl border border-[#e8e4dc] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left"
                >
                  <span className="font-semibold text-[#0d1f3c] pr-4">{faq.question}</span>
                  <span
                    className={`text-[#c9a84c] text-xl transition-transform flex-shrink-0 ${
                      openFaq === i ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-[#2c3347] text-sm leading-relaxed border-t border-[#e8e4dc] pt-4">
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
              <h2 className="font-serif text-3xl font-bold text-[#0d1f3c] mb-3">
                Business Legal Services
              </h2>
              <p className="text-[#8a9ab5] text-base max-w-2xl">
                Westwood offers structured retainer arrangements for businesses seeking ongoing
                legal support. Contact us to discuss the right arrangement for your organization.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {retainerPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`rounded-xl p-7 border-2 flex flex-col ${
                    pkg.is_active && pkg.display_order === 2
                      ? "bg-[#0d1f3c] border-[#c9a84c]"
                      : "bg-white border-[#e8e4dc]"
                  }`}
                >
                  {pkg.display_order === 2 && (
                    <span className="text-xs font-semibold bg-[#c9a84c] text-[#0d1f3c] px-3 py-1 rounded-full self-start mb-5">
                      Most Popular
                    </span>
                  )}
                  <h3
                    className={`font-serif text-2xl font-bold mb-1 ${
                      pkg.display_order === 2 ? "text-white" : "text-[#0d1f3c]"
                    }`}
                  >
                    {pkg.name}
                  </h3>
                  {pkg.tagline && (
                    <p
                      className={`text-xs uppercase tracking-wide mb-2 ${
                        pkg.display_order === 2 ? "text-[#c9a84c]" : "text-[#c9a84c]"
                      }`}
                    >
                      {pkg.tagline}
                    </p>
                  )}
                  <p
                    className={`text-sm mb-5 ${
                      pkg.display_order === 2 ? "text-white/60" : "text-[#8a9ab5]"
                    }`}
                  >
                    {pkg.description}
                  </p>
                  {/* price_display holds the text the firm wants shown ("From ₱25,000/mo",
                      "Contact for quote"). `price` is a numeric column and is empty for
                      every seeded package, so the cards used to render a blank line. */}
                  <div className="text-sm font-semibold mb-6 text-[#c9a84c]">
                    {pkg.price_display ||
                      (pkg.price != null && String(pkg.price).trim() !== ""
                        ? `₱${pkg.price}`
                        : "Contact for quote")}
                  </div>
                  <ul className="space-y-3 flex-1 mb-6">
                    {(pkg.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-3">
                        <IconCheck
                          className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                            pkg.display_order === 2 ? "text-[#c9a84c]" : "text-[#c9a84c]"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            pkg.display_order === 2 ? "text-white/80" : "text-[#2c3347]"
                          }`}
                        >
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onNavigate("contact")}
                    className={`w-full py-3 rounded text-sm font-semibold transition-colors ${
                      pkg.display_order === 2
                        ? "bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c]"
                        : "border border-[#0d1f3c] text-[#0d1f3c] hover:bg-[#0d1f3c] hover:text-white"
                    }`}
                  >
                    {pkg.cta_text}
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-[#f7f5f0] rounded-xl p-6 border border-[#e8e4dc]">
              <p className="text-sm text-[#8a9ab5] leading-relaxed">
                <strong className="text-[#2c3347]">Note:</strong> Retainer packages are customized
                to each client&apos;s needs. Pricing shown is indicative. Contact our team for a
                formal proposal and engagement terms tailored to your business.
              </p>
            </div>
          </div>
        )}

        {/* Seminars */}
        {tab === "seminars" && (
          <div className="space-y-6">
            {seminarEvents.map((event) => (
              <div key={event.id} className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
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
                    <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-3">
                      {event.title}
                    </h3>
                    <p className="text-[#2c3347] text-sm leading-relaxed mb-4">
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
                          <span className="text-[#8a9ab5] text-xs">{label}</span>
                          <p className="text-[#0d1f3c] font-medium">{value}</p>
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
                        <p className="font-semibold text-[#0d1f3c] text-sm">Registered!</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => openRegistration(event)}
                        className="bg-[#0d1f3c] hover:bg-[#162d52] text-white font-semibold px-8 py-4 rounded transition-colors text-sm"
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
      {registering && (
        <Modal
          open
          onClose={() => setRegistering(null)}
          size="lg"
          labelledBy="seminar-register-title"
          dismissible={!regSending}
        >
          <ModalHeader
            tone="light"
            title="Register for this Seminar"
            titleId="seminar-register-title"
            description={`${registering.title} · ${registering.date} · ${registering.time}`}
            onClose={() => setRegistering(null)}
            closeDisabled={regSending}
          />

          <ModalBody className="p-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className={MODAL_LABEL_CLASS}>
                  Full Name *
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  disabled={regSending}
                  placeholder="Juan Dela Cruz"
                  className={MODAL_INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-email" className={MODAL_LABEL_CLASS}>
                    Email Address *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    disabled={regSending}
                    placeholder="you@email.com"
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="reg-phone" className={MODAL_LABEL_CLASS}>
                    Phone
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    disabled={regSending}
                    placeholder="(63) 917 000 0000"
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
              </div>

              {regError && (
                <p role="alert" className={MODAL_ERROR_CLASS}>
                  {regError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setRegistering(null)}
                  disabled={regSending}
                  className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regSending}
                  className="flex-1 bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-all text-sm active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                >
                  {regSending ? "Registering…" : "Confirm Registration"}
                </button>
              </div>

              <p className="text-xs text-[#8a9ab5] leading-relaxed text-center">
                The firm will confirm your slot by email. Seats are subject to availability.
              </p>
            </form>
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}
