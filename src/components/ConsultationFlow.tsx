import { useState, useEffect } from "react";
import { getLawyers, getPracticeAreas, type Lawyer, type PracticeArea } from "@/lib/content";
import { signIn } from "@/lib/auth";
import { submitConsultation } from "@/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { PracticeAreaIcon, IconArrowRight, IconCheck } from "@/components/Icons";
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

type ConsultationFlowProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  prefilledLawyerId?: string;
  prefilledAreaId?: string;
};

function generateRef() {
  return `CS-2026-${String(Math.floor(10000 + Math.random() * 90000))}`;
}

const ASSISTANCE_TYPES = [
  "Legal Advice / Consultation",
  "Document Drafting or Review",
  "Representation in Proceedings",
  "Ongoing Legal Counsel",
  "Not Sure — I need guidance",
];

const TIME_SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];

// ── Sign-in gate — uses real Supabase authentication ──────────────────────

function SignInGate({ onSignedIn, onBack }: { onSignedIn: () => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [stuck, setStuck] = useState(false);

  // If the session exists but the profile never arrives, stop spinning and say so.
  useEffect(() => {
    if (!signedIn) return;
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [signedIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: signInError } = await signIn(email, password);

    setLoading(false);

    if (signInError) {
      setError(signInError);
      return;
    }

    if (data) {
      // The session exists now; the parent switches to the booking flow as
      // soon as useAuth has loaded the profile. Show that we are waiting
      // rather than dropping back to an idle form.
      setSignedIn(true);
      onSignedIn();
    }
  };

  if (signedIn) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          {stuck ? (
            <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8">
              <p className="text-[#0d1f3c] font-semibold mb-2">
                We signed you in, but could not load your profile.
              </p>
              <p className="text-[#8a9ab5] text-sm mb-6 leading-relaxed">
                This usually means the account was deactivated. Please contact the firm, or try
                again.
              </p>
              <button
                onClick={onBack}
                className="w-full bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold py-3 rounded transition-colors"
              >
                Back to Home
              </button>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[#8a9ab5] text-sm">Signed in — loading your details…</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-3">
            Westwood Law Firm
          </p>
          <h1 className="font-serif text-3xl font-bold text-[#0d1f3c] mb-2">Sign In to Continue</h1>
          <p className="text-[#8a9ab5] text-sm">Please sign in to schedule a consultation.</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8 shadow-sm mb-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="your@email.com"
                disabled={loading}
                className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                disabled={loading}
                className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] focus:outline-none focus:border-[#c9a84c] disabled:opacity-50"
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
              disabled={loading}
              className="w-full bg-[#0d1f3c] hover:bg-[#162d52] text-white font-semibold py-3 rounded transition-colors text-sm disabled:opacity-50"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <p className="text-xs text-[#8a9ab5] text-center mt-6">
            {"Don't have an account? "}
            <button onClick={() => onBack()} className="text-[#c9a84c] hover:underline font-medium">
              Return to create one
            </button>
          </p>
        </div>

        <button
          onClick={onBack}
          className="w-full text-center text-[#8a9ab5] hover:text-[#0d1f3c] text-sm transition-colors py-2"
        >
          ← Back to Consultation
        </button>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all ${
            i < current ? "bg-[#c9a84c]" : "bg-[#e8e4dc]"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main booking flow ─────────────────────────────────────────────────────────

function BookingFlow({ onNavigate, prefilledAreaId, prefilledLawyerId }: ConsultationFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [practiceArea, setPracticeArea] = useState(prefilledAreaId || "");
  const [assistance, setAssistance] = useState("");
  const [lawyerId, setLawyerId] = useState(prefilledLawyerId || "");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [client, setClient] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [refNumber, setRefNumber] = useState(generateRef);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [lawyerResult, paResult] = await Promise.all([getLawyers(), getPracticeAreas()]);

        if (lawyerResult.data) setLawyers(lawyerResult.data);
        if (paResult.data) setPracticeAreas(paResult.data);
      } catch (error) {
        console.error("Failed to load consultation data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Pre-populate client data from authenticated user
  useEffect(() => {
    if (user) {
      setClient({
        name: user.user_metadata?.full_name || "",
        email: user.email || "",
        phone: user.user_metadata?.phone || "",
        notes: "",
      });
    }
  }, [user]);

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedPA = practiceAreas.find((p) => p.id === practiceArea);
  const paLawyers = practiceArea
    ? lawyers.filter((l) => l.practice_areas?.some((pa) => pa.id === practiceArea))
    : lawyers.slice(0, 4);
  const selectedLawyer = lawyerId ? lawyers.find((l) => l.id === lawyerId) : null;

  // Writes the booking to public.inquiries so it lands in the admin's inquiry
  // queue, where it can be converted into a matter. Previously this only set a
  // UI flag and the reference number below was never recorded anywhere.
  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError("");

    const result = await submitConsultation({
      name: client.name,
      email: client.email,
      phone: client.phone,
      practiceArea: selectedPA?.name ?? practiceArea,
      assistanceType: assistance,
      lawyerName: selectedLawyer?.full_name,
      method,
      date,
      time,
      notes: client.notes,
    });

    setSubmitting(false);

    if (!result.success) {
      setSubmitError(
        "We could not record your consultation request. Please try again, or email the firm directly.",
      );
      return;
    }

    // Show the reference the firm's records actually use.
    if (result.referenceNumber) setRefNumber(result.referenceNumber);
    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl border border-[#e8e4dc] overflow-hidden shadow-sm">
            <div className="bg-[#0d1f3c] p-8 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(#c9a84c 1px, transparent 1px), linear-gradient(90deg, #c9a84c 1px, transparent 1px)",
                  backgroundSize: "60px 60px",
                }}
              />
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-[#c9a84c]/20 border-2 border-[#c9a84c] flex items-center justify-center mx-auto mb-4">
                  <IconCheck className="w-6 h-6 text-[#c9a84c]" />
                </div>
                <h2 className="font-serif text-2xl font-bold text-white mb-1">
                  Consultation Request Submitted
                </h2>
                <p className="text-white/50 text-sm">
                  Westwood Law Firm will contact you to confirm your appointment.
                </p>
              </div>
            </div>
            <div className="p-8">
              <div className="bg-[#f7f5f0] rounded-xl p-5 space-y-3 mb-6">
                {[
                  ["Reference Number", refNumber],
                  ["Practice Area", selectedPA?.name ?? practiceArea],
                  [
                    "Lawyer",
                    selectedLawyer ? selectedLawyer.full_name : "Westwood will assign a lawyer",
                  ],
                  ["Date", date],
                  ["Time", time],
                  ["Consultation Method", method],
                  ["Status", "Pending Review"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between items-start gap-4 text-sm border-b border-[#e8e4dc] pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-[#8a9ab5] flex-shrink-0">{label}</span>
                    <span
                      className={`font-medium text-right ${
                        label === "Status" ? "text-amber-600" : "text-[#0d1f3c]"
                      }`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8a9ab5] leading-relaxed mb-6 text-center">
                A confirmation will be sent to{" "}
                <strong className="text-[#0d1f3c]">{client.email}</strong>
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => onNavigate("portal")}
                  className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded transition-colors text-sm"
                >
                  Go to Client Portal
                </button>
                <button
                  onClick={() => onNavigate("home")}
                  className="w-full border border-[#e8e4dc] hover:border-[#c9a84c] text-[#0d1f3c] font-medium py-3 rounded transition-colors text-sm"
                >
                  Return to Home
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const TOTAL = 7;

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      <div className="bg-[#0d1f3c] py-14">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-3">
            Schedule a Consultation
          </p>
          <h1 className="font-serif text-4xl font-bold text-white">Book a Consultation</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8 shadow-sm">
          <StepBar current={step} total={TOTAL} />
          <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium mb-2">
            Step {step} of {TOTAL}
          </p>

          {step === 1 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-8">
                Select a Practice Area
              </h2>
              <div className="space-y-2">
                {practiceAreas.map((pa) => (
                  <button
                    key={pa.id}
                    onClick={() => {
                      setPracticeArea(pa.id);
                      setStep(2);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all group ${
                      practiceArea === pa.id
                        ? "border-[#c9a84c] bg-[#c9a84c]/5"
                        : "border-[#e8e4dc] hover:border-[#c9a84c]"
                    }`}
                  >
                    <PracticeAreaIcon id={pa.id} className="w-5 h-5 text-[#c9a84c] flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-[#0d1f3c] group-hover:text-[#c9a84c] transition-colors">
                        {pa.name}
                      </p>
                      <p className="text-xs text-[#8a9ab5] mt-0.5 line-clamp-1">{pa.description}</p>
                    </div>
                    <IconArrowRight className="w-4 h-4 text-[#8a9ab5] group-hover:text-[#c9a84c] transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2">
                Type of Assistance
              </h2>
              <p className="text-[#8a9ab5] text-sm mb-8">
                What kind of legal assistance do you need?
              </p>
              <div className="space-y-2">
                {ASSISTANCE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setAssistance(t);
                      setStep(3);
                    }}
                    className={`w-full p-4 rounded-xl border-2 text-left font-medium transition-all ${
                      assistance === t
                        ? "border-[#c9a84c] bg-[#c9a84c]/5 text-[#0d1f3c]"
                        : "border-[#e8e4dc] text-[#0d1f3c] hover:border-[#c9a84c] hover:text-[#c9a84c]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2">Select a Lawyer</h2>
              <p className="text-[#8a9ab5] text-sm mb-6">
                Choose a lawyer or let us recommend the best match.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setLawyerId("");
                    setStep(4);
                  }}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-[#c9a84c]/50 hover:border-[#c9a84c] bg-[#c9a84c]/5 text-left transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-[#c9a84c]/20 flex items-center justify-center flex-shrink-0 text-[#c9a84c] text-lg">
                    ✦
                  </div>
                  <div>
                    <p className="font-semibold text-[#0d1f3c]">Let Westwood Recommend</p>
                    <p className="text-xs text-[#8a9ab5]">
                      {"We'll assign the best available lawyer for your concern."}
                    </p>
                  </div>
                </button>
                {paLawyers.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setLawyerId(l.id);
                      setStep(4);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      lawyerId === l.id
                        ? "border-[#c9a84c] bg-[#c9a84c]/5"
                        : "border-[#e8e4dc] hover:border-[#c9a84c]"
                    }`}
                  >
                    <img
                      src={l.profile_image || PORTRAIT_PLACEHOLDER}
                      onError={onPortraitError}
                      alt={l.full_name}
                      className="w-10 h-10 rounded-full object-cover object-top flex-shrink-0"
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-[#0d1f3c]">{l.full_name}</p>
                      <p className="text-xs text-[#c9a84c] font-medium">{l.position || "Lawyer"}</p>
                    </div>
                    {lawyerId === l.id && (
                      <IconCheck className="w-4 h-4 text-[#c9a84c] flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2">
                Consultation Method
              </h2>
              <p className="text-[#8a9ab5] text-sm mb-8">How would you prefer to meet?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    value: "In-Person",
                    icon: "🏢",
                    desc: "At our Makati City office",
                  },
                  {
                    value: "Video Call",
                    icon: "📹",
                    desc: "Via Zoom or Google Meet",
                  },
                  {
                    value: "Phone Call",
                    icon: "📞",
                    desc: "Voice call at your convenience",
                  },
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setMethod(m.value);
                      setStep(5);
                    }}
                    className={`p-6 rounded-xl border-2 text-center transition-all ${
                      method === m.value
                        ? "border-[#c9a84c] bg-[#c9a84c]/5"
                        : "border-[#e8e4dc] hover:border-[#c9a84c]"
                    }`}
                  >
                    <div className="text-3xl mb-3">{m.icon}</div>
                    <p className="font-semibold text-[#0d1f3c] mb-1">{m.value}</p>
                    <p className="text-xs text-[#8a9ab5]">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2">
                Choose Date & Time
              </h2>
              <p className="text-[#8a9ab5] text-sm mb-8">
                Select your preferred date and time slot.
              </p>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-2">
                    Available Time Slots
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {TIME_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setTime(slot)}
                        className={`py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          time === slot
                            ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#0d1f3c]"
                            : "border-[#e8e4dc] text-[#2c3347] hover:border-[#c9a84c]"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (date && time) setStep(6);
                  }}
                  disabled={!date || !time}
                  className="bg-[#0d1f3c] hover:bg-[#162d52] disabled:opacity-40 text-white font-semibold px-8 py-3 rounded transition-colors text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2">
                Your Information
              </h2>
              <p className="text-[#8a9ab5] text-sm mb-8">Confirm your contact details.</p>
              <div className="space-y-4">
                {[
                  { key: "name", label: "Full Name", type: "text", required: true },
                  { key: "email", label: "Email Address", type: "email", required: true },
                  { key: "phone", label: "Phone Number", type: "tel", required: true },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      {f.label} {f.required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type={f.type}
                      required={f.required}
                      value={(client as Record<string, string>)[f.key]}
                      onChange={(e) => setClient({ ...client, [f.key]: e.target.value })}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                    Additional Notes{" "}
                    <span className="text-[#8a9ab5] font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={client.notes}
                    onChange={(e) => setClient({ ...client, notes: e.target.value })}
                    placeholder="Any additional details about your concern..."
                    className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] focus:outline-none focus:border-[#c9a84c] resize-none"
                  />
                </div>
                <button
                  onClick={() => setStep(7)}
                  disabled={!client.name.trim() || !client.email.trim() || !client.phone.trim()}
                  className="bg-[#0d1f3c] hover:bg-[#162d52] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded transition-colors text-sm"
                >
                  Review Booking
                </button>
              </div>
            </div>
          )}

          {step === 7 && (
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-8">
                Review & Confirm
              </h2>
              <div className="bg-[#f7f5f0] rounded-xl p-6 space-y-3 mb-6">
                {[
                  ["Practice Area", selectedPA?.name ?? practiceArea],
                  ["Type of Assistance", assistance],
                  ["Lawyer", selectedLawyer ? selectedLawyer.full_name : "Westwood Recommendation"],
                  ["Consultation Method", method],
                  ["Date", date],
                  ["Time", time],
                  ["Client Name", client.name],
                  ["Email", client.email],
                  ["Phone", client.phone],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between items-start gap-4 text-sm border-b border-[#e8e4dc] pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-[#8a9ab5] flex-shrink-0">{label}</span>
                    <span className="font-medium text-[#0d1f3c] text-right">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8a9ab5] leading-relaxed mb-6">
                By confirming, you agree that submitting this request does not establish an
                attorney-client relationship. Westwood Law Firm will confirm the appointment by
                email.
              </p>
              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                  <span className="text-red-500 text-sm">⚠️</span>
                  <p className="text-red-700 text-xs leading-relaxed">{submitError}</p>
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-4 rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting…" : "Confirm Consultation Request"}
              </button>
            </div>
          )}

          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="mt-6 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function ConsultationFlow({
  onNavigate,
  prefilledLawyerId,
  prefilledAreaId,
}: ConsultationFlowProps) {
  // Read the real session rather than remembering "we let them through once".
  // The old local flag started at false on every mount, so an already
  // signed-in client was shown the sign-in wall again after any navigation
  // away and back — and again after signing in, if the component remounted.
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <SignInGate
        onSignedIn={() => {
          /* useAuth picks the session up */
        }}
        onBack={() => onNavigate("home")}
      />
    );
  }

  return (
    <BookingFlow
      onNavigate={onNavigate}
      prefilledLawyerId={prefilledLawyerId}
      prefilledAreaId={prefilledAreaId}
    />
  );
}
