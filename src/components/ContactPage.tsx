import { useState, useEffect } from "react";

import { IconMapPin, IconPhone, IconEnvelope, IconClock, IconCheck } from "@/components/Icons";

import { getPracticeAreas, getCorporateClients, getLawyers } from "@/lib/content";

import { submitInquiry } from "@/utils/api";

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

export default function ContactPage({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const [sending, setSending] = useState(false);

  const [sent, setSent] = useState<string | null>(null);

  const [error, setError] = useState("");

  const [stats, setStats] = useState({ areas: 0, clients: 0, lawyers: 0 });

  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,

        name: prev.name || user.fullName || "",

        email: prev.email || user.email || "",

        phone: prev.phone || user.phone || "",
      }));
    }
  }, [user]);

  // The four tiles under the page were hardcoded strings ("12", "40+"). Read

  // them from the database so they cannot drift from the real content.

  useEffect(() => {
    async function load() {
      const [areas, clients, lawyers] = await Promise.all([
        getPracticeAreas(),

        getCorporateClients(),

        getLawyers(),
      ]);

      setStats({
        areas: areas.data?.length ?? 0,

        clients: clients.data?.length ?? 0,

        lawyers: lawyers.data?.length ?? 0,
      });
    }

    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in your name, email address, and message.");

      return;
    }

    setSending(true);

    const result = await submitInquiry({
      name: form.name,

      email: form.email,

      phone: form.phone,

      concern: form.subject || "Website contact form",

      message: form.message,

      practiceArea: "",
    });

    setSending(false);

    if (!result.success) {
      setError("We could not send your message. Please try again, or email us directly.");

      return;
    }

    setSent(result.referenceNumber ?? "");

    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
  };

  const field =
    "w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50";

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
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-3">
            Get in Touch
          </p>
          <h1 className="font-serif text-5xl lg:text-6xl font-bold text-white mb-4">Contact Us</h1>
          <p className="text-white/60 text-lg max-w-xl">
            We welcome your inquiries. A member of our team will respond within one to two business
            days.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Left column — firm info */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
              <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-6">
                Westwood Law Firm
              </h3>
              <div className="space-y-6">
                {[
                  {
                    icon: IconMapPin,

                    label: "Address",

                    value:
                      "Suite 1004 Atlanta Center\n31 Annapolis St., Greenhills\n1502 San Juan City\nMetropolitan Manila, Philippines",
                  },

                  {
                    icon: IconPhone,
                    label: "Phone",
                    value: "(02) 7957 2121\n(02) 722 9244\nMobile: (63) 917 569 8234",
                  },

                  { icon: IconEnvelope, label: "Email", value: FIRM_EMAIL },

                  {
                    icon: IconClock,
                    label: "Office Hours",

                    value: "Monday – Friday\n8:30 AM – 5:30 PM\n(Closed on Philippine holidays)",
                  },
                ].map((item) => (
                  <div key={item.label} className="flex gap-4">
                    <item.icon className="w-4 h-4 text-[#c9a84c] flex-shrink-0 mt-0.5" />
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
            </div>

            {/* Map placeholder */}
            <div className="bg-[#e8e4dc] rounded-xl h-56 flex items-center justify-center overflow-hidden relative">
              <img
                src="https://images.unsplash.com/photo-1598139384902-5a8217874645?w=600&h=300&fit=crop&auto=format"
                alt="Office location"
                loading="lazy"
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white rounded-lg px-4 py-2.5 text-sm font-medium text-[#0d1f3c] shadow-lg flex items-center gap-2">
                  <span>📍</span>
                  <span>Greenhills, San Juan City</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column — contact form + info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Contact form */}
            <div className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
              <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-2">
                Send Us a Message
              </h3>
              <p className="text-sm text-[#8a9ab5] mb-6 leading-relaxed">
                Tell us briefly how we can help. Please do not include confidential details or
                documents in this form — we will arrange a secure way to send those.
              </p>

              {sent !== null ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <IconCheck className="w-5 h-5 text-green-700" />
                  </div>
                  <p className="font-semibold text-[#0d1f3c] mb-2">Your message has been sent.</p>
                  {sent && (
                    <p className="text-sm text-[#2c3347] mb-1">
                      Reference number: <span className="font-mono font-semibold">{sent}</span>
                    </p>
                  )}
                  <p className="text-xs text-[#8a9ab5] mb-5">
                    We reply within one to two business days.
                  </p>
                  <button
                    onClick={() => setSent(null)}
                    className="text-sm text-[#c9a84c] font-semibold hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                      >
                        Full Name *
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        disabled={sending}
                        placeholder="Juan Dela Cruz"
                        className={field}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-email"
                        className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                      >
                        Email Address *
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        disabled={sending}
                        placeholder="you@email.com"
                        className={field}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-phone"
                        className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                      >
                        Phone
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        disabled={sending}
                        placeholder="(63) 917 000 0000"
                        className={field}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-subject"
                        className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                      >
                        Subject
                      </label>
                      <input
                        id="contact-subject"
                        type="text"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        disabled={sending}
                        placeholder="e.g. Question about a labor case"
                        className={field}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5"
                    >
                      Message *
                    </label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      disabled={sending}
                      placeholder="Tell us briefly what you need help with. Please do not include sensitive details yet."
                      className={`${field} resize-y`}
                    />
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-red-500 text-sm">⚠️</span>
                      <p className="text-red-700 text-xs leading-relaxed">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3.5 rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? "Sending…" : "Send Message"}
                  </button>

                  <p className="text-xs text-[#8a9ab5] leading-relaxed text-center">
                    Do not send confidential documents through this form. For a scheduled meeting,{" "}
                    {user?.role === "client" && onNavigate ? (
                      <>
                        use{" "}
                        <button
                          type="button"
                          onClick={() => onNavigate("consultation")}
                          className="text-[#c9a84c] font-medium hover:underline"
                        >
                          Schedule a Consultation
                        </button>
                        .
                      </>
                    ) : (
                      <>
                        email us at{" "}
                        <a
                          href={FIRM_EMAIL_HREF}
                          className="text-[#c9a84c] font-medium hover:underline"
                        >
                          {FIRM_EMAIL}
                        </a>
                        .
                      </>
                    )}
                  </p>
                </form>
              )}
            </div>

            {/* About the firm */}
            <div className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
              <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-4">
                About Westwood Law Firm
              </h3>
              <p className="text-[#2c3347] text-sm leading-relaxed mb-4">
                Westwood Law Firm was established in August 1998 and is located in Greenhills, San
                Juan City, Metropolitan Manila. The firm provides specialized legal practice,
                ensuring that every case is handled by lawyers with expertise in the relevant field
                of law.
              </p>
              <p className="text-[#2c3347] text-sm leading-relaxed">
                Under the management of Atty. Ernesto "Boyet" Tabao, the firm has developed a
                nationwide network of lawyers to handle different client concerns throughout the
                Philippines. Westwood covers twelve practice areas ranging from Labor and Industrial
                Relations to Corporate Law, Immigration, and more.
              </p>
            </div>

            {/* How to reach us */}
            <div className="bg-white rounded-xl p-7 border border-[#e8e4dc]">
              <h3 className="font-serif text-xl font-bold text-[#0d1f3c] mb-5">How to Reach Us</h3>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-2">
                    General Inquiries
                  </p>
                  <p className="text-sm text-[#2c3347]">
                    Use the form above or email us at{" "}
                    <a
                      href={FIRM_EMAIL_HREF}
                      className="text-[#0d1f3c] font-medium hover:underline"
                    >
                      {FIRM_EMAIL}
                    </a>
                    . Our team responds within 1–2 business days.
                  </p>
                </div>
                <div className="h-px bg-[#e8e4dc]" />
                <div>
                  <p className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-2">
                    Scheduling Consultations
                  </p>
                  <p className="text-sm text-[#2c3347]">
                    Registered clients can book a consultation through their account. Otherwise,
                    email us and we will arrange a meeting — in-person, by video call, or by phone.
                  </p>
                </div>
                <div className="h-px bg-[#e8e4dc]" />
                <div>
                  <p className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-2">
                    Existing Clients
                  </p>
                  <p className="text-sm text-[#2c3347]">
                    Existing clients may access their portal using the "Sign In" link in the
                    navigation to track matters, view appointments, and access documents.
                  </p>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-[#f7f5f0] rounded-xl p-5 border border-[#e8e4dc]">
              <p className="text-xs text-[#8a9ab5] leading-relaxed">
                <strong className="text-[#2c3347]">Disclaimer:</strong> Communications through this
                website do not establish an attorney-client relationship. All inquiries are treated
                with strict confidentiality. A formal attorney-client relationship is formed only
                upon execution of a written engagement agreement with Westwood Law Firm.
              </p>
            </div>
          </div>
        </div>

        {/* Firm at a glance — read from the database, not hardcoded */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Est. 1998", desc: "Founded" },

            {
              label: stats.areas ? String(stats.areas) : "—",
              desc: "Practice Areas",
            },

            {
              label: stats.clients ? `${stats.clients}+` : "—",
              desc: "Corporate Clients",
            },

            {
              label: stats.lawyers ? String(stats.lawyers) : "—",
              desc: "Lawyers",
            },
          ].map((s) => (
            <div
              key={s.desc}
              className="bg-white rounded-xl p-5 border border-[#e8e4dc] text-center"
            >
              <p className="font-serif text-3xl font-bold text-[#c9a84c] mb-1">{s.label}</p>
              <p className="text-xs text-[#8a9ab5] uppercase tracking-widest">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
