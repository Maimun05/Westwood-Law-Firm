import { useState, useEffect } from "react";
import {
  getSpecialists,
  getLawyers,
  getPracticeAreas,
  type Specialist,
  type Lawyer,
  type PracticeArea,
} from "@/lib/content";
import { PracticeAreaIcon, IconSearch } from "@/components/Icons";
import { PORTRAIT_PLACEHOLDER, onPortraitError } from "@/utils/image";

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

type SpecialistNetworkProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
};

const specialistTypes = [
  "All",
  "Manpower & Support Partner",
  "Accounting & Tax Partner",
  "Marketing Partner",
  "Marketing & Innovation Partner",
];

export default function SpecialistNetwork({ onNavigate }: SpecialistNetworkProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [specResult, lawyerResult, paResult] = await Promise.all([
          getSpecialists(),
          getLawyers(),
          getPracticeAreas(),
        ]);

        if (specResult.data) setSpecialists(specResult.data);
        if (lawyerResult.data) setLawyers(lawyerResult.data);
        if (paResult.data) setPracticeAreas(paResult.data);
      } catch (error) {
        console.error("Failed to load specialist network data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filtered = specialists.filter((s) => {
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.specialty.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "All" || s.specialist_type === typeFilter;
    return matchSearch && matchType;
  });

  const selected = selectedId ? specialists.find((s) => s.id === selectedId) : null;

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (selected) {
    const relatedLawyers = lawyers.filter((l) =>
      (selected.connected_practice_areas || []).some((pa: string) =>
        l.practice_areas?.some((p) => p.id === pa),
      ),
    );
    const relatedPAs = practiceAreas.filter((pa) =>
      (selected.connected_practice_areas || []).includes(pa.id),
    );

    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-10">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm mb-8 transition-colors"
          >
            ← Back to Network
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
                <span className="text-xs font-semibold text-[#c9a84c] bg-[#c9a84c]/10 px-3 py-1 rounded-full">
                  {selected.specialist_type}
                </span>
                <h1 className="font-serif text-3xl font-bold text-[#0d1f3c] mt-4 mb-1">
                  {selected.name}
                </h1>
                <p className="text-[#8a9ab5] mb-1">{selected.organization}</p>
                <p className="text-[#c9a84c] text-sm font-medium mb-6">{selected.specialty}</p>
                <p className="text-[#2c3347] leading-relaxed">{selected.description}</p>
              </div>

              <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
                <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-4">
                  Services Supported
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(selected.services_supported || []).map((s) => (
                    <span
                      key={s}
                      className="bg-[#f7f5f0] text-[#2c3347] text-sm px-4 py-2 rounded-lg border border-[#e8e4dc]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {relatedPAs.length > 0 && (
                <div className="bg-white rounded-xl p-8 border border-[#e8e4dc]">
                  <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-4">
                    Connected Westwood Practice Areas
                  </h3>
                  <div className="space-y-3">
                    {relatedPAs.map((pa) => (
                      <button
                        key={pa.id}
                        onClick={() => onNavigate("expertise", { area: pa.id })}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-[#f7f5f0] hover:bg-[#e8e4dc] border border-[#e8e4dc] text-left group transition-colors"
                      >
                        <PracticeAreaIcon
                          id={pa.id}
                          className="w-4 h-4 text-[#c9a84c] flex-shrink-0"
                        />
                        <span className="text-sm font-medium text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors">
                          {pa.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="bg-white rounded-xl p-6 border border-[#e8e4dc]">
                <p className="text-xs text-[#8a9ab5] mb-1">Location</p>
                <p className="text-sm font-medium text-[#0d1f3c]">{selected.location}</p>
                <p className="text-xs text-[#8a9ab5] mt-3 mb-1">Industry</p>
                <p className="text-sm font-medium text-[#0d1f3c]">{selected.industry}</p>
              </div>

              {relatedLawyers.length > 0 && (
                <div className="bg-white rounded-xl p-6 border border-[#e8e4dc]">
                  <h4 className="font-serif text-base font-bold text-[#0d1f3c] mb-4">
                    Related Westwood Lawyers
                  </h4>
                  <div className="space-y-3">
                    {relatedLawyers.slice(0, 3).map((l) => (
                      <button
                        key={l.id}
                        onClick={() => onNavigate("lawyers", { lawyer: l.id })}
                        className="flex items-center gap-3 group w-full text-left"
                      >
                        <img
                          src={l.profile_image || PORTRAIT_PLACEHOLDER}
                          onError={onPortraitError}
                          alt={l.full_name}
                          className="w-10 h-10 rounded-full object-cover object-top"
                        />
                        <div>
                          <p className="text-sm font-medium text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors">
                            {l.full_name}
                          </p>
                          <p className="text-xs text-[#8a9ab5]">{l.position || "Lawyer"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-[#0d1f3c] rounded-xl p-6">
                <h4 className="font-serif text-base font-bold text-white mb-2">
                  Interested in this specialist?
                </h4>
                <p className="text-white/60 text-xs mb-5">
                  Contact Westwood Law Firm to learn more about how this partner can support your
                  legal matters.
                </p>
                <button
                  onClick={() => onNavigate("contact")}
                  className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded transition-colors"
                >
                  Contact Us
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      <div className="bg-[#0d1f3c] py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            Professional Network
          </p>
          <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-4">
            Partner Network
          </h1>
          <p className="text-white/60 text-lg max-w-xl">
            Westwood Law Firm partners with non-legal professional organizations — including
            manpower, accounting, and marketing specialists — to extend services to clients beyond
            legal counsel.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a9ab5]" />
            <input
              type="text"
              placeholder="Search specialist partners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-[#e8e4dc] rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[#c9a84c]"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full md:w-auto bg-white border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] md:min-w-[260px]"
          >
            {specialistTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* One uniform grid for every partner. Grouping by category left each
            section holding a single card with the rest of the row empty, so
            the category now rides on the card itself as a gold label. */}
        <p className="text-sm text-[#8a9ab5] mb-5">
          {filtered.length} partner{filtered.length !== 1 ? "s" : ""}
          {typeFilter !== "All" ? ` in ${typeFilter}` : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#e8e4dc] py-16 text-center">
            <p className="text-[#8a9ab5]">No partners match your search.</p>
            <button
              onClick={() => {
                setSearch("");
                setTypeFilter("All");
              }}
              className="mt-4 text-sm font-medium text-[#c9a84c] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                // flex-col + mt-auto keeps the location line pinned to the
                // bottom, so cards in a row line up however long the blurb is.
                className="group flex flex-col bg-white rounded-xl p-6 text-left border border-[#e8e4dc] hover:border-[#c9a84c] transition-all hover:shadow-lg hover:shadow-[#0d1f3c]/5"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-[#0d1f3c] flex items-center justify-center text-[#c9a84c] font-bold text-sm flex-shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <span className="text-xs text-[#8a9ab5] bg-[#f7f5f0] px-2 py-1 rounded text-right">
                    {s.industry}
                  </span>
                </div>
                <p className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[#c9a84c] mb-2">
                  {s.specialist_type}
                </p>
                <h3 className="font-serif text-base font-bold text-[#0d1f3c] mb-0.5 group-hover:text-[#c9a84c] transition-colors">
                  {s.name}
                </h3>
                {s.organization && s.organization !== s.name && (
                  <p className="text-xs text-[#8a9ab5] mb-2">{s.organization}</p>
                )}
                <p className="text-xs text-[#c9a84c] font-medium mb-3">{s.specialty}</p>
                <p className="text-sm text-[#2c3347] leading-relaxed line-clamp-2">
                  {s.description}
                </p>
                <div className="mt-auto pt-4 text-xs text-[#8a9ab5]">{s.location}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
