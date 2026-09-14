import { useState, useEffect } from "react";
import {
  getLawyers,
  getSpecialists,
  getCorporateClients,
  type Lawyer,
  type Specialist,
  type CorporateClient,
} from "@/lib/content";
import { IconMapPin, IconPhone, IconEnvelope } from "@/components/Icons";
import { useAuth } from "@/hooks/useAuth";
import { FIRM_EMAIL, FIRM_EMAIL_HREF } from "@/lib/firm";

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

type AboutPageProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
};

type Section = "profile" | "history" | "mission" | "partners" | "clients" | "contact";

const foundingPartners = [
  {
    name: 'Atty. Ernesto "Boyet" Tabao',
    role: "Managing Partner",
    specialty: "Labor & Corporate Law",
    note: "Labor and corporate practitioner; retained counsel of local and multinational firms; lecturer in Labor, Industrial Relations, and Business seminars; author of books on Labor Laws, Industrial Relations, and business. Currently serves as Managing Partner of the Firm.",
    status: "current",
  },
  {
    name: "Atty. Reynaldo Umali",
    role: "Founding Partner",
    specialty: "Civil, Customs & Remedial Law",
    note: "Extensive practice in civil and customs cases; previously with the Bureau of Customs. Later appointed Deputy Commissioner of the Bureau of Customs; subsequently elected Congressman for the 2nd District of Oriental Mindoro.",
    status: "historical",
  },
  {
    name: "Atty. Aurelo Umali",
    role: "Founding Partner",
    specialty: "Telecommunications Law",
    note: "Later appointed Deputy Commissioner of the National Telecommunications Commission under President Joseph Estrada; served as Congressman for the 2nd District of Nueva Ecija; later became Governor of Nueva Ecija.",
    status: "historical",
  },
  {
    name: "Atty. Wilfredo Nieves",
    role: "Founding Partner",
    specialty: "Immigration Law",
    note: "Extensive experience handling immigration cases in the Philippines; previously with the Bureau of Immigration. Later appointed as Presiding Judge of the Regional Trial Court of Malolos, Branch 84.",
    status: "historical",
  },
  {
    name: "Atty. Filibon Tacardon",
    role: "Founding Partner",
    specialty: "Mining & Energy Law",
    note: "Extensive practice with the Energy Regulatory Commission; experience handling Independent Power Producers and Electrical Utilities and Distributors. Later with the Bureau of Customs; returned to private practice focusing on mining and energy regulatory concerns.",
    status: "historical",
  },
  {
    name: "Atty. Jonathan Baligod",
    role: "Founding Partner",
    specialty: "Civil & Political Law",
    note: "Previously Executive Director of the Presidential Action Center of the Office of the President during President Joseph Estrada's term. Currently an active practitioner in Cagayan.",
    status: "historical",
  },
  {
    name: "Atty. Roehl Galandinez",
    role: "Founding Partner",
    specialty: "Criminal Law & Annulment",
    note: "Extensive practice in Metro Manila; handled controversial criminal matters. Maintains a private law practice.",
    status: "historical",
  },
  {
    name: "Atty. Noel Ebora",
    role: "Founding Partner (1998–1999)",
    specialty: "Civil Law Litigation",
    note: "Civil law litigation expert who handled various corporate clients. Was a Law Professor at San Beda College of Law. Passed away in 1999.",
    status: "historical",
  },
];

export default function AboutPage({ onNavigate }: AboutPageProps) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [corporateClients, setCorporateClients] = useState<CorporateClient[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [lawyerResult, specResult, clientResult] = await Promise.all([
          getLawyers(),
          getSpecialists(),
          getCorporateClients(),
        ]);

        if (lawyerResult.data) setLawyers(lawyerResult.data);
        if (specResult.data) setSpecialists(specResult.data);
        if (clientResult.data) setCorporateClients(clientResult.data);
      } catch (error) {
        console.error("Failed to load about page data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const navItems: { id: Section; label: string }[] = [
    { id: "profile", label: "Firm Profile" },
    { id: "history", label: "Founding Partners" },
    { id: "mission", label: "Mission & Vision" },
    { id: "partners", label: "Partner Network" },
    { id: "clients", label: "Corporate Clients" },
    { id: "contact", label: "Contact" },
  ];

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      {/* Hero */}
      <div className="bg-[#0d1f3c] py-20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            The Firm
          </p>
          <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-6">
            About Westwood
          </h1>
          <p className="text-white/60 text-lg max-w-2xl leading-relaxed">
            Westwood Law Firm provides specialized legal practice — ensuring that every case is
            handled by lawyers with expertise in the relevant field of law.
          </p>
        </div>
      </div>

      {/* Section navigation */}
      <div className="sticky top-[64px] z-30 bg-white border-b border-[#e8e4dc] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex-shrink-0 px-4 py-3 text-xs font-semibold tracking-wide transition-colors whitespace-nowrap rounded-sm ${
                  activeSection === item.id
                    ? "text-[#c9a84c] border-b-2 border-[#c9a84c]"
                    : "text-[#8a9ab5] hover:text-[#0d1f3c]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">
        {/* ── Firm Profile ── */}
        {activeSection === "profile" && (
          <div className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div>
                <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                  Established 1998
                </p>
                <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-6">Firm Profile</h2>
                <div className="space-y-4 text-[#2c3347] leading-relaxed text-sm">
                  <p>
                    Westwood Law Firm was established in August 1998 by founding partners coming
                    from four different law firms of their own, with varied law practice
                    specialties.
                  </p>
                  <p>
                    Westwood Law is a law firm that deals with the specialized practice of law to
                    ensure that all cases are handled by the experts in the field of law where the
                    case falls under.
                  </p>
                  <p>
                    Under the management of Atty. Ernesto "Boyet" Tabao, assisted by a team of legal
                    experts, the firm has developed a nationwide network of lawyers to handle
                    different client concerns throughout the Philippines.
                  </p>
                  <p>
                    The firm is also involved in the publication of books authored by Atty. Tabao,
                    and conducts seminars on Business, Labor, and Industrial Relations.
                  </p>
                </div>
              </div>
              <div className="bg-[#0d1f3c] rounded-2xl overflow-hidden h-72 lg:h-auto relative">
                <img
                  src="/lawyers/atty-tabao-secondary.png"
                  alt="Atty. Ernesto Tabao — Managing Partner"
                  className="w-full h-full object-cover object-top"
                  style={{ minHeight: "280px" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d1f3c]/80 to-transparent flex items-end p-8">
                  <div>
                    <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-semibold mb-1">
                      Managing Partner
                    </p>
                    <p className="font-serif text-2xl font-bold text-white">Atty. Ernesto Tabao</p>
                    <p className="text-white/60 text-sm mt-1">Westwood Law Firm</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Lawyers */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif text-2xl font-bold text-[#0d1f3c]">Our Lawyers</h3>
                <button
                  onClick={() => onNavigate("lawyers")}
                  className="text-sm text-[#c9a84c] font-semibold hover:underline"
                >
                  View All →
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {lawyers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onNavigate("lawyers", { lawyer: l.id })}
                    className="group bg-white rounded-xl overflow-hidden border border-[#e8e4dc] hover:border-[#c9a84c] transition-all text-left"
                  >
                    <div className="bg-[#8a9ab5] overflow-hidden">
                      {/* h-60, not h-44: the portraits are 4:5 and object-top
                          anchors to the top edge, so a 176px box showed only
                          the top ~49% of the frame — on a tightly-framed
                          portrait that cut the forehead and chin off. 240px
                          leaves the whole head plus shoulders visible. */}
                      <img
                        src={l.profile_image || "/lawyers/atty-tabao-primary.png"}
                        alt={l.full_name}
                        className="w-full h-60 object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-4">
                      <p className="font-serif text-sm font-bold text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors leading-snug">
                        {l.full_name}
                      </p>
                      <p className="text-[#c9a84c] text-xs mt-1">{l.position || "Lawyer"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Founding Partners / History ── */}
        {activeSection === "history" && (
          <div className="space-y-8">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                Established August 1998
              </p>
              <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-4">
                Founding Partners
              </h2>
              <p className="text-[#8a9ab5] text-sm max-w-2xl leading-relaxed">
                Westwood Law Firm was founded by partners from four different law firms, each with
                distinct areas of expertise. Many founding partners have since moved to government,
                judicial, or other professional positions.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {foundingPartners.map((p) => (
                <div
                  key={p.name}
                  className={`bg-white rounded-xl p-6 border ${
                    p.status === "current" ? "border-[#c9a84c]" : "border-[#e8e4dc]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-serif text-base font-bold text-[#0d1f3c]">{p.name}</p>
                      <p className="text-[#c9a84c] text-xs font-semibold mt-0.5">{p.role}</p>
                    </div>
                    <span
                      className={`flex-shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full ${
                        p.status === "current"
                          ? "bg-[#c9a84c]/10 text-[#c9a84c]"
                          : "bg-[#f7f5f0] text-[#8a9ab5]"
                      }`}
                    >
                      {p.status === "current" ? "Managing Partner" : "Founding Partner"}
                    </span>
                  </div>
                  <p className="text-xs text-[#8a9ab5] font-medium uppercase tracking-wide mb-2">
                    {p.specialty}
                  </p>
                  <p className="text-sm text-[#2c3347] leading-relaxed">{p.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Mission & Vision ── */}
        {activeSection === "mission" && (
          <div className="space-y-8 max-w-4xl">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                Our Purpose
              </p>
              <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-6">
                Mission & Vision
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0d1f3c] rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#c9a84c]/5 rounded-full -translate-y-8 translate-x-8" />
                <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-semibold mb-4">
                  Mission
                </p>
                <p className="font-serif text-xl text-white leading-relaxed">
                  "To give our clients the special service that they deserve where only the experts
                  will handle the cases that are brought to our attention"
                </p>
              </div>
              <div className="bg-[#c9a84c] rounded-2xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
                <p className="text-[#0d1f3c] text-xs tracking-widest uppercase font-semibold mb-4">
                  Vision
                </p>
                <p className="font-serif text-xl text-[#0d1f3c] leading-relaxed">
                  "To be the best lawyer that our client deserves"
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
              <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-4">Our Approach</h3>
              <p className="text-sm text-[#2c3347] leading-relaxed">
                Westwood Law Firm is built on the principle that legal matters are best handled by
                lawyers who specialize in the relevant field. Each client engagement is treated with
                dedicated focus — we do not believe in a one-size-fits-all approach to legal
                counsel.
              </p>
            </div>
          </div>
        )}

        {/* ── Partner Network ── */}
        {activeSection === "partners" && (
          <div className="space-y-8">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                Professional Network
              </p>
              <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-4">Partner Network</h2>
              <p className="text-[#8a9ab5] text-sm max-w-2xl leading-relaxed">
                Westwood Law Firm partners with non-legal professional organizations to extend
                services to clients — from manpower and accounting to marketing and business
                innovation.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {specialists.map((s) => (
                <div key={s.id} className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-serif text-lg font-bold text-[#0d1f3c]">{s.name}</p>
                      <p className="text-[#c9a84c] text-xs font-semibold mt-0.5">
                        {s.specialist_type}
                      </p>
                    </div>
                    <span className="bg-[#f7f5f0] text-[#8a9ab5] text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                      {s.industry}
                    </span>
                  </div>
                  <p className="text-sm text-[#2c3347] leading-relaxed mb-4">{s.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {(s.services_supported || []).slice(0, 3).map((svc) => (
                      <span
                        key={svc}
                        className="bg-[#f7f5f0] text-[#2c3347] text-xs px-2.5 py-1 rounded-full"
                      >
                        {svc}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Corporate Clients ── */}
        {activeSection === "clients" && (
          <div className="space-y-8">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                Our Clients
              </p>
              <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-4">
                Corporate Clients
              </h2>
              <p className="text-[#8a9ab5] text-sm max-w-2xl leading-relaxed">
                Westwood Law Firm has served a wide range of corporate clients across various
                industries — from cooperatives and financial institutions to manufacturing,
                services, and technology.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-3">
                {corporateClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-2 py-2 border-b border-[#f7f5f0]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c9a84c] flex-shrink-0" />
                    <span className="text-sm text-[#2c3347] leading-snug">{client.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Contact ── */}
        {activeSection === "contact" && (
          <div className="space-y-8 max-w-3xl">
            <div>
              <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
                Get in Touch
              </p>
              <h2 className="font-serif text-4xl font-bold text-[#0d1f3c] mb-4">
                Contact Information
              </h2>
            </div>
            <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8 space-y-6">
              {[
                {
                  Icon: IconMapPin,
                  label: "Address",
                  value:
                    "Suite 1004 Atlanta Center\n31 Annapolis St., Greenhills\n1502 San Juan City\nMetropolitan Manila, Philippines",
                },
                {
                  Icon: IconPhone,
                  label: "Phone",
                  value: "(02) 7957 2121\n(02) 722 9244\nMobile: (63) 917 569 8234",
                },
                {
                  Icon: IconEnvelope,
                  label: "Email",
                  value: FIRM_EMAIL,
                },
                {
                  Icon: IconEnvelope,
                  label: "Website",
                  value: "westwoodlaw.ph",
                },
              ].map((item) => (
                <div key={item.label} className="flex gap-4">
                  <item.Icon className="w-4 h-4 text-[#c9a84c] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#8a9ab5] uppercase tracking-wide font-semibold mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm text-[#2c3347] whitespace-pre-line leading-relaxed">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              {user?.role === "client" ? (
                <button
                  onClick={() => onNavigate("inquiry")}
                  className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold px-8 py-3.5 rounded transition-colors text-sm"
                >
                  Start a Legal Inquiry
                </button>
              ) : (
                <a
                  href={FIRM_EMAIL_HREF}
                  className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold px-8 py-3.5 rounded transition-colors text-sm text-center"
                >
                  Email Us
                </a>
              )}
              <button
                onClick={() => onNavigate("contact")}
                className="border-2 border-[#0d1f3c] text-[#0d1f3c] hover:bg-[#0d1f3c] hover:text-white font-semibold px-8 py-3.5 rounded transition-colors text-sm"
              >
                Contact Page
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
