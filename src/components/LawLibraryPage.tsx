import { useState, useEffect, useCallback } from "react";
import { getPublishedDecisions, type CaseDecision } from "@/lib/content";
import { IconSearch } from "@/components/Icons";
import { usePageMeta } from "@/hooks/usePageMeta";
import { courtDecisionJsonLd } from "@/lib/seo";
import { subscribeToTables } from "@/lib/realtime";
import type { Page } from "@/types/navigation";

type LawLibraryPageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  selectedDecisionId?: string;
};

// Categories are derived from the published decisions at render time, the same
// way the Insights page derives its categories — a hardcoded list would not
// match whatever the firm types into the admin form.

const ALL_CATEGORIES = "All";
const ALL_DIVISIONS = "All";

// decision_date is a plain DATE, so it arrives as "YYYY-MM-DD". Pin the format
// to Manila time, like formatSeminarDate: parsing the bare string gives UTC
// midnight, which would render as the previous day for a visitor west of UTC.
const formatDecisionDate = (value: string | null): string => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/** "G.R. No. 101083 · July 30, 1993", skipping whichever part is missing. */
const citationLine = (decision: CaseDecision): string =>
  [decision.gr_no, formatDecisionDate(decision.decision_date)].filter(Boolean).join(" · ");

export default function LawLibraryPage({ onNavigate, selectedDecisionId }: LawLibraryPageProps) {
  const [decisions, setDecisions] = useState<CaseDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [division, setDivision] = useState(ALL_DIVISIONS);
  const [decisionId, setDecisionId] = useState<string | null>(selectedDecisionId || null);

  // The open decision lives in the URL (?decision=...), so Back closes it and
  // the link can be shared. Keep local state in step when the route changes.
  useEffect(() => {
    setDecisionId(selectedDecisionId || null);
  }, [selectedDecisionId]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await getPublishedDecisions();
      if (data) setDecisions(data);
    } catch (error) {
      console.error("Failed to load court decisions:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live library: a decision published or edited in the portal appears here
  // without a reload. Silent so the spinner never flashes over rendered rows.
  useEffect(() => {
    return subscribeToTables(["court_decisions"], () => void loadData(true), {
      channelKey: "law-library",
    });
  }, [loadData]);

  const openDecision = (id: string | null) => {
    setDecisionId(id);
    onNavigate("law-library", id ? { decision: id } : undefined);
  };

  const decision = decisionId ? decisions.find((d) => d.id === decisionId) : null;

  usePageMeta(
    "law-library",
    decision
      ? {
          title: `${decision.title} — Westwood Law Library`,
          description: decision.summary,
        }
      : undefined,
    decision ? courtDecisionJsonLd(decision) : null,
  );

  if (loading) {
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (decision) {
    return (
      <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
          <button
            onClick={() => openDecision(null)}
            className="flex items-center gap-2 text-[var(--ink-muted)] hover:text-[var(--ink-strong)] text-sm mb-8 transition-colors"
          >
            ← Back to Law Library
          </button>
          <article className="bg-[var(--surface-card)] rounded-2xl border border-[var(--line)] overflow-hidden">
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
                {decision.category && (
                  <span className="bg-[#c9a84c] text-[var(--ink-on-gold)] text-xs font-semibold px-3 py-1.5 rounded mb-6 inline-block">
                    {decision.category}
                  </span>
                )}
                <h1 className="font-serif text-3xl lg:text-4xl font-bold text-white leading-snug mb-4">
                  {decision.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/50 text-sm">
                  <span>{citationLine(decision)}</span>
                  {decision.division && (
                    <>
                      <span>·</span>
                      <span>{decision.division}</span>
                    </>
                  )}
                  {decision.ponente && (
                    <>
                      <span>·</span>
                      <span>Ponente: {decision.ponente}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="p-10">
              <p className="text-[var(--ink-body)] leading-relaxed text-lg">{decision.summary}</p>
              {decision.full_text?.trim() ? (
                <div className="mt-8 space-y-5">
                  {decision.full_text
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
                  The full text of this decision has not been added to the library yet. It is
                  available in the Supreme Court E-Library.
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = decisions.filter((d) => {
    if (category !== ALL_CATEGORIES && d.category !== category) return false;
    if (division !== ALL_DIVISIONS && d.division !== division) return false;
    if (!query) return true;
    return [d.title, d.gr_no, d.summary, d.category, d.ponente].some(
      (v) => typeof v === "string" && v.toLowerCase().includes(query),
    );
  });

  // Only categories/divisions that actually have published decisions.
  const distinct = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort();

  const categories = [ALL_CATEGORIES, ...distinct(decisions.map((d) => d.category))];
  const divisions = [ALL_DIVISIONS, ...distinct(decisions.map((d) => d.division))];

  return (
    <div className="bg-[var(--surface-sunken)] min-h-screen pt-20">
      <div className="bg-[var(--navy-solid)] py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            Jurisprudence
          </p>
          <h1 className="font-serif text-4xl lg:text-5xl font-bold text-white mb-4">Law Library</h1>
          <p className="text-white/60 text-lg max-w-2xl">
            A reference collection of Philippine Supreme Court decisions, summarised for quick
            reading. Summaries are for general information only and are not legal advice.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          <div className="flex-1 relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-muted)]" />
            <input
              type="text"
              placeholder="Search by title, G.R. number, or topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--surface-card)] border border-[var(--line)] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#c9a84c]"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by topic"
            className="bg-[var(--surface-card)] border border-[var(--line)] rounded-lg px-4 py-3 text-sm text-[var(--ink-strong)] focus:outline-none focus:border-[#c9a84c]"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            aria-label="Filter by division"
            className="bg-[var(--surface-card)] border border-[var(--line)] rounded-lg px-4 py-3 text-sm text-[var(--ink-strong)] focus:outline-none focus:border-[#c9a84c]"
          >
            {divisions.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-10 text-center">
            <p className="font-serif text-lg font-bold text-[var(--ink-strong)] mb-2">
              {decisions.length === 0 ? "No decisions yet" : "No decisions match that filter"}
            </p>
            <p className="text-[var(--ink-muted)] text-sm">
              {decisions.length === 0
                ? "Decisions added from the portal will appear here."
                : "Try a different category or clear the search."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((d) => (
              <button
                key={d.id}
                onClick={() => openDecision(d.id)}
                className="group text-left h-full"
              >
                <div className="bg-[var(--surface-card)] rounded-xl p-6 border border-[var(--line)] hover:border-[#c9a84c] transition-all hover:shadow-lg h-full flex flex-col">
                  {d.category && (
                    <span className="self-start bg-[var(--surface-sunken)] text-[var(--ink-strong)] text-xs font-semibold px-2.5 py-1 rounded mb-4">
                      {d.category}
                    </span>
                  )}
                  <h3 className="font-serif text-lg font-bold text-[var(--ink-strong)] mb-2 leading-snug group-hover:text-[#c9a84c] transition-colors">
                    {d.title}
                  </h3>
                  <p className="text-xs font-medium text-[#c9a84c] mb-3">{citationLine(d)}</p>
                  <p className="text-sm text-[var(--ink-muted)] leading-relaxed mb-4 flex-1 line-clamp-4">
                    {d.summary}
                  </p>
                  <span className="text-xs text-[var(--ink-strong)] font-medium group-hover:text-[#c9a84c] transition-colors">
                    Read decision →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--ink-muted)] leading-relaxed mt-10 max-w-3xl">
          Citations are provided for reference. The official text of every decision is published by
          the Supreme Court of the Philippines in the Supreme Court E-Library.
        </p>
      </div>
    </div>
  );
}
