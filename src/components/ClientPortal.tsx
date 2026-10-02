import { useState, useEffect, type ReactNode } from "react";

import ProfileEditor from "./portal/ProfileEditor";

import AppointmentsPanel from "./portal/AppointmentsPanel";

import { Person } from "./portal/Person";

import AdminIntake from "./portal/AdminIntake";

import BreakGlassModal from "./portal/BreakGlassModal";

import MatterTimeline from "./portal/MatterTimeline";

import MattersTimeline from "./portal/MattersTimeline";

import {
  getLawyers,
  getPracticeAreas,
  getSpecialists,
  type Lawyer,
  type PracticeArea,
  type Specialist,
} from "@/lib/content";

import { useAuth } from "@/hooks/useAuth";

import { signIn, signUp, signOut, type AuthUser } from "@/lib/auth";

import { supabase } from "@/lib/supabase";

import {
  getMyMatters,
  getDocumentsByMatter,
  getMyAppointments,
  getMyAuditLogs,
  updateMatterStatus,
  statusChoices,
  getMatterTeam,
  addMatterMember,
  removeMatterMember,
  type MatterMember,
} from "@/lib/services/portalData";

import {
  adminGetAllUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminChangeUserRole,
  adminDeactivateUser,
  adminReactivateUser,
} from "@/lib/services/admin";

import { useNotifications } from "@/hooks/useNotifications";

import type { NotificationRow } from "@/lib/services/notifications";

import UploadDocumentModal from "@/components/portal/UploadDocumentModal";

import PortalToast from "@/components/portal/PortalToast";

import ContentManager from "@/components/portal/ContentManager";

import ListFilters, { applyFilters, type FilterDef } from "@/components/portal/ListFilters";

import {
  MODAL_BUTTON_DANGER_CLASS,
  MODAL_BUTTON_PRIMARY_CLASS,
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";

import { lookupNames } from "@/components/portal/Person";

import {
  getMyDocuments,
  getDocumentUrl,
  deleteDocument,
  formatFileSize,
  breakGlassOpen,
} from "@/lib/services/documents";

import type { Database } from "@/lib/database.types";

import EmailVerificationBanner from "@/components/EmailVerificationBanner";

import type { Page } from "@/types/navigation";

import { newId } from "@/utils/id";

// DocAccessLevel from database enums

type DocAccessLevel = Database["public"]["Enums"]["access_level"];

type Matter = Database["public"]["Tables"]["matters"]["Row"];

type Document = Database["public"]["Tables"]["documents"]["Row"];

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];

type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type ClientPortalProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;

  savedLawyers: string[];
};

// ── Status colors ─────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  "New Inquiry": "bg-gray-100 text-gray-600",

  "Under Review": "bg-blue-50 text-blue-700",

  Consultation: "bg-purple-50 text-purple-700",

  "Conflict Check": "bg-amber-50 text-amber-700",

  Accepted: "bg-teal-50 text-teal-700",

  Active: "bg-green-50 text-green-700",

  Resolved: "bg-[#c9a84c]/10 text-[#a8863a]",

  Closed: "bg-gray-100 text-gray-500",

  Confirmed: "bg-green-50 text-green-700",

  Pending: "bg-amber-50 text-amber-700",

  Draft: "bg-blue-50 text-blue-700",

  Received: "bg-green-50 text-green-700",

  Inactive: "bg-gray-100 text-gray-500",
};

const priorityColors: Record<string, string> = {
  High: "text-red-600",

  Medium: "text-amber-600",

  Low: "text-green-600",
};

const accessLevelStyle: Record<DocAccessLevel, string> = {
  Public: "bg-gray-100 text-gray-600",

  "Staff Shared": "bg-blue-50 text-blue-700",

  Confidential: "bg-amber-50 text-amber-700",

  "Lawyer Only": "bg-red-50 text-red-700",

  "Client & Assigned Lawyer": "bg-purple-50 text-purple-700",
};

const accessLevelIcon: Record<DocAccessLevel, string> = {
  Public: "🌐",

  "Staff Shared": "🏢",

  Confidential: "🔒",

  "Lawyer Only": "👤",

  "Client & Assigned Lawyer": "👤",
};

// ── Utility components ────────────────────────────────────────────────────────

function Badge({ text }: { text: string }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded ${statusColors[text] ?? "bg-gray-100 text-gray-600"}`}
    >
      {text}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    client: "bg-green-50 text-green-700",

    lawyer: "bg-blue-50 text-blue-700",

    admin: "bg-purple-50 text-purple-700",
  };

  const labels: Record<string, string> = {
    client: "Client",
    lawyer: "Lawyer",
    admin: "Admin",
  };

  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded ${styles[role] ?? "bg-gray-100 text-gray-600"}`}
    >
      {labels[role] ?? role}
    </span>
  );
}

function DocAccessBadge({ level }: { level: DocAccessLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded ${accessLevelStyle[level]}`}
    >
      <span>{accessLevelIcon[level]}</span>
      <span>{level}</span>
    </span>
  );
}

function PrivacyLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#8a9ab5] font-medium">
      🔒 <span>{label}</span>
    </span>
  );
}

// ── Restricted access screen ──────────────────────────────────────────────────

function RestrictedScreen({ onReturn }: { onReturn: () => void }) {
  return (
    <Modal open onClose={onReturn} size="md" labelledBy="restricted-title">
      <ModalBody className="p-8 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 id="restricted-title" className="font-serif text-2xl font-bold text-[#0d1f3c] mb-3">
          Restricted Access
        </h2>
        <p className="text-[#2c3347] text-sm leading-relaxed mb-6">
          This information contains confidential legal content and is limited to authorized legal
          personnel.
        </p>
        <div className="bg-[#f7f5f0] rounded-xl p-5 text-left space-y-3 mb-6">
          {[
            ["Access Level", "Confidential"],

            ["Authorized Role", "Assigned Lawyer / Client"],

            ["Status", "Restricted"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-xs text-[#8a9ab5] font-semibold uppercase tracking-wide">
                {label}
              </span>
              <span className="text-xs font-semibold text-[#0d1f3c]">{value}</span>
            </div>
          ))}
        </div>
        <button onClick={onReturn} className={`w-full ${MODAL_BUTTON_PRIMARY_CLASS}`}>
          Return
        </button>
      </ModalBody>
    </Modal>
  );
}

// ── Access denied screen ──────────────────────────────────────────────────────

function AccessDeniedScreen({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e4dc] p-12 text-center max-w-md mx-auto mt-8">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-3">Access Denied</h2>
      <p className="text-[#8a9ab5] text-sm leading-relaxed mb-6">
        You do not have permission to access this section.
      </p>
      <button
        onClick={onReturn}
        className="bg-[#0d1f3c] text-white font-semibold px-8 py-3 rounded hover:bg-[#162d52] transition-colors text-sm"
      >
        Return to Dashboard
      </button>
    </div>
  );
}

// ── Create account modal ──────────────────────────────────────────────────────

function CreateAccountModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    firstName: "",

    middleName: "",

    lastName: "",

    suffix: "",

    email: "",

    password: "",

    confirm: "",

    phone: "",

    address: "",

    city: "",

    dateOfBirth: "",
  });

  const [error, setError] = useState("");

  const [done, setDone] = useState(false);

  const [step, setStep] = useState(1);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError("Please fill in all required fields.");

      return;
    }

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");

      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");

      return;
    }

    setLoading(true);

    setError("");

    // Sign up with Supabase with all client details

    const { data, error: signUpError } = await signUp({
      email: form.email,

      password: form.password,

      firstName: form.firstName,

      middleName: form.middleName || undefined,

      lastName: form.lastName,

      suffix: form.suffix || undefined,

      phone: form.phone || undefined,

      address: form.address || undefined,

      city: form.city || undefined,

      dateOfBirth: form.dateOfBirth || undefined,
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError);

      return;
    }

    setDone(true);

    // Auto sign in after successful signup

    setTimeout(() => {
      onSuccess();

      onClose();
    }, 2000);
  };

  const handleNext = () => {
    if (step === 1 && (!form.firstName || !form.lastName || !form.email)) {
      setError("Please enter your name and email.");

      return;
    }

    if (step === 2 && (!form.password || !form.confirm)) {
      setError("Please enter and confirm your password.");

      return;
    }

    if (step === 2 && form.password !== form.confirm) {
      setError("Passwords do not match.");

      return;
    }

    if (step === 2 && form.password.length < 6) {
      setError("Password must be at least 6 characters.");

      return;
    }

    setError("");

    setStep(step + 1);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      labelledBy="create-account-title"
      dismissible={!loading}
    >
      <ModalHeader
        eyebrow="Westwood Law Firm"
        title="Create Your Account"
        titleId="create-account-title"
        description="Join our secure client portal"
        onClose={onClose}
        closeDisabled={loading}
      />

      <ModalBody className="p-8">
          {done ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-3">Welcome Aboard!</h3>
              <p className="text-[#8a9ab5] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                Your account has been successfully created. You can now access our secure client
                portal.
              </p>
              <button onClick={onClose} className={`w-full ${MODAL_BUTTON_PRIMARY_CLASS}`}>
                Continue to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* Progress indicator */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        step >= s
                          ? "bg-gradient-to-br from-[#c9a84c] to-[#b89840] text-white shadow-md"
                          : "bg-[#e8e4dc] text-[#8a9ab5]"
                      }`}
                    >
                      {s}
                    </div>
                    {s < 3 && (
                      <div
                        className={`w-12 h-1 mx-1 rounded transition-all ${
                          step > s ? "bg-gradient-to-r from-[#c9a84c] to-[#b89840]" : "bg-[#e8e4dc]"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={
                  step === 3
                    ? handleSubmit
                    : (e) => {
                        e.preventDefault();
                        handleNext();
                      }
                }
                className="space-y-5"
              >
                {/* Step 1: Basic Info */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={MODAL_LABEL_CLASS}>
                          First Name *
                        </label>
                        <input
                          type="text"
                          value={form.firstName}
                          onChange={(e) => {
                            setForm({ ...form, firstName: e.target.value });
                            setError("");
                          }}
                          placeholder="Juan"
                          className={MODAL_INPUT_CLASS}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className={MODAL_LABEL_CLASS}>
                          Last Name *
                        </label>
                        <input
                          type="text"
                          value={form.lastName}
                          onChange={(e) => {
                            setForm({ ...form, lastName: e.target.value });
                            setError("");
                          }}
                          placeholder="Dela Cruz"
                          className={MODAL_INPUT_CLASS}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={MODAL_LABEL_CLASS}>
                          Middle Name{" "}
                          <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={form.middleName}
                          onChange={(e) => {
                            setForm({ ...form, middleName: e.target.value });
                            setError("");
                          }}
                          placeholder="Santos"
                          className={MODAL_INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label className={MODAL_LABEL_CLASS}>
                          Suffix{" "}
                          <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={form.suffix}
                          onChange={(e) => {
                            setForm({ ...form, suffix: e.target.value });
                            setError("");
                          }}
                          placeholder="Jr., Sr., III"
                          className={MODAL_INPUT_CLASS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => {
                          setForm({ ...form, email: e.target.value });
                          setError("");
                        }}
                        placeholder="your@email.com"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Password */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Password *
                      </label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => {
                          setForm({ ...form, password: e.target.value });
                          setError("");
                        }}
                        placeholder="Minimum 6 characters"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Confirm Password *
                      </label>
                      <input
                        type="password"
                        value={form.confirm}
                        onChange={(e) => {
                          setForm({ ...form, confirm: e.target.value });
                          setError("");
                        }}
                        placeholder="Re-enter password"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                      />
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="flex gap-3">
                        <span className="text-blue-500 text-lg">ℹ️</span>
                        <div>
                          <p className="text-xs font-semibold text-blue-900 mb-1">
                            Password Requirements
                          </p>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            Must be at least 6 characters long for security.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Additional Info */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Phone Number{" "}
                        <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+63 9XX XXX XXXX"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Address{" "}
                        <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        placeholder="Street address"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                      />
                    </div>
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        City{" "}
                        <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        placeholder="City"
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                      />
                    </div>
                    <div>
                      <label className={MODAL_LABEL_CLASS}>
                        Date of Birth{" "}
                        <span className="text-[#8a9ab5] normal-case font-normal">(Optional)</span>
                      </label>
                      <input
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                        className="w-full bg-white border-2 border-[#e8e4dc] focus:border-[#c9a84c] rounded-xl px-4 py-3.5 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] transition-all focus:outline-none focus:ring-4 focus:ring-[#c9a84c]/10"
                      />
                    </div>
                    <div className="bg-gradient-to-br from-[#f7f5f0] to-[#eae6dd] rounded-xl p-5 border border-[#e8e4dc]">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-lg">👤</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#2c3347] uppercase tracking-wider mb-1">
                            Account Type
                          </p>
                          <p className="text-sm font-bold text-[#0d1f3c]">Client Account</p>
                        </div>
                      </div>
                      <p className="text-xs text-[#8a9ab5] leading-relaxed">
                        Lawyer and Admin accounts are created and managed directly by Westwood Law
                        Firm administration.
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <p role="alert" className={MODAL_ERROR_CLASS}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep(step - 1);
                        setError("");
                      }}
                      className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
                    >
                      Back
                    </button>
                  )}
                  {step < 3 ? (
                    <button type="submit" className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}>
                      Continue
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-[#c9a84c] to-[#b89840] hover:from-[#e2c87a] hover:to-[#c9a84c] text-[#0d1f3c] text-sm font-bold py-3 rounded-lg transition-all shadow-lg shadow-[#c9a84c]/30 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                      disabled={loading}
                    >
                      {loading ? "Creating account…" : "Create Account"}
                    </button>
                  )}
                </div>

                {step === 1 && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full text-center text-[#8a9ab5] hover:text-[#0d1f3c] text-sm transition-colors py-2 font-medium"
                  >
                    Cancel
                  </button>
                )}
              </form>
            </>
          )}
      </ModalBody>
    </Modal>
  );
}

// ── Sign-in ───────────────────────────────────────────────────────────────────

function SignIn({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Please enter your email and password.");

      return;
    }

    setLoading(true);

    setError("");

    // Sign in with Supabase

    const { data, error: signInError } = await signIn(email, password);

    setLoading(false);

    if (signInError) {
      setError(signInError);

      return;
    }

    // Success! useAuth hook will handle the state update
  };

  return (
    <>
      <div className="bg-[#f7f5f0] min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-3">
              Westwood Law Firm
            </p>
            <h2 className="font-serif text-3xl font-bold text-[#0d1f3c] mb-2">Welcome Back</h2>
            <p className="text-[#8a9ab5] text-sm">Sign in to your Westwood Law Firm account.</p>
          </div>

          <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8 shadow-sm mb-4">
            <form onSubmit={handleSubmit} className="space-y-4 mb-6">
              <div>
                <label className={MODAL_LABEL_CLASS}>
                  Email
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
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => onNavigate("forgot-password")}
                    className="text-xs text-[#c9a84c] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
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
                className="w-full bg-[#0d1f3c] hover:bg-[#162d52] text-white font-semibold py-3 rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="text-xs text-[#8a9ab5] text-center mt-5">
              {"Don't have an account? "}
              <button
                onClick={() => setShowCreate(true)}
                className="text-[#c9a84c] hover:underline font-medium"
              >
                Create Account
              </button>
            </p>
          </div>

          <button
            onClick={() => onNavigate("home")}
            className="w-full text-center text-[#8a9ab5] hover:text-[#0d1f3c] text-sm transition-colors py-2"
          >
            ← Return to Website
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => setShowCreate(false)}
        />
      )}
    </>
  );
}

// ── Portal shell ──────────────────────────────────────────────────────────────

function PortalShell({
  currentUser,
  tabs,
  activeTab,
  onTab,
  onSignOut,
  onSwitchUser,
  unreadCount = 0,
  onOpenNotifications,
  children,
}: {
  currentUser: AuthUser;

  tabs: { key: string; label: string }[];

  activeTab: string;

  onTab: (t: string) => void;

  onSignOut: () => void;

  onSwitchUser: (u: AuthUser) => void;

  unreadCount?: number;

  onOpenNotifications?: () => void;

  children: React.ReactNode;
}) {
  const roleLabel =
    currentUser.role === "client"
      ? "Client Portal"
      : currentUser.role === "lawyer"
        ? "Lawyer Portal"
        : "Admin Portal";

  const roleSubtitle = currentUser.role === "admin" ? "Administration" : "My Account";

  return (
    <div className="bg-[#f7f5f0] min-h-screen">
      <div className="bg-[#0d1f3c] py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-[#c9a84c] text-xs tracking-widest uppercase font-medium">
              {roleSubtitle}
            </p>
            <h1 className="font-serif text-2xl font-bold text-white mt-0.5">{roleLabel}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-semibold">{currentUser.fullName}</p>
              <p className="text-white/40 text-xs capitalize">{currentUser.role}</p>
            </div>
            {onOpenNotifications && (
              <button
                onClick={onOpenNotifications}
                aria-label={
                  unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
                }
                className="relative text-white/60 hover:text-white p-2 rounded-lg border border-white/20 hover:border-white/50 transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#c9a84c] text-[#0d1f3c] text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={onSignOut}
              className="text-white/50 hover:text-white text-sm transition-colors border border-white/20 hover:border-white/50 px-4 py-2 rounded-lg"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white border-b border-[#e8e4dc] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className={`px-4 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.key
                  ? "border-[#c9a84c] text-[#0d1f3c]"
                  : "border-transparent text-[#8a9ab5] hover:text-[#0d1f3c]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">{children}</div>
    </div>
  );
}

// ── Notifications modal ──────────────────────────────────────────────────────

function NotificationsModal({
  items,
  loading,
  error,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onOpenLink,
  onClose,
}: {
  items: NotificationRow[];

  loading: boolean;

  error: string | null;

  unreadCount: number;

  onMarkRead: (id: string) => void;

  onMarkAllRead: () => void;

  onDelete: (id: string) => void;

  onOpenLink: (link: string) => void;

  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} size="2xl" align="top" labelledBy="notifications-title">
      <ModalHeader
        tone="light"
        title="Notifications"
        titleId="notifications-title"
        description={unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
        onClose={onClose}
      >
        {unreadCount > 0 && (
          <div className="ml-auto flex items-center">
            <button
              onClick={onMarkAllRead}
              className="text-xs font-semibold text-[#0d1f3c] border border-[#e8e4dc] hover:border-[#0d1f3c] px-3 py-1.5 rounded-lg transition-colors"
            >
              Mark all read
            </button>
          </div>
        )}
      </ModalHeader>
      <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#e8e4dc]">
          {error && (
            <div className="p-4 bg-red-50 text-xs text-red-700">
              Couldn't load notifications: {error}
            </div>
          )}
          {loading && items.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#8a9ab5]">Loading notifications…</p>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-3xl mb-2">🔔</p>
              <p className="text-sm text-[#2c3347] font-medium">No notifications yet</p>
              <p className="text-xs text-[#8a9ab5] mt-1">
                You'll be notified about new documents, matter updates and appointments.
              </p>
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!n.read) onMarkRead(n.id);

                  if (n.link) onOpenLink(n.link);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();

                    if (!n.read) onMarkRead(n.id);

                    if (n.link) onOpenLink(n.link);
                  }
                }}
                className={`flex items-start gap-4 p-5 cursor-pointer hover:bg-[#f7f5f0] transition-colors ${
                  n.read ? "" : "bg-[#c9a84c]/5"
                }`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden>
                  {n.link === "documents"
                    ? "📄"
                    : n.link === "matters"
                      ? "📋"
                      : n.link === "appointments"
                        ? "📅"
                        : n.type === "success"
                          ? "✅"
                          : n.type === "warning"
                            ? "⚠️"
                            : n.type === "error"
                              ? "⛔"
                              : "🔔"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-sm font-semibold ${
                        n.read ? "text-[#2c3347]" : "text-[#0d1f3c]"
                      }`}
                    >
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="text-xs bg-[#c9a84c] text-[#0d1f3c] font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8a9ab5] leading-relaxed mt-0.5 break-words">
                    {n.message}
                  </p>
                  <p className="text-xs text-[#8a9ab5] mt-1.5">
                    {(() => {
                      const then = new Date(n.created_at).getTime();
                      if (Number.isNaN(then)) return "";
                      const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
                      if (secs < 45) return "Just now";
                      const mins = Math.round(secs / 60);
                      if (mins < 60) return `${mins} min ago`;
                      const hours = Math.round(mins / 60);
                      if (hours < 24) return `${hours} hr ago`;
                      const days = Math.round(hours / 24);
                      if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
                      return new Date(n.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    })()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(n.id);
                  }}
                  aria-label="Delete notification"
                  title="Delete"
                  className="text-[#8a9ab5] hover:text-red-500 text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>
            ))
          )}
      </div>
    </Modal>
  );
}

// ── Matter detail modal ───────────────────────────────────────────────────────

function MatterDetail({
  matter,
  onClose,
  currentUser,
  practiceAreas = [],
  lawyers = [],
  auditLogs = [],
  onMatterUpdated,
}: {
  matter: Matter;
  onClose: () => void;
  currentUser: AuthUser;
  practiceAreas?: PracticeArea[];
  lawyers?: Lawyer[];
  auditLogs?: AuditLog[];
  onMatterUpdated?: (id: string, patch: Partial<Matter>) => void;
}) {
  const [status, setStatus] = useState<Matter["status"]>(matter.status);

  const [savedStatus, setSavedStatus] = useState<Matter["status"]>(matter.status);

  const [savingStatus, setSavingStatus] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const [matterDocs, setMatterDocs] = useState<Document[]>([]);

  const [showUpload, setShowUpload] = useState(false);

  const [docToast, setDocToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDocumentsByMatter(matter.id).then(({ data }) => {
      if (!cancelled && data) setMatterDocs(data);
    });

    return () => {
      cancelled = true;
    };
  }, [matter.id]);

  const [bgDoc, setBgDoc] = useState<Document | null>(null);

  const openMatterDoc = async (doc: Document) => {
    if (currentUser.role === "admin" && doc.access_level === "Confidential") {
      setBgDoc(doc);
      return;
    }

    const { url, denied, error } = await getDocumentUrl(doc, "open");

    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else if (denied) setShowRestricted(true);
    else
      setDocToast({
        message: error ?? "Could not open document",
        tone: "error",
      });
  };

  const saveStatus = async () => {
    setSavingStatus(true);

    setStatusMsg(null);

    const { error } = await updateMatterStatus(matter.id, status);

    setSavingStatus(false);

    if (error) {
      setStatus(savedStatus);

      setStatusMsg({ text: error, ok: false });
    } else {
      setSavedStatus(status);

      onMatterUpdated?.(matter.id, { status });

      setStatusMsg({
        text: "Status saved. The client has been notified.",
        ok: true,
      });
    }
  };

  const [showRestricted, setShowRestricted] = useState(false);

  const confirmBreakGlass = async (reason: string) => {
    if (!bgDoc) return null;

    const bg = await breakGlassOpen(bgDoc.id, reason);

    if (bg.error) return bg.error;

    const { url, error } = await getDocumentUrl(bgDoc, "open");

    if (!url) return error ?? "Could not open document";

    window.open(url, "_blank", "noopener,noreferrer");

    setBgDoc(null);

    return null;
  };

  const pa = practiceAreas.find((p) => p.id === matter.practice_area);

  const [assignedId, setAssignedId] = useState<string | null>(matter.lawyer_id ?? null);

  const [assignMsg, setAssignMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  const [assignBusy, setAssignBusy] = useState(false);

  const reassign = async (lawyerId: string) => {
    const next = lawyerId || null;

    if (next === assignedId || assignBusy) return;

    setAssignBusy(true);

    setAssignMsg(null);

    // .select("id") is the point of this call: an UPDATE the RLS policy

    // filters affects zero rows and still exits 0, so without reading the

    // returned rows back the UI used to report "assigned" for a write that

    // never happened — the live report where a matter stayed Unassigned

    // after the admin assigned a lawyer.

    const { data, error } = await supabase

      .from("matters")

      .update({ lawyer_id: next })

      .eq("id", matter.id)

      .select("id");

    setAssignBusy(false);

    if (error) {
      setAssignMsg({ text: error.message, ok: false });
      return;
    }

    if (!data || data.length === 0) {
      setAssignMsg({
        text: "The change was not saved. Your account is not allowed to edit this matter.",
        ok: false,
      });

      return;
    }

    setAssignedId(next);

    onMatterUpdated?.(matter.id, { lawyer_id: next });

    setAssignMsg({
      text: next ? "Assigned lawyer updated." : "Matter set back to unassigned.",
      ok: true,
    });
  };

  const lawyer = assignedId ? lawyers.find((l) => l.id === assignedId) : null;

  // Matter team. The database decides who may write — an admin, or the

  // matter's own assigned lawyer — so this only gates the controls.

  const [team, setTeam] = useState<MatterMember[]>([]);

  const [addId, setAddId] = useState("");

  const [teamBusy, setTeamBusy] = useState(false);

  const [teamMsg, setTeamMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const canManageTeam = currentUser.role === "admin" || matter.lawyer_id === currentUser.id;

  const refreshTeam = () =>
    getMatterTeam(matter.id).then(({ data }) => {
      if (data) setTeam(data);
    });

  useEffect(() => {
    void refreshTeam();
  }, [matter.id]);

  const addMember = async () => {
    if (!addId) return;

    setTeamBusy(true);
    setTeamMsg(null);

    const { error } = await addMatterMember(matter.id, addId);

    setTeamBusy(false);

    if (error) {
      setTeamMsg({ text: error, ok: false });
      return;
    }

    setAddId("");

    setTeamMsg({ text: "Lawyer added to the matter team.", ok: true });

    await refreshTeam();
  };

  const removeMember = async (lawyerId: string) => {
    setTeamBusy(true);
    setTeamMsg(null);

    const { error } = await removeMatterMember(matter.id, lawyerId);

    setTeamBusy(false);

    if (error) {
      setTeamMsg({ text: error, ok: false });
      return;
    }

    setTeamMsg({ text: "Lawyer removed from the matter team.", ok: true });

    await refreshTeam();
  };

  return (
    <>
      {bgDoc && (
        <BreakGlassModal
          fileName={bgDoc.name}
          onCancel={() => setBgDoc(null)}
          onConfirm={confirmBreakGlass}
        />
      )}
      <Modal open onClose={onClose} size="4xl" align="top" labelledBy="matter-detail-title">
        <ModalHeader
          eyebrow="Matter"
          title={matter.matter_number}
          titleId="matter-detail-title"
          onClose={onClose}
        />

        <ModalBody className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#f7f5f0] rounded-xl p-6 grid grid-cols-2 gap-4">
                {(
                  [
                    ["Client", <Person key="c" id={matter.client_id} />],

                    ["Practice Area", pa?.name ?? matter.practice_area],

                    ["Lawyer", lawyer ? lawyer.full_name : "Unassigned"],

                    ["Priority", matter.priority],

                    ["Date Opened", matter.date_opened],
                  ] as [string, ReactNode][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-[#8a9ab5] uppercase tracking-wide font-semibold mb-1">
                      {label}
                    </p>
                    <p
                      className={`text-sm font-medium ${
                        label === "Priority" ? priorityColors[matter.priority] : "text-[#0d1f3c]"
                      }`}
                    >
                      {value}
                    </p>
                  </div>
                ))}
                <div>
                  <p className="text-xs text-[#8a9ab5] uppercase tracking-wide font-semibold mb-1">
                    Status
                  </p>
                  <Badge text={status} />
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-[#e8e4dc]">
                <h3 className="font-serif text-base font-bold text-[#0d1f3c] mb-2">Description</h3>
                <p className="text-sm text-[#2c3347] leading-relaxed">{matter.description}</p>
                {currentUser.role === "admin" && (
                  <p className="text-xs text-[#8a9ab5] mt-3 italic">
                    Some information in this matter is restricted due to confidentiality.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 border border-[#e8e4dc]">
                <h3 className="font-serif text-base font-bold text-[#0d1f3c] mb-5">
                  Activity Timeline
                </h3>
                <div className="relative">
                  {auditLogs.length > 0 ? (
                    <>
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-[#e8e4dc]" />
                      <div className="space-y-5">
                        {auditLogs.slice(0, 7).map((log) => (
                          <div key={log.id} className="flex gap-4 pl-8 relative">
                            <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-[#c9a84c]/20 border-2 border-[#c9a84c] flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-[#0d1f3c]">
                                {log.event_description}
                              </p>
                              <p className="text-xs text-[#8a9ab5] mt-0.5">
                                {log.user_email || "System"} ·{" "}
                                {new Date(log.created_at || "").toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[#8a9ab5] text-center py-4">No recent activity</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(currentUser.role === "admin" || currentUser.role === "lawyer") && (
                <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
                  <h3 className="text-sm font-semibold text-[#0d1f3c] mb-3">Update Status</h3>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Matter["status"])}
                    className={`${MODAL_INPUT_CLASS} mb-3`}
                  >
                    {statusChoices(savedStatus, currentUser.role === "admin").map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={saveStatus}
                    disabled={savingStatus || status === savedStatus}
                    className={`w-full ${MODAL_BUTTON_PRIMARY_CLASS}`}
                  >
                    {savingStatus ? "Saving…" : "Save Status"}
                  </button>
                  {statusMsg && (
                    <p
                      className={`text-xs mt-2 ${statusMsg.ok ? "text-green-700" : "text-red-600"}`}
                    >
                      {statusMsg.text}
                    </p>
                  )}
                </div>
              )}

              {currentUser.role === "admin" && (
                <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
                  <h3 className="text-sm font-semibold text-[#0d1f3c] mb-3">Assigned Lawyer</h3>
                  {lawyer ? (
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={lawyer.profile_image || "/lawyers/placeholder.svg"}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover object-top bg-[#f7f5f0]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0d1f3c] truncate">
                          {lawyer.full_name}
                        </p>
                        <p className="text-xs text-[#8a9ab5]">{lawyer.position || "Lawyer"}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600 font-medium mb-3">
                      No lawyer assigned yet
                    </p>
                  )}
                  <select
                    value={assignedId ?? ""}
                    onChange={(e) => void reassign(e.target.value)}
                    disabled={assignBusy}
                    className={MODAL_INPUT_CLASS}
                  >
                    <option value="">Unassigned</option>
                    {lawyers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name}
                      </option>
                    ))}
                  </select>
                  {assignBusy && <p className="text-xs mt-2 text-[#8a9ab5]">Saving…</p>}
                  {assignMsg && (
                    <p
                      className={`text-xs mt-2 ${assignMsg.ok ? "text-green-700" : "text-red-600"}`}
                    >
                      {assignMsg.text}
                    </p>
                  )}
                </div>
              )}

              {currentUser.role !== "client" && (
                <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
                  <h3 className="text-sm font-semibold text-[#0d1f3c] mb-1">Matter Team</h3>
                  <p className="text-xs text-[#8a9ab5] mb-3">
                    Everyone here can read this matter&rsquo;s internal notes and documents.
                  </p>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-[#0d1f3c]">
                        {lawyer ? (
                          lawyer.full_name
                        ) : (
                          <span className="text-amber-600">No assigned lawyer</span>
                        )}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#c9a84c]">
                        Lead
                      </span>
                    </div>
                    {team.map((m) => {
                      const member = lawyers.find((l) => l.id === m.lawyer_id);

                      return (
                        <div key={m.lawyer_id} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[#2c3347]">
                            {member?.full_name ?? "Unknown lawyer"}
                          </span>
                          {canManageTeam && (
                            <button
                              onClick={() => void removeMember(m.lawyer_id)}
                              disabled={teamBusy}
                              className="text-xs text-[#8a9ab5] hover:text-red-600 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {team.length === 0 && (
                      <p className="text-xs text-[#8a9ab5]">No additional lawyers.</p>
                    )}
                  </div>

                  {canManageTeam && (
                    <div className="flex items-center gap-2">
                      <select
                        value={addId}
                        onChange={(e) => setAddId(e.target.value)}
                        className={`${MODAL_INPUT_CLASS} flex-1`}
                      >
                        <option value="">Add a lawyer…</option>
                        {lawyers

                          .filter(
                            (l) =>
                              l.id !== matter.lawyer_id && !team.some((m) => m.lawyer_id === l.id),
                          )

                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.full_name}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => void addMember()}
                        disabled={!addId || teamBusy}
                        className={`${MODAL_BUTTON_PRIMARY_CLASS} px-4`}
                      >
                        {teamBusy ? "Saving…" : "Add"}
                      </button>
                    </div>
                  )}

                  {teamMsg && (
                    <p className={`text-xs mt-2 ${teamMsg.ok ? "text-green-700" : "text-red-600"}`}>
                      {teamMsg.text}
                    </p>
                  )}
                </div>
              )}

              {currentUser.role === "admin" && (
                <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">Conflict Check</h3>
                  <p className="text-xs text-amber-700 leading-relaxed mb-3">
                    Run a conflict check before accepting this matter.
                  </p>
                  <button
                    onClick={() => setStatus("Conflict Check")}
                    disabled={
                      !statusChoices(savedStatus, true).includes("Conflict Check") ||
                      savedStatus === "Conflict Check"
                    }
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-2.5 rounded transition-colors disabled:opacity-40"
                  >
                    {savedStatus === "Conflict Check"
                      ? "Conflict check in progress"
                      : "Move to Conflict Check"}
                  </button>
                </div>
              )}

              <MatterTimeline
                matterId={matter.id}
                role={currentUser.role}
                userId={currentUser.id}
                names={Object.fromEntries(lawyers.map((l) => [l.id, l.full_name]))}
                clientId={matter.client_id}
              />

              <div className="bg-white rounded-xl p-5 border border-[#e8e4dc]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#0d1f3c]">Documents</h3>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="text-xs font-semibold text-[#c9a84c] hover:underline"
                  >
                    + Upload
                  </button>
                </div>
                {matterDocs.length === 0 ? (
                  <p className="text-xs text-[#8a9ab5]">No documents yet.</p>
                ) : (
                  <div className="space-y-3">
                    {matterDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="border-b border-[#f7f5f0] pb-3 last:border-0 last:pb-0"
                      >
                        <p className="text-xs font-medium text-[#0d1f3c] leading-snug break-words mb-1">
                          {doc.name}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <DocAccessBadge level={doc.access_level} />
                          <button
                            onClick={() => openMatterDoc(doc)}
                            className="text-xs text-[#c9a84c] hover:underline"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
        </ModalBody>
      </Modal>
      {showRestricted && <RestrictedScreen onReturn={() => setShowRestricted(false)} />}
      {showUpload && (
        <UploadDocumentModal
          currentUser={currentUser}
          matters={[
            {
              id: matter.id,
              matter_number: matter.matter_number,
              title: matter.title,
            },
          ]}
          initialMatterId={matter.id}
          onClose={() => setShowUpload(false)}
          onUploaded={(doc) => {
            setMatterDocs((prev) => [doc, ...prev]);
            setDocToast({ message: `Uploaded ${doc.name}`, tone: "success" });
          }}
        />
      )}
      {docToast && (
        <PortalToast
          message={docToast.message}
          tone={docToast.tone}
          onClose={() => setDocToast(null)}
        />
      )}
    </>
  );
}

// ── Matters table ─────────────────────────────────────────────────────────────

function MattersTable({
  matters,
  currentUser,
  onNavigate,
  practiceAreas = [],
  lawyers = [],
  auditLogs = [],
  onMatterUpdated,
}: {
  matters: Matter[];
  currentUser: AuthUser;
  onNavigate: (p: Page) => void;
  practiceAreas?: PracticeArea[];
  lawyers?: Lawyer[];
  auditLogs?: AuditLog[];
  onMatterUpdated?: (id: string, patch: Partial<Matter>) => void;
}) {
  const [selected, setSelected] = useState<Matter | null>(null);

  const [search, setSearch] = useState("");

  const [filters, setFilters] = useState<Record<string, string>>({});

  const [clientNames, setClientNames] = useState<Record<string, string>>({});

  // Newest first — the matters an admin is looking for are almost always the

  // recent ones, and the database returns them in insertion order.

  const sorted = [...matters].sort((a, b) =>
    (b.date_opened ?? "").localeCompare(a.date_opened ?? ""),
  );

  // Client names come from the shared Person cache, so a lawyer can search by

  // the person's name and not just the matter number.

  useEffect(() => {
    const ids = matters.map((m) => m.client_id).filter((id): id is string => !!id);

    if (ids.length === 0) return;

    let cancelled = false;

    void lookupNames(ids).then((map) => {
      if (!cancelled) setClientNames(map);
    });

    return () => {
      cancelled = true;
    };
  }, [matters]);

  const areaName = (id: string | null) => practiceAreas.find((p) => p.id === id)?.name ?? id ?? "";

  const lawyerName = (id: string | null) =>
    id ? (lawyers.find((l) => l.id === id)?.full_name ?? "") : "";

  const statuses = Array.from(new Set(matters.map((m) => m.status))).sort();

  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", options: statuses },

    {
      key: "area",
      label: "Area",
      options: practiceAreas
        .map((p) => p.name)
        .filter((n) => matters.some((m) => areaName(m.practice_area) === n)),
    },

    {
      key: "lawyer",
      label: "Lawyer",
      options: [
        ...lawyers
          .map((l) => l.full_name)
          .filter((n) => matters.some((m) => lawyerName(m.lawyer_id) === n)),
        "Unassigned",
      ].filter((n) => n !== "Unassigned" || matters.some((m) => !m.lawyer_id)),
    },
  ];

  const visible = applyFilters(
    sorted,

    search,

    (m) => [
      m.matter_number,
      m.title,
      clientNames[m.client_id ?? ""],
      areaName(m.practice_area),
      lawyerName(m.lawyer_id),
      m.status,
      m.priority,
    ],

    filters,

    (m, key) =>
      key === "status"
        ? m.status
        : key === "area"
          ? areaName(m.practice_area)
          : key === "lawyer"
            ? m.lawyer_id
              ? lawyerName(m.lawyer_id)
              : "Unassigned"
            : null,
  );

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
        <ListFilters
          search={search}
          onSearch={setSearch}
          placeholder="Search matters…"
          filters={filterDefs}
          values={filters}
          onFilter={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          shown={visible.length}
          total={matters.length}
        />
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f7f5f0]">
                {[
                  "Matter No.",
                  "Title",
                  "Client",
                  "Practice Area",
                  "Lawyer",
                  "Status",
                  "Priority",
                  "Opened",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide px-5 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e4dc]">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-[#8a9ab5]">
                    No matters match that search.
                  </td>
                </tr>
              )}
              {visible.map((m) => {
                const pa = practiceAreas.find((p) => p.id === m.practice_area);

                const lyr = m.lawyer_id ? lawyers.find((l) => l.id === m.lawyer_id) : null;

                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className="hover:bg-[#f7f5f0] transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4 text-sm font-mono font-semibold text-[#0d1f3c] whitespace-nowrap">
                      {m.matter_number}
                    </td>
                    <td
                      className="px-5 py-4 text-sm text-[#0d1f3c] font-medium max-w-[240px] truncate"
                      title={m.title}
                    >
                      {m.title}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#2c3347]">
                      <Person id={m.client_id} />
                    </td>
                    <td className="px-5 py-4 text-sm text-[#2c3347] whitespace-nowrap">
                      {pa?.name ?? m.practice_area}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#2c3347] whitespace-nowrap">
                      {lyr ? (
                        lyr.full_name
                      ) : (
                        <span className="text-amber-600 font-medium">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge text={m.status} />
                    </td>
                    <td className={`px-5 py-4 text-sm font-semibold ${priorityColors[m.priority]}`}>
                      {m.priority}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8a9ab5] whitespace-nowrap">
                      {m.date_opened}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(m);
                        }}
                        className="text-xs text-[#c9a84c] font-medium hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <MatterDetail
          matter={selected}
          onClose={() => setSelected(null)}
          currentUser={currentUser}
          practiceAreas={practiceAreas}
          lawyers={lawyers}
          auditLogs={auditLogs}
          onMatterUpdated={(id, patch) => {
            // Keep the open modal and the table behind it in step, so the

            // Lawyer column cannot keep reading "Unassigned" after a

            // successful assignment.

            setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));

            onMatterUpdated?.(id, patch);
          }}
        />
      )}
    </>
  );
}

// ── Documents table with access control ──────────────────────────────────────

function DocumentsTable({
  docs,
  matters,
  currentUser,
  onAccessDenied,
  onDeleted,
  onToast,
}: {
  docs: Document[];

  matters: Matter[];

  currentUser: AuthUser;

  onAccessDenied: () => void;

  onDeleted: (id: string) => void;

  onToast: (message: string, tone?: "success" | "error") => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [filters, setFilters] = useState<Record<string, string>>({});

  // Row-level security already limits `docs` to what this user may see, and the

  // signed-URL request is checked again by storage. No client-side rules here.

  const matterFor = (d: Document) => matters.find((m) => m.id === d.matter_id);

  const uploaderLabel = (d: Document) => {
    if (d.uploaded_by === currentUser.id) return "You";

    const m = matterFor(d);

    if (m && d.uploaded_by === m.client_id) return "Client";

    if (m && d.uploaded_by === m.lawyer_id) return "Assigned lawyer";

    return "Westwood staff";
  };

  const [bgDoc, setBgDoc] = useState<{
    doc: Document;
    mode: "open" | "download";
  } | null>(null);

  const openUrl = (url: string, mode: "open" | "download") => {
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.click();
    } else window.open(url, "_blank", "noopener,noreferrer");
  };

  const act = async (d: Document, mode: "open" | "download") => {
    if (currentUser.role === "admin" && d.access_level === "Confidential") {
      setBgDoc({ doc: d, mode });
      return;
    }

    setBusyId(d.id);

    const { url, denied, error } = await getDocumentUrl(d, mode);

    setBusyId(null);

    if (url) {
      if (mode === "download") {
        const a = document.createElement("a");

        a.href = url;
        a.rel = "noopener";
        a.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else if (denied) onAccessDenied();
    else onToast(error ?? "Could not open document", "error");
  };

  const remove = async (d: Document) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;

    setBusyId(d.id);

    const { error } = await deleteDocument(d);

    setBusyId(null);

    if (error) onToast(error, "error");
    else {
      onDeleted(d.id);
      onToast("Document deleted");
    }
  };

  const confirmBreakGlass = async (reason: string) => {
    if (!bgDoc) return null;

    const bg = await breakGlassOpen(bgDoc.doc.id, reason);

    if (bg.error) return bg.error;

    const { url, error } = await getDocumentUrl(bgDoc.doc, bgDoc.mode);

    if (!url) return error ?? "Could not open document";

    openUrl(url, bgDoc.mode);

    setBgDoc(null);

    return null;
  };

  const accessLevels = Array.from(new Set(docs.map((d) => d.access_level))).sort();

  const visible = applyFilters(
    docs,

    search,

    (d) => [d.name, d.file_type, matterFor(d)?.matter_number, uploaderLabel(d), d.access_level],

    filters,

    (d, key) => (key === "access" ? d.access_level : null),
  );

  return (
    <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
      {bgDoc && (
        <BreakGlassModal
          fileName={bgDoc.doc.name}
          onCancel={() => setBgDoc(null)}
          onConfirm={confirmBreakGlass}
        />
      )}
      <ListFilters
        search={search}
        onSearch={setSearch}
        placeholder="Search documents…"
        filters={[{ key: "access", label: "Access", options: accessLevels }]}
        values={filters}
        onFilter={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        shown={visible.length}
        total={docs.length}
      />
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f7f5f0]">
              {["Document", "Type", "Matter", "Uploaded By", "Date", "Access Level", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-[#8a9ab5] uppercase px-5 py-3"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8e4dc]">
            {docs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#8a9ab5]">
                  No documents yet.
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#8a9ab5]">
                  No documents match that search.
                </td>
              </tr>
            ) : (
              visible.map((d) => {
                const busy = busyId === d.id;

                const canDelete = d.uploaded_by === currentUser.id || currentUser.role === "admin";

                return (
                  <tr key={d.id} className="hover:bg-[#f7f5f0]">
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-[#0d1f3c] break-all">{d.name}</p>
                      <p className="text-xs text-[#8a9ab5] mt-0.5">{formatFileSize(d.file_size)}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-[#8a9ab5]">{d.file_type}</td>
                    <td className="px-5 py-4 text-sm font-mono text-[#2c3347]">
                      {matterFor(d)?.matter_number ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-[#2c3347]">{uploaderLabel(d)}</td>
                    <td className="px-5 py-4 text-sm text-[#8a9ab5] whitespace-nowrap">
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <DocAccessBadge level={d.access_level} />
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          disabled={busy}
                          onClick={() => act(d, "open")}
                          className="text-xs text-[#c9a84c] hover:underline disabled:opacity-40"
                        >
                          {busy ? "…" : "Open"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => act(d, "download")}
                          className="text-xs text-[#0d1f3c] hover:underline disabled:opacity-40"
                        >
                          Download
                        </button>
                        {canDelete && (
                          <button
                            disabled={busy}
                            onClick={() => remove(d)}
                            className="text-xs text-red-500 hover:underline disabled:opacity-40"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteConfirmModal({
  userName,
  onCancel,
  onConfirm,
}: {
  userName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open onClose={onCancel} size="sm" labelledBy="delete-account-title">
      <ModalBody className="px-6 pt-7 pb-5 text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-red-100 bg-red-50 text-lg text-red-600">
          <span aria-hidden="true">⚠</span>
        </div>
        <h3
          id="delete-account-title"
          className="font-serif text-lg font-bold text-[#0d1f3c] mb-2"
        >
          Delete Account?
        </h3>
        <p className="text-sm text-[#2c3347] mb-1 break-words">
          This action will permanently remove <strong>{userName}</strong>'s account from the system.
        </p>
        <p className="text-xs text-[#8a9ab5]">This cannot be undone from here.</p>
      </ModalBody>
      <ModalFooter className="flex gap-3 px-6 pb-6 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`flex-1 ${MODAL_BUTTON_DANGER_CLASS}`}
        >
          Confirm Delete
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ── Client Portal ─────────────────────────────────────────────────────────────

function ClientPortalView({
  currentUser,
  onNavigate,
  onSignOut,
  onSwitchUser,
}: {
  currentUser: AuthUser;
  onNavigate: (p: Page, params?: Record<string, string>) => void;
  onSignOut: () => void;
  onSwitchUser: (u: AuthUser) => void;
  savedLawyers?: string[];
}) {
  const [tab, setTab] = useState("dashboard");

  const [myMatters, setMyMatters] = useState<Matter[]>([]);

  // Matter edits made inside the detail modal flow back here, so the table

  // behind it never keeps showing the pre-edit row.

  const applyMatterPatch = (id: string, patch: Partial<Matter>) =>
    setMyMatters((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const [myDocs, setMyDocs] = useState<Document[]>([]);

  const [myAppts, setMyAppts] = useState<Appointment[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);

  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);

  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  const [loading, setLoading] = useState(true);

  const [showRestricted, setShowRestricted] = useState(false);

  const notifs = useNotifications(currentUser.id);

  const [showNotifs, setShowNotifs] = useState(false);

  const [showUpload, setShowUpload] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const showToast = (message: string, tone: "success" | "error" = "success") =>
    setToast({ message, tone });

  // Load data from database

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      try {
        // Load matters

        const { data: matters } = await getMyMatters(currentUser.id, currentUser.role);

        if (matters) {
          setMyMatters(matters);

          // Documents I can see (row-level security does the filtering)

          const { data: docs } = await getMyDocuments();

          setMyDocs(docs);
        }

        // Load appointments

        const { data: appts } = await getMyAppointments(currentUser.id, currentUser.role);

        if (appts) setMyAppts(appts);

        // Load audit logs

        const { data: logs } = await getMyAuditLogs(currentUser.id, currentUser.role);

        if (logs) setAuditLogs(logs);

        // Load public content (lawyers, practice areas, specialists)

        const [lawyerResult, paResult, specResult] = await Promise.all([
          getLawyers(),

          getPracticeAreas(),

          getSpecialists(),
        ]);

        if (lawyerResult.data) setLawyers(lawyerResult.data);

        if (paResult.data) setPracticeAreas(paResult.data);

        if (specResult.data) setSpecialists(specResult.data);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [currentUser.id, currentUser.role]);

  if (loading) {
    return (
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "matters", label: "My Matters" },

          { key: "appointments", label: "Appointments" },

          { key: "documents", label: "Documents" },

          { key: "partners", label: "Partner Network" },

          { key: "profile", label: "Profile" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
      >
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8a9ab5] text-sm">Loading your data...</p>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <>
      <EmailVerificationBanner />
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "matters", label: "My Matters" },

          { key: "appointments", label: "Appointments" },

          { key: "documents", label: "Documents" },

          { key: "partners", label: "Partner Network" },

          { key: "profile", label: "Profile" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
        onOpenNotifications={() => setShowNotifs(true)}
      >
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                // "Active" is one of eight statuses (New Inquiry, Under Review,

                // Consultation, Conflict Check, Accepted, Active, Resolved,

                // Closed). Counting only the literal "Active" showed 0 to a

                // client whose matter was still under review, so count

                // everything that has not been closed.

                {
                  label: "Open Matters",
                  value: String(myMatters.filter((m) => m.status !== "Closed").length),
                  color: "text-green-600",
                  bg: "bg-green-50",
                },

                {
                  label: "Appointments",
                  value: String(myAppts.length),
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },

                {
                  label: "Documents",
                  value: String(myDocs.length),
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                },

                {
                  label: "Notifications",
                  value: String(notifs.unreadCount),
                  color: "text-[#c9a84c]",
                  bg: "bg-[#c9a84c]/10",
                },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-[#e8e4dc]`}>
                  <p className={`font-serif text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[#8a9ab5] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
                <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-4">Matter Status</h3>
                {myMatters.length === 0 ? (
                  <p className="text-sm text-[#8a9ab5]">No active matters.</p>
                ) : (
                  myMatters.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-3 border-b border-[#f7f5f0] last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0d1f3c]">{m.matter_number}</p>
                        <p className="text-xs text-[#8a9ab5]">
                          {practiceAreas.find((p) => p.id === m.practice_area)?.name ||
                            m.practice_area}
                        </p>
                      </div>
                      <Badge text={m.status} />
                    </div>
                  ))
                )}
              </div>
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
                <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-4">
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {auditLogs.length > 0 ? (
                    auditLogs.slice(0, 4).map((log) => (
                      <div key={log.id} className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#c9a84c] mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-[#2c3347]">{log.event_description}</p>
                          <p className="text-xs text-[#8a9ab5]">
                            {new Date(log.created_at || "").toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#8a9ab5] text-center py-2">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
            <div className="bg-[#0d1f3c] rounded-xl p-6 flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">Need to submit a new legal concern?</p>
                <p className="text-white/50 text-sm mt-0.5">
                  Our team will review and contact you within 1–2 business days.
                </p>
              </div>
              <button
                onClick={() => onNavigate("inquiry")}
                className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold px-6 py-3 rounded transition-colors whitespace-nowrap"
              >
                New Inquiry
              </button>
            </div>
          </div>
        )}

        {tab === "matters" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Matters</h2>
            {myMatters.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center">
                <p className="text-[#8a9ab5] text-sm mb-4">No active matters yet.</p>
                <button
                  onClick={() => onNavigate("inquiry")}
                  className="bg-[#c9a84c] text-[#0d1f3c] font-semibold px-6 py-3 rounded text-sm"
                >
                  Start a Legal Inquiry
                </button>
              </div>
            ) : (
              <MattersTable
                matters={myMatters}
                currentUser={currentUser}
                onNavigate={onNavigate}
                practiceAreas={practiceAreas}
                lawyers={lawyers}
                auditLogs={auditLogs}
                onMatterUpdated={applyMatterPatch}
              />
            )}
          </div>
        )}

        {tab === "appointments" && (
          <AppointmentsPanel role="client" userId={currentUser.id} matters={myMatters} />
        )}

        {tab === "documents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Documents</h2>
              <button
                onClick={() => setShowUpload(true)}
                className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-6 py-3 rounded transition-colors"
              >
                Upload Document
              </button>
            </div>
            <DocumentsTable
              docs={myDocs}
              matters={myMatters}
              currentUser={currentUser}
              onAccessDenied={() => setShowRestricted(true)}
              onDeleted={(id) => setMyDocs((prev) => prev.filter((d) => d.id !== id))}
              onToast={showToast}
            />
            {showRestricted && <RestrictedScreen onReturn={() => setShowRestricted(false)} />}
          </div>
        )}

        {tab === "partners" && (
          <div className="space-y-5">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Partner Network</h2>
              <p className="text-[#8a9ab5] text-sm mt-1">
                Specialist partners available to support your legal matters with non-legal
                professional services.
              </p>
            </div>
            {specialists.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center">
                <p className="text-[#8a9ab5] text-sm">
                  No partner network specialists are currently listed.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {specialists.map((s) => (
                  <div key={s.id} className="bg-white rounded-xl border border-[#e8e4dc] p-6">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-serif text-base font-bold text-[#0d1f3c]">{s.name}</p>
                        <p className="text-[#c9a84c] text-xs font-semibold mt-0.5">{s.specialty}</p>
                      </div>
                      <span className="text-xs bg-green-50 text-green-700 font-semibold px-2.5 py-1 rounded flex-shrink-0">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-[#8a9ab5] mb-3">{s.specialist_type}</p>
                    <p className="text-xs text-[#2c3347] leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "profile" && (
          <div className="max-w-2xl space-y-5">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Profile</h2>
            <ProfileEditor userId={currentUser.id} />
          </div>
        )}
        {showUpload && (
          <UploadDocumentModal
            currentUser={currentUser}
            matters={myMatters.map((m) => ({
              id: m.id,
              matter_number: m.matter_number,
              title: m.title,
            }))}
            onClose={() => setShowUpload(false)}
            onUploaded={(doc) => {
              setMyDocs((prev) => [doc, ...prev]);
              showToast(`Uploaded ${doc.name}`);
            }}
          />
        )}
        {toast && (
          <PortalToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
        )}
      </PortalShell>
      {showNotifs && (
        <NotificationsModal
          items={notifs.items}
          loading={notifs.loading}
          error={notifs.error}
          unreadCount={notifs.unreadCount}
          onMarkRead={notifs.markRead}
          onMarkAllRead={notifs.markAllRead}
          onDelete={notifs.remove}
          onOpenLink={(link) => {
            setShowNotifs(false);
            if (["matters", "appointments", "documents"].includes(link)) setTab(link);
          }}
          onClose={() => setShowNotifs(false)}
        />
      )}
    </>
  );
}

// ── Lawyer Portal ─────────────────────────────────────────────────────────────

function LawyerPortalView({
  currentUser,
  onNavigate,
  onSignOut,
  onSwitchUser,
}: {
  currentUser: AuthUser;
  onNavigate: (p: Page, params?: Record<string, string>) => void;
  onSignOut: () => void;
  onSwitchUser: (u: AuthUser) => void;
}) {
  const [tab, setTab] = useState("dashboard");

  const [myMatters, setMyMatters] = useState<Matter[]>([]);

  // Same sync as the client view: status changes saved in the modal must not

  // leave a stale row behind in the table.

  const applyMatterPatch = (id: string, patch: Partial<Matter>) =>
    setMyMatters((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const [myAppts, setMyAppts] = useState<Appointment[]>([]);

  const [myDocs, setMyDocs] = useState<Document[]>([]);

  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);

  const [loading, setLoading] = useState(true);

  const [showRestricted, setShowRestricted] = useState(false);

  const notifs = useNotifications(currentUser.id);

  const [showNotifs, setShowNotifs] = useState(false);

  const [showUpload, setShowUpload] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const showToast = (message: string, tone: "success" | "error" = "success") =>
    setToast({ message, tone });

  // Load data from database

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Load matters assigned to this lawyer

      const { data: matters } = await getMyMatters(currentUser.id, currentUser.role);

      if (matters) {
        setMyMatters(matters);

        // Documents I can see (row-level security does the filtering)

        const { data: docs } = await getMyDocuments();

        setMyDocs(docs);
      }

      // Load appointments

      const { data: appts } = await getMyAppointments(currentUser.id, currentUser.role);

      if (appts) setMyAppts(appts);

      const [paResult, lawyerResult] = await Promise.all([getPracticeAreas(), getLawyers()]);

      if (paResult.data) setPracticeAreas(paResult.data);

      if (lawyerResult.data) setLawyers(lawyerResult.data);

      setLoading(false);
    }

    loadData();
  }, [currentUser.id, currentUser.role]);

  if (loading) {
    return (
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "matters", label: "My Matters" },

          { key: "appointments", label: "Appointments" },

          { key: "profile", label: "Profile" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
      >
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8a9ab5] text-sm">Loading your data...</p>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <>
      <EmailVerificationBanner />
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "matters", label: "My Matters" },

          { key: "clients", label: "Clients" },

          { key: "appointments", label: "Appointments" },

          { key: "documents", label: "Documents" },

          { key: "profile", label: "Profile" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
        onOpenNotifications={() => setShowNotifs(true)}
      >
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                // Same reasoning as the client dashboard: a lawyer's caseload is

                // everything not yet closed, not just the narrow "Active" stage.

                {
                  label: "Open Matters",
                  value: String(myMatters.filter((m) => m.status !== "Closed").length),
                  color: "text-green-600",
                  bg: "bg-green-50",
                },

                {
                  label: "Total Matters",
                  value: String(myMatters.length),
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },

                {
                  label: "Appointments",
                  value: String(myAppts.length),
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                },

                {
                  label: "Unread Notifications",
                  value: String(notifs.unreadCount),
                  color: "text-[#c9a84c]",
                  bg: "bg-[#c9a84c]/10",
                },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-[#e8e4dc]`}>
                  <p className={`font-serif text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[#8a9ab5] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <MattersTable
              matters={myMatters}
              currentUser={currentUser}
              onNavigate={onNavigate}
              practiceAreas={practiceAreas}
              lawyers={lawyers}
              onMatterUpdated={applyMatterPatch}
            />
          </div>
        )}

        {tab === "matters" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Matters</h2>
            {myMatters.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-10 text-center">
                <p className="text-[#8a9ab5] text-sm">No matters assigned yet.</p>
              </div>
            ) : (
              <MattersTable
                matters={myMatters}
                currentUser={currentUser}
                onNavigate={onNavigate}
                practiceAreas={practiceAreas}
                lawyers={lawyers}
                onMatterUpdated={applyMatterPatch}
              />
            )}
          </div>
        )}

        {tab === "clients" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Clients</h2>
            <div className="bg-white rounded-xl border border-[#e8e4dc] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f7f5f0]">
                    {["Client", "Active Matter", "Practice Area", "Status", "Last Activity"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide px-5 py-3"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e4dc]">
                  {myMatters.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-[#8a9ab5]">
                        No assigned clients.
                      </td>
                    </tr>
                  ) : (
                    myMatters.map((m) => {
                      const pa = practiceAreas.find((p) => p.id === m.practice_area);

                      return (
                        <tr key={m.id} className="hover:bg-[#f7f5f0]">
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-[#0d1f3c]">
                              <Person id={m.client_id} />
                            </p>
                            <p className="text-xs text-[#8a9ab5] mt-0.5">{m.matter_number}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-mono text-[#2c3347]">{m.matter_number}</p>
                            <p className="text-xs text-[#8a9ab5] mt-0.5 truncate max-w-[220px]">
                              {m.title}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#2c3347]">
                            {pa?.name ?? m.practice_area}
                          </td>
                          <td className="px-5 py-4">
                            <Badge text={m.status} />
                          </td>
                          <td className="px-5 py-4 text-sm text-[#8a9ab5]">{m.date_opened}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Privacy Notice:</strong> You may only access confidential information for
                clients assigned to your matters.{" "}
                <PrivacyLabel label="Confidential information is restricted to authorized personnel." />
              </p>
            </div>
          </div>
        )}

        {tab === "appointments" && (
          <AppointmentsPanel role="lawyer" userId={currentUser.id} matters={myMatters} />
        )}

        {tab === "documents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Documents</h2>
              <button
                onClick={() => setShowUpload(true)}
                className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-6 py-3 rounded transition-colors"
              >
                Upload Document
              </button>
            </div>
            <DocumentsTable
              docs={myDocs}
              matters={myMatters}
              currentUser={currentUser}
              onAccessDenied={() => setShowRestricted(true)}
              onDeleted={(id) => setMyDocs((prev) => prev.filter((d) => d.id !== id))}
              onToast={showToast}
            />
            {showRestricted && <RestrictedScreen onReturn={() => setShowRestricted(false)} />}
          </div>
        )}

        {tab === "profile" && (
          <div className="max-w-2xl space-y-5">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Profile</h2>
            <ProfileEditor userId={currentUser.id} />
            {currentUser.lawyerId && (
              <button
                onClick={() => onNavigate("lawyers", { lawyer: currentUser.lawyerId! })}
                className="w-full border-2 border-[#0d1f3c] text-[#0d1f3c] hover:bg-[#0d1f3c] hover:text-white font-semibold py-3 rounded transition-colors text-sm"
              >
                View Public Lawyer Profile
              </button>
            )}
          </div>
        )}
        {showUpload && (
          <UploadDocumentModal
            currentUser={currentUser}
            matters={myMatters.map((m) => ({
              id: m.id,
              matter_number: m.matter_number,
              title: m.title,
            }))}
            onClose={() => setShowUpload(false)}
            onUploaded={(doc) => {
              setMyDocs((prev) => [doc, ...prev]);
              showToast(`Uploaded ${doc.name}`);
            }}
          />
        )}
        {toast && (
          <PortalToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
        )}
      </PortalShell>
      {showNotifs && (
        <NotificationsModal
          items={notifs.items}
          loading={notifs.loading}
          error={notifs.error}
          unreadCount={notifs.unreadCount}
          onMarkRead={notifs.markRead}
          onMarkAllRead={notifs.markAllRead}
          onDelete={notifs.remove}
          onOpenLink={(link) => {
            setShowNotifs(false);
            if (["matters", "appointments", "documents"].includes(link)) setTab(link);
          }}
          onClose={() => setShowNotifs(false)}
        />
      )}
    </>
  );
}

// ── Admin Portal ──────────────────────────────────────────────────────────────

function AdminPortalView({
  currentUser,
  onNavigate,
  onSignOut,
  onSwitchUser,
}: {
  currentUser: AuthUser;
  onNavigate: (p: Page, params?: Record<string, string>) => void;
  onSignOut: () => void;
  onSwitchUser: (u: AuthUser) => void;
}) {
  const [tab, setTab] = useState("dashboard");

  const [conflictName, setConflictName] = useState("");

  const [conflictResult, setConflictResult] = useState<string | null>(null);

  const [showRestricted, setShowRestricted] = useState(false);

  const notifs = useNotifications(currentUser.id);

  const [showNotifs, setShowNotifs] = useState(false);

  const [showUpload, setShowUpload] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);

  const showToast = (message: string, tone: "success" | "error" = "success") =>
    setToast({ message, tone });

  const [allDocs, setAllDocs] = useState<Document[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [userAccounts, setUserAccounts] = useState<Profile[]>([]);

  const [allMatters, setAllMatters] = useState<Matter[]>([]);

  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);

  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);

  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const [showCreateUser, setShowCreateUser] = useState(false);

  const [viewUser, setViewUser] = useState<Profile | null>(null);

  const [editUser, setEditUser] = useState<Profile | null>(null);

  const [manageUser, setManageUser] = useState<Profile | null>(null);

  const [inquiryCount, setInquiryCount] = useState(0);

  const [userSearch, setUserSearch] = useState("");

  const [userFilters, setUserFilters] = useState<Record<string, string>>({});

  const userStatus = (u: Profile) =>
    u.deleted_at ? "Deleted" : u.is_active === false ? "Deactivated" : "Active";

  const visibleUsers = applyFilters(
    userAccounts,

    userSearch,

    (u) => [u.full_name, u.email, u.role, u.position, u.city],

    userFilters,

    (u, key) =>
      key === "status"
        ? userStatus(u)
        : key === "role"
          ? u.role
          : key === "position"
            ? u.position
            : null,
  );

  // Load all admin data from database

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // Load all matters

      const { data: matters } = await getMyMatters(currentUser.id, currentUser.role);

      if (matters) setAllMatters(matters);

      // Load all appointments

      const { data: appointments } = await getMyAppointments(currentUser.id, currentUser.role);

      if (appointments) setAllAppointments(appointments);

      // Load audit logs

      const { data: logs } = await getMyAuditLogs(currentUser.id, currentUser.role);

      if (logs) setAuditLogs(logs);

      // Every document the database lets an admin see

      const { data: docs } = await getMyDocuments();

      setAllDocs(docs);

      // Load all user profiles

      const { data: profiles } = await adminGetAllUsers();

      if (profiles) setUserAccounts(profiles);

      // Load inquiry count — same scope as Client Intake: only registered

      // clients' inquiries. Signed-out visitors' inquiries are emailed to the

      // firm and are deliberately not counted or listed in the portal.

      const inqResult = await supabase

        .from("inquiries")

        .select("id", { count: "exact", head: true })

        .not("client_id", "is", null);

      setInquiryCount(inqResult.count ?? 0);

      const [lawyerResult, practiceAreaResult] = await Promise.all([
        getLawyers(),

        getPracticeAreas(),
      ]);

      if (lawyerResult.data) setLawyers(lawyerResult.data);

      if (practiceAreaResult.data) setPracticeAreas(practiceAreaResult.data);

      setLoading(false);
    }

    loadData();
  }, [currentUser.id, currentUser.role]);

  const unassigned = allMatters.filter((m) => !m.lawyer_id);

  // Single place every matter edit funnels through, so the dashboard cards,

  // the matters table and the lawyer-management queue can never disagree

  // about who is assigned.

  const applyMatterPatch = (id: string, patch: Partial<Matter>) =>
    setAllMatters((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // How many administrators could still get in. The database refuses to remove

  // the last one (private.guard_last_admin), so the UI warns first rather than

  // letting the admin hit a raw SQL error.

  const activeAdminCount = userAccounts.filter(
    (u) => u.role === "admin" && u.is_active !== false && !u.deleted_at,
  ).length;

  // ── Excel export (Reports tab) ──────────────────────────────────────────────

  const exportReports = async () => {
    // Loaded on demand so the xlsx library never ships in the main bundle.

    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();

    const clientName = (id: string) => userAccounts.find((u) => u.id === id)?.full_name ?? id;

    const lawyerName = (id: string | null) =>
      id ? (lawyers.find((l) => l.id === id)?.full_name ?? id) : "Unassigned";

    const areaName = (id: string) => practiceAreas.find((p) => p.id === id)?.name ?? id;

    // Sheet 1 — summary metrics

    const summary: (string | number)[][] = [
      ["Westwood Law Firm — Reports"],

      ["Generated", new Date().toLocaleString("en-PH")],

      [],

      ["Metric", "Value", "Description"],

      ["Total Inquiries", inquiryCount, "All submitted inquiries"],

      [
        "Active Matters",
        allMatters.filter((m) => m.status === "Active").length,
        "Currently active matters",
      ],

      ["Total Matters", allMatters.length, "All matters in system"],

      [
        "Pending Conflict Checks",
        allMatters.filter((m) => m.status === "Conflict Check").length,
        "Awaiting review",
      ],

      ["Unassigned Matters", unassigned.length, "No lawyer assigned"],

      [
        "Resolved / Closed",
        allMatters.filter((m) => ["Resolved", "Closed"].includes(m.status)).length,
        "Completed matters",
      ],
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

    // Sheet 2 — matters by practice area

    const byArea: (string | number)[][] = [["Practice Area", "Matters", "Share %"]];

    practiceAreas.forEach((pa) => {
      const count = allMatters.filter((m) => m.practice_area === pa.id).length;

      const pct = allMatters.length > 0 ? Math.round((count / allMatters.length) * 100) : 0;

      byArea.push([pa.name, count, pct]);
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(byArea), "By Practice Area");

    // Sheet 3 — all matters

    const matterRows: (string | number)[][] = [
      [
        "Matter #",
        "Title",
        "Client",
        "Lawyer",
        "Practice Area",
        "Status",
        "Priority",
        "Date Opened",
        "Date Closed",
      ],

      ...allMatters.map((m) => [
        m.matter_number,

        m.title,

        clientName(m.client_id),

        lawyerName(m.lawyer_id),

        areaName(m.practice_area),

        m.status,

        m.priority,

        m.date_opened,

        m.date_closed ?? "",
      ]),
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matterRows), "All Matters");

    XLSX.writeFile(wb, `westwood-reports-${new Date().toISOString().slice(0, 10)}.xlsx`);

    showToast("Excel report downloaded");
  };

  const runConflictCheck = async () => {
    const q = conflictName.trim();

    if (!q) return;

    setConflictResult("Searching…");

    const safe = q.replace(/[%,()]/g, " ");

    const [people, inq] = await Promise.all([
      supabase.from("profiles").select("id, full_name").ilike("full_name", `%${safe}%`).limit(20),

      supabase
        .from("inquiries")
        .select("inquiry_number, name, status")
        .ilike("name", `%${safe}%`)
        .limit(20),
    ]);

    const ids = new Set((people.data ?? []).map((p: any) => p.id));

    const hits = allMatters.filter((m) => ids.has(m.client_id));

    const parts: string[] = [];

    if (hits.length)
      parts.push(
        `${hits.length} matter(s): ` +
          hits
            .slice(0, 5)
            .map((m) => `${m.matter_number} (${m.status})`)
            .join(", "),
      );

    if ((inq.data ?? []).length)
      parts.push(
        `${inq.data!.length} inquiry record(s): ` +
          inq
            .data!.slice(0, 5)
            .map((i: any) => `${i.inquiry_number} ${i.name}`)
            .join(", "),
      );

    setConflictResult(
      parts.length
        ? `⚠ Possible conflict found — ${parts.join(" · ")}`
        : "✓ No conflicts found for this name.",
    );
  };

  const handleDelete = async (user: Profile) => {
    // Call admin service to delete user

    const { error } = await adminDeleteUser(user.id);

    if (error) {
      setDeleteSuccess(`Error: ${error}`);

      setTimeout(() => setDeleteSuccess(null), 5000);

      setDeleteTarget(null);

      return;
    }

    // Remove from local state

    setUserAccounts((prev) => prev.filter((u) => u.id !== user.id));

    setDeleteTarget(null);

    setDeleteSuccess(`Account for ${user.full_name} has been deleted.`);

    setTimeout(() => setDeleteSuccess(null), 3000);
  };

  const handleRestrictedAccess = () => {
    setShowRestricted(true);

    // Note: Audit logging should happen server-side via triggers
  };

  if (loading) {
    return (
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "matters", label: "All Matters" },

          { key: "conflict", label: "Conflict Check" },

          { key: "lawyers", label: "Lawyer Management" },

          { key: "users", label: "User Management" },

          { key: "profile", label: "My Profile" },

          { key: "audit", label: "Audit Logs" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
      >
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#8a9ab5] text-sm">Loading admin dashboard...</p>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <>
      <EmailVerificationBanner />
      <PortalShell
        currentUser={currentUser}
        tabs={[
          { key: "dashboard", label: "Dashboard" },

          { key: "users", label: "User Accounts" },

          { key: "intake", label: "Client Intake" },

          { key: "matters", label: "Matters" },

          { key: "appointments", label: "Appointments" },

          { key: "lawyers", label: "Lawyers" },

          { key: "documents", label: "Documents" },

          { key: "content", label: "Website Content" },

          { key: "reports", label: "Reports" },

          { key: "settings", label: "System Settings" },

          { key: "profile", label: "My Profile" },

          { key: "audit", label: "Audit Logs" },
        ]}
        activeTab={tab}
        onTab={setTab}
        onSignOut={onSignOut}
        onSwitchUser={onSwitchUser}
        unreadCount={notifs.unreadCount}
        onOpenNotifications={() => setShowNotifs(true)}
      >
        {deleteSuccess && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0d1f3c] text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg flex items-center gap-2">
            <span className="text-[#c9a84c]">✓</span> {deleteSuccess}
          </div>
        )}

        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Matters",
                  value: String(allMatters.length),
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },

                {
                  label: "Active Matters",
                  value: String(allMatters.filter((m) => m.status === "Active").length),
                  color: "text-green-600",
                  bg: "bg-green-50",
                },

                {
                  label: "Pending Conflict Checks",
                  value: String(allMatters.filter((m) => m.status === "Conflict Check").length),
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                },

                {
                  label: "Unassigned Matters",
                  value: String(unassigned.length),
                  color: "text-red-600",
                  bg: "bg-red-50",
                },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-[#e8e4dc]`}>
                  <p className={`font-serif text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[#8a9ab5] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Users",
                  value: String(userAccounts.length),
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                },

                {
                  label: "Total Lawyers",
                  value: String(lawyers.length),
                  color: "text-[#c9a84c]",
                  bg: "bg-[#c9a84c]/10",
                },

                {
                  label: "Client Inquiries",
                  value: String(inquiryCount),
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },

                {
                  label: "Audit Events",
                  value: String(auditLogs.length),
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-[#e8e4dc]`}>
                  <p className={`font-serif text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[#8a9ab5] mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <MattersTable
              matters={allMatters}
              currentUser={currentUser}
              onNavigate={onNavigate}
              practiceAreas={practiceAreas}
              lawyers={lawyers}
              auditLogs={auditLogs}
              onMatterUpdated={applyMatterPatch}
            />
          </div>
        )}

        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">User Accounts</h2>
              <button
                onClick={() => setShowCreateUser(true)}
                className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-5 py-2.5 rounded transition-colors"
              >
                + Add User
              </button>
            </div>

            <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
              <ListFilters
                search={userSearch}
                onSearch={setUserSearch}
                placeholder="Search by name or email…"
                filters={[
                  {
                    key: "role",
                    label: "Role",
                    options: ["client", "lawyer", "admin"],
                  },

                  {
                    key: "status",
                    label: "Status",
                    options: ["Active", "Deactivated", "Deleted"],
                  },

                  {
                    key: "position",
                    label: "Position",
                    options: Array.from(
                      new Set(userAccounts.map((u) => u.position).filter((p): p is string => !!p)),
                    ).sort(),
                  },
                ]}
                values={userFilters}
                onFilter={(key, value) => setUserFilters((prev) => ({ ...prev, [key]: value }))}
                shown={visibleUsers.length}
                total={userAccounts.length}
              />
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f7f5f0]">
                      {["Name", "Email", "Role", "Status", "Date Created", "Actions"].map((h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide px-5 py-3"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e4dc]">
                    {visibleUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#8a9ab5]">
                          No users match that search.
                        </td>
                      </tr>
                    )}
                    {visibleUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#f7f5f0]">
                        <td className="px-5 py-4 text-sm font-semibold text-[#0d1f3c]">
                          {u.full_name}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#8a9ab5]">{u.email}</td>
                        <td className="px-5 py-4">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-5 py-4">
                          {u.deleted_at ? (
                            <Badge text="Deleted" />
                          ) : u.is_active === false ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Deactivated
                            </span>
                          ) : (
                            <Badge text="Active" />
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#8a9ab5]">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setViewUser(u)}
                              className="text-xs text-[#c9a84c] hover:underline"
                            >
                              View
                            </button>
                            <button
                              onClick={() => setEditUser(u)}
                              className="text-xs text-[#8a9ab5] hover:text-[#0d1f3c] hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setManageUser(u)}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showCreateUser && (
              <CreateUserModal
                onClose={() => setShowCreateUser(false)}
                onCreate={(user) => {
                  setUserAccounts((prev) => [...prev, user]);

                  const newLog: AuditLog = {
                    id: newId(),

                    user_id: currentUser.id,

                    user_email: currentUser.email,

                    user_role: currentUser.role,

                    event_type: "ACCOUNT_CREATED",

                    event_description: `Account created: ${user.full_name} (${user.role})`,

                    resource_type: "user",

                    resource_id: user.id,

                    metadata: null,

                    ip_address: null,

                    user_agent: null,

                    success: true,

                    created_at: new Date().toISOString(),

                    // Optimistic local row for immediate feedback. The database

                    // writes its own authoritative copy via log_auth_event().

                    source: "client",
                  };

                  setAuditLogs((prev) => [newLog, ...prev]);

                  setShowCreateUser(false);
                }}
                existingCount={userAccounts.length}
              />
            )}

            {viewUser && <ViewUserModal user={viewUser} onClose={() => setViewUser(null)} />}

            {editUser && (
              <EditUserModal
                user={editUser}
                currentUserId={currentUser.id}
                activeAdminCount={activeAdminCount}
                onClose={() => setEditUser(null)}
                onUpdate={(updated) => {
                  setUserAccounts((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));

                  setEditUser(null);

                  setDeleteSuccess(`User ${updated.full_name} updated successfully.`);

                  setTimeout(() => setDeleteSuccess(null), 3000);
                }}
              />
            )}

            {manageUser && (
              <ManageUserModal
                user={manageUser}
                currentUserId={currentUser.id}
                activeAdminCount={activeAdminCount}
                onClose={() => setManageUser(null)}
                onRoleChange={(newRole) => {
                  setUserAccounts((prev) =>
                    prev.map((u) => (u.id === manageUser.id ? { ...u, role: newRole } : u)),
                  );

                  setManageUser(null);

                  setDeleteSuccess(`Role changed to ${newRole} for ${manageUser.full_name}.`);

                  setTimeout(() => setDeleteSuccess(null), 3000);
                }}
                onDeactivate={() => {
                  setUserAccounts((prev) =>
                    prev.map((u) => (u.id === manageUser.id ? { ...u, is_active: false } : u)),
                  );

                  setManageUser(null);

                  setDeleteSuccess(`Account deactivated for ${manageUser.full_name}.`);

                  setTimeout(() => setDeleteSuccess(null), 3000);
                }}
                onReactivate={() => {
                  setUserAccounts((prev) =>
                    prev.map((u) => (u.id === manageUser.id ? { ...u, is_active: true } : u)),
                  );

                  setManageUser(null);

                  setDeleteSuccess(`Account reactivated for ${manageUser.full_name}.`);

                  setTimeout(() => setDeleteSuccess(null), 3000);
                }}
              />
            )}

            {deleteTarget && (
              <DeleteConfirmModal
                userName={deleteTarget.full_name}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => handleDelete(deleteTarget)}
              />
            )}
          </div>
        )}

        {tab === "intake" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Client Intake</h2>
            <AdminIntake />
          </div>
        )}

        {tab === "matters" && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">All Matters</h2>
            <MattersTable
              matters={allMatters}
              currentUser={currentUser}
              onNavigate={onNavigate}
              practiceAreas={practiceAreas}
              lawyers={lawyers}
              auditLogs={auditLogs}
              onMatterUpdated={applyMatterPatch}
            />

            <div className="space-y-4 max-w-2xl pt-4 border-t border-[#e8e4dc]">
              <h3 className="font-serif text-xl font-bold text-[#0d1f3c]">Conflict Check</h3>
              <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
                <p className="text-[#2c3347] text-sm mb-4 leading-relaxed">
                  Search for a client or party name to identify potential conflicts with existing
                  matters.
                </p>
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    placeholder="Enter client or party name…"
                    value={conflictName}
                    onChange={(e) => setConflictName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runConflictCheck()}
                    className="flex-1 bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
                  />
                  <button
                    onClick={runConflictCheck}
                    className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-6 py-3 rounded transition-colors"
                  >
                    Search
                  </button>
                </div>
                {conflictResult && (
                  <div
                    className={`rounded-lg p-4 text-sm font-medium ${
                      conflictResult.startsWith("⚠")
                        ? "bg-amber-50 border border-amber-200 text-amber-800"
                        : "bg-green-50 border border-green-200 text-green-800"
                    }`}
                  >
                    {conflictResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "appointments" && (
          <AppointmentsPanel role="admin" userId={currentUser.id} matters={allMatters} />
        )}

        {tab === "lawyers" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Lawyer Management</h2>
            {unassigned.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-800 text-sm font-semibold mb-2">
                  Unassigned Matters ({unassigned.length})
                </p>
                <div className="space-y-2">
                  {unassigned.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between bg-white rounded-lg p-3 border border-amber-100"
                    >
                      <div>
                        <span className="text-sm font-mono font-semibold text-[#0d1f3c]">
                          {m.matter_number}
                        </span>
                        <span className="text-sm text-[#8a9ab5] ml-3">
                          <Person id={m.client_id} />
                        </span>
                      </div>
                      <select
                        defaultValue=""
                        onChange={async (e) => {
                          const lawyerId = e.target.value;

                          if (!lawyerId) return;

                          // Same zero-row trap as the matter detail: verify a row

                          // actually came back before telling the admin it worked.

                          const { data, error } = await supabase

                            .from("matters")

                            .update({ lawyer_id: lawyerId })

                            .eq("id", m.id)

                            .select("id");

                          if (error || !data || data.length === 0) {
                            showToast(
                              error?.message ??
                                "The change was not saved. Your account is not allowed to edit this matter.",
                              "error",
                            );

                            e.target.value = "";

                            return;
                          }

                          applyMatterPatch(m.id, { lawyer_id: lawyerId });

                          showToast(`${m.matter_number} assigned.`, "success");
                        }}
                        className="bg-[#f7f5f0] border border-[#e8e4dc] rounded px-3 py-1.5 text-xs text-[#0d1f3c]"
                      >
                        <option value="">Assign Lawyer…</option>
                        {lawyers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-[#e8e4dc] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f7f5f0]">
                    {["Lawyer", "Position", "Practice Areas", "Active Matters", ""].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e4dc]">
                  {lawyers.map((l) => {
                    const active = allMatters.filter(
                      (m) => m.lawyer_id === l.id && m.status === "Active",
                    ).length;

                    return (
                      <tr key={l.id} className="hover:bg-[#f7f5f0]">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={l.profile_image ?? ""}
                              alt={l.full_name}
                              className="w-8 h-8 rounded-full object-cover object-top"
                            />
                            <span className="text-sm font-semibold text-[#0d1f3c]">
                              {l.full_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#2c3347]">{l.position}</td>
                        <td className="px-5 py-4 text-sm text-[#8a9ab5]">
                          {l.practice_areas?.map((area) => area.name).join(", ")}
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-[#0d1f3c]">{active}</td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => onNavigate("lawyers", { lawyer: l.id })}
                            className="text-xs text-[#c9a84c] hover:underline"
                          >
                            Profile
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">All Documents</h2>
              <button
                onClick={() => setShowUpload(true)}
                className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-6 py-3 rounded transition-colors"
              >
                Upload Document
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Admin Access Note:</strong> You can see and open documents at every access
                level. Opening or deleting a document is recorded in the audit log.
              </p>
            </div>
            <DocumentsTable
              docs={allDocs}
              matters={allMatters}
              currentUser={currentUser}
              onAccessDenied={handleRestrictedAccess}
              onDeleted={(id) => setAllDocs((prev) => prev.filter((d) => d.id !== id))}
              onToast={showToast}
            />
            {showRestricted && <RestrictedScreen onReturn={() => setShowRestricted(false)} />}
          </div>
        )}

        {tab === "content" && (
          <div className="space-y-5">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Website Content</h2>
              <p className="text-sm text-[#8a9ab5] mt-1">
                Everything the public site reads. Unpublished rows stay in the database but
                disappear from the website.
              </p>
            </div>
            <ContentManager onToast={showToast} />
          </div>
        )}

        {tab === "reports" && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Reports</h2>
              <button
                onClick={() => void exportReports()}
                className="bg-[#0d1f3c] hover:bg-[#162d52] text-white text-sm font-semibold px-5 py-2.5 rounded transition-colors flex items-center gap-2"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export to Excel
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  label: "Total Inquiries",
                  value: String(inquiryCount),
                  desc: "All submitted inquiries",
                },

                {
                  label: "Active Matters",
                  value: String(allMatters.filter((m) => m.status === "Active").length),
                  desc: "Currently active matters",
                },

                {
                  label: "Total Matters",
                  value: String(allMatters.length),
                  desc: "All matters in system",
                },

                {
                  label: "Pending Conflict Checks",
                  value: String(allMatters.filter((m) => m.status === "Conflict Check").length),
                  desc: "Awaiting review",
                },

                {
                  label: "Unassigned Matters",
                  value: String(unassigned.length),
                  desc: "No lawyer assigned",
                },

                {
                  label: "Resolved / Closed",
                  value: String(
                    allMatters.filter((m) => ["Resolved", "Closed"].includes(m.status)).length,
                  ),
                  desc: "Completed matters",
                },
              ].map((r) => (
                <div key={r.label} className="bg-white rounded-xl border border-[#e8e4dc] p-6">
                  <p className="font-serif text-3xl font-bold text-[#0d1f3c] mb-1">{r.value}</p>
                  <p className="text-sm font-semibold text-[#2c3347] mb-0.5">{r.label}</p>
                  <p className="text-xs text-[#8a9ab5]">{r.desc}</p>
                </div>
              ))}
            </div>
            {/* Per-date, connected line/area chart (hand-built SVG — no chart
              library ships with this app). Replaces the old static bar list,
              which had no date axis; the all-time totals it provided live on
              as the legend strip under the chart. */}
            <MattersTimeline matters={allMatters} practiceAreas={practiceAreas} />
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">System Settings</h2>
            {[
              {
                title: "General",

                items: [
                  { label: "System Name", value: "Westwood Law Firm Portal" },

                  { label: "Environment", value: "Production" },

                  { label: "Version", value: "1.0.0" },

                  { label: "Timezone", value: "Asia/Manila (UTC+8)" },
                ],
              },

              {
                title: "Access Control",

                items: [
                  {
                    label: "Public Registration",
                    value: "Enabled (Client only)",
                  },

                  { label: "Lawyer/Admin Creation", value: "Admin only" },

                  { label: "Session Timeout", value: "30 minutes" },

                  {
                    label: "Password Policy",
                    value: "Minimum 6 characters, email verification required",
                  },
                ],
              },

              {
                title: "Notifications",

                items: [
                  {
                    label: "Email Notifications",
                    value: "Enabled via Supabase",
                  },

                  { label: "System Alerts", value: "Enabled" },

                  { label: "Audit Logging", value: "Enabled" },
                ],
              },
            ].map((section) => (
              <div
                key={section.title}
                className="bg-white rounded-xl border border-[#e8e4dc] overflow-hidden"
              >
                <div className="bg-[#f7f5f0] px-6 py-3 border-b border-[#e8e4dc]">
                  <p className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide">
                    {section.title}
                  </p>
                </div>
                <div className="p-6 space-y-3">
                  {section.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex justify-between py-2 border-b border-[#f7f5f0] last:border-0"
                    >
                      <span className="text-sm text-[#8a9ab5]">{item.label}</span>
                      <span className="text-sm font-medium text-[#0d1f3c]">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>System Settings:</strong> These settings are managed by system
                administrators. Contact your administrator to request changes to system
                configuration.
              </p>
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div className="max-w-2xl space-y-5">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">My Profile</h2>
            <ProfileEditor userId={currentUser.id} />
          </div>
        )}
        {tab === "audit" && (
          <div className="space-y-4">
            <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Audit Logs</h2>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>Reading this table:</strong> rows marked <strong>Recorded</strong> were
                written by a database trigger — they are the authoritative record of what happened,
                and include confidential-file access. Rows marked <strong>Reported</strong> were
                written by the browser session that performed the action; they are useful context
                but could have been influenced by the client, so do not treat them as proof on their
                own.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#e8e4dc] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f7f5f0]">
                    {[
                      "User",
                      "Role",
                      "Action",
                      "Record / Target",
                      "Result",
                      "Source",
                      "Date & Time",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e4dc]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#f7f5f0]">
                      <td className="px-5 py-4 text-sm font-medium text-[#0d1f3c]">
                        {log.user_email || "System"}
                      </td>
                      <td className="px-5 py-4">
                        <RoleBadge role={log.user_role || "client"} />
                      </td>
                      <td className="px-5 py-4 text-sm text-[#2c3347]">{log.event_description}</td>
                      <td className="px-5 py-4 text-sm text-[#8a9ab5] font-mono">
                        {log.resource_type} {log.resource_id ? `#${log.resource_id}` : ""}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded ${
                            !log.success ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                          }`}
                        >
                          {log.success ? "Success" : "Failed"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          title={
                            log.source === "trigger"
                              ? "Written by a database trigger — authoritative"
                              : "Written by the browser session — self-reported"
                          }
                          className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                            log.source === "trigger"
                              ? "bg-slate-100 text-slate-700 border-slate-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {log.source === "trigger" ? "Recorded" : "Reported"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#8a9ab5]">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {showUpload && (
          <UploadDocumentModal
            currentUser={currentUser}
            matters={allMatters.map((m) => ({
              id: m.id,
              matter_number: m.matter_number,
              title: m.title,
            }))}
            onClose={() => setShowUpload(false)}
            onUploaded={(doc) => {
              setAllDocs((prev) => [doc, ...prev]);
              showToast(`Uploaded ${doc.name}`);
            }}
          />
        )}
        {toast && (
          <PortalToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
        )}
      </PortalShell>
      {showNotifs && (
        <NotificationsModal
          items={notifs.items}
          loading={notifs.loading}
          error={notifs.error}
          unreadCount={notifs.unreadCount}
          onMarkRead={notifs.markRead}
          onMarkAllRead={notifs.markAllRead}
          onDelete={notifs.remove}
          onOpenLink={(link) => {
            setShowNotifs(false);
            if (["matters", "appointments", "documents"].includes(link)) setTab(link);
          }}
          onClose={() => setShowNotifs(false)}
        />
      )}
    </>
  );
}

// ── View user modal (admin) ───────────────────────────────────────────────────

function ViewUserModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="2xl" labelledBy="view-user-title">
      <ModalHeader title="User Details" titleId="view-user-title" onClose={onClose} />
      <ModalBody className="p-7 space-y-6">
          {/* Profile Header */}
          <div className="flex items-start gap-4 pb-6 border-b border-[#e8e4dc]">
            <div className="w-16 h-16 rounded-full bg-[#c9a84c]/20 flex items-center justify-center text-[#c9a84c] text-2xl font-bold">
              {user.full_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-[#0d1f3c]">{user.full_name}</h3>
              <p className="text-sm text-[#8a9ab5] mt-1">{user.email}</p>
              <div className="mt-2">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>

          {/* Account Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={MODAL_LABEL_CLASS}>
                User ID
              </label>
              <p className="text-sm text-[#0d1f3c] font-mono bg-[#f7f5f0] px-3 py-2 rounded border border-[#e8e4dc]">
                {user.id}
              </p>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Status
              </label>
              <div className="pt-1">
                <Badge text="Active" />
              </div>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Phone
              </label>
              <p className="text-sm text-[#0d1f3c]">{user.phone || "Not provided"}</p>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                City
              </label>
              <p className="text-sm text-[#0d1f3c]">{user.city || "Not provided"}</p>
            </div>
          </div>

          {/* Address */}
          {user.address && (
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Address
              </label>
              <p className="text-sm text-[#0d1f3c]">{user.address}</p>
            </div>
          )}

          {/* Date of Birth */}
          {user.date_of_birth && (
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Date of Birth
              </label>
              <p className="text-sm text-[#0d1f3c]">
                {new Date(user.date_of_birth).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#e8e4dc]">
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Account Created
              </label>
              <p className="text-sm text-[#0d1f3c]">{new Date(user.created_at).toLocaleString()}</p>
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Last Updated
              </label>
              <p className="text-sm text-[#0d1f3c]">{new Date(user.updated_at).toLocaleString()}</p>
            </div>
          </div>

          {/* Close Button */}
          <div className="pt-4">
            <button onClick={onClose} className={`w-full ${MODAL_BUTTON_PRIMARY_CLASS}`}>
              Close
            </button>
          </div>
      </ModalBody>
    </Modal>
  );
}

// ── Edit user modal (admin) ───────────────────────────────────────────────────

function EditUserModal({
  user,
  currentUserId,
  activeAdminCount,
  onClose,
  onUpdate,
}: {
  user: Profile;

  currentUserId: string;

  activeAdminCount: number;

  onClose: () => void;

  onUpdate: (updated: Profile) => void;
}) {
  const [form, setForm] = useState({
    honorific: user.honorific || "",

    firstName: user.first_name || "",

    middleName: user.middle_name || "",

    lastName: user.last_name || "",

    suffix: user.suffix || "",

    nickname: user.nickname || "",

    phone: user.phone || "",

    address: user.address || "",

    city: user.city || "",

    role: user.role,

    position: user.position || "",
  });

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  // The database will reject this, so say it here in plain language instead.

  const isLastAdmin =
    user.role === "admin" && user.is_active !== false && !user.deleted_at && activeAdminCount <= 1;

  const wouldLoseLastAdmin = isLastAdmin && form.role !== "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");

      return;
    }

    if (wouldLoseLastAdmin) {
      setError(
        "This is the last active administrator. Promote another account to admin before changing this one.",
      );

      return;
    }

    setLoading(true);

    setError("");

    // Call admin service to update user

    const { data, error: updateError } = await adminUpdateUser(user.id, {
      honorific: form.honorific,

      firstName: form.firstName,

      middleName: form.middleName,

      lastName: form.lastName,

      suffix: form.suffix,

      nickname: form.nickname,

      phone: form.phone || undefined,

      address: form.address || undefined,

      city: form.city || undefined,

      role: form.role,

      position: form.role !== "client" ? form.position || undefined : undefined,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError);

      return;
    }

    if (data) {
      onUpdate(data);

      onClose();
    }
  };

  // Mirrors private.compose_full_name() so the admin sees what the database

  // will store before saving.

  const composedName =
    [
      form.honorific.trim(),

      form.firstName.trim(),

      form.nickname.trim() ? `"${form.nickname.trim()}"` : "",

      form.middleName.trim(),

      form.lastName.trim(),
    ]
      .filter(Boolean)
      .join(" ") + (form.suffix.trim() ? `, ${form.suffix.trim()}` : "");

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      labelledBy="edit-user-title"
      dismissible={!loading}
    >
      <ModalHeader
        title="Edit Account"
        titleId="edit-user-title"
        description={`${user.full_name} · ${user.email}`}
        onClose={onClose}
        closeDisabled={loading}
      />

      <form onSubmit={handleSubmit}>
        <ModalBody className="p-6 sm:p-7 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Identity */}
            <div>
              <h3 className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-widest mb-3">
                Identity
              </h3>
              {/* Name parts — full_name is composed from these by the database,
                so the form edits the parts rather than the derived field. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Honorific
                  </label>
                  <input
                    type="text"
                    value={form.honorific}
                    onChange={(e) => setForm({ ...form, honorific: e.target.value })}
                    disabled={loading}
                    placeholder="Atty."
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                    disabled={loading}
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    disabled={loading}
                    required
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Middle Name
                  </label>
                  <input
                    type="text"
                    value={form.middleName}
                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                    disabled={loading}
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    disabled={loading}
                    required
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={form.suffix}
                    onChange={(e) => setForm({ ...form, suffix: e.target.value })}
                    disabled={loading}
                    placeholder="Jr., III"
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
              </div>
              <p className="text-xs text-[#8a9ab5] mt-3 bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2">
                Displayed as: <strong className="text-[#0d1f3c]">{composedName || "—"}</strong>
              </p>
            </div>

            {/* Contact */}
            <div className="pt-5 border-t border-[#e8e4dc]">
              <h3 className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-widest mb-3">
                Contact
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={loading}
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    City
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    disabled={loading}
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={MODAL_LABEL_CLASS}>
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    disabled={loading}
                    className={MODAL_INPUT_CLASS}
                  />
                </div>
              </div>
            </div>

            {/* Access */}
            <div className="pt-5 border-t border-[#e8e4dc]">
              <h3 className="text-xs font-semibold text-[#8a9ab5] uppercase tracking-widest mb-3">
                Access
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Role */}
                <div>
                  <label className={MODAL_LABEL_CLASS}>
                    Role *
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        role: e.target.value as "client" | "lawyer" | "admin",
                        position: "",
                      })
                    }
                    disabled={loading || isLastAdmin}
                    className={MODAL_INPUT_CLASS}
                  >
                    <option value="client">Client</option>
                    <option value="lawyer">Lawyer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Position at the firm (lawyers & staff) */}
                {form.role !== "client" && (
                  <div>
                    <label className={MODAL_LABEL_CLASS}>
                      Position at the Firm
                    </label>
                    <select
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                      disabled={loading}
                      className={MODAL_INPUT_CLASS}
                    >
                      <option value="">Select position…</option>
                      {LAW_FIRM_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {isLastAdmin && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3 leading-relaxed">
                  ⚠️ This is the only active administrator. The role is locked until you promote
                  someone else to admin, otherwise nobody could manage the firm.
                </p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <p role="alert" className={MODAL_ERROR_CLASS}>
                {error}
              </p>
            )}

            {/* Note about email */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700 leading-relaxed">
                ℹ️ Email address cannot be changed. Contact support if email change is required.
              </p>
            </div>
        </ModalBody>

        {/* Action bar, pinned under the scroll area so Save is always reachable */}
        <ModalFooter className="border-t border-[#e8e4dc] px-6 py-4 flex gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── Manage user modal (admin) ─────────────────────────────────────────────────

function ManageUserModal({
  user,
  currentUserId,
  activeAdminCount,
  onClose,
  onRoleChange,
  onDeactivate,
  onReactivate,
}: {
  user: Profile;

  currentUserId: string;

  activeAdminCount: number;

  onClose: () => void;

  onRoleChange: (newRole: "client" | "lawyer" | "admin") => void;

  onDeactivate: () => void;

  onReactivate: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState(user.role);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // The database refuses to remove the last active administrator

  // (private.guard_last_admin), so explain it before the admin tries.

  const isLastAdmin =
    user.role === "admin" && user.is_active !== false && !user.deleted_at && activeAdminCount <= 1;

  const isSelf = user.id === currentUserId;

  const wouldLoseLastAdmin = isLastAdmin && selectedRole !== "admin";

  const isInactive = user.is_active === false;

  const handleReactivate = async () => {
    setLoading(true);

    setError("");

    const { error: reactivateError } = await adminReactivateUser(user.id);

    setLoading(false);

    if (reactivateError) {
      setError(reactivateError);

      return;
    }

    onReactivate();

    onClose();
  };

  const handleRoleChange = async () => {
    if (selectedRole === user.role) {
      setError("Role is unchanged.");

      return;
    }

    if (wouldLoseLastAdmin) {
      setError(
        "This is the last active administrator. Promote another account to admin before changing this one.",
      );

      return;
    }

    setLoading(true);

    setError("");

    const { data, error: roleError } = await adminChangeUserRole(user.id, selectedRole);

    setLoading(false);

    if (roleError) {
      setError(roleError);

      return;
    }

    if (data) {
      onRoleChange(selectedRole);

      onClose();
    }
  };

  const handleDeactivate = async () => {
    if (isLastAdmin) {
      setError(
        "This is the last active administrator and cannot be deactivated. Promote another account first.",
      );

      return;
    }

    setLoading(true);

    setError("");

    const { error: deactivateError } = await adminDeactivateUser(user.id);

    setLoading(false);

    if (deactivateError) {
      setError(deactivateError);

      return;
    }

    onDeactivate();

    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      labelledBy="manage-user-title"
      dismissible={!loading}
    >
      <ModalHeader
        title="Manage User"
        titleId="manage-user-title"
        onClose={onClose}
        closeDisabled={loading}
      />
      <ModalBody className="p-7 space-y-6">
          {/* User Info */}
          <div className="pb-4 border-b border-[#e8e4dc]">
            <p className="text-lg font-bold text-[#0d1f3c]">{user.full_name}</p>
            <p className="text-sm text-[#8a9ab5] mt-1">{user.email}</p>
            <div className="mt-2">
              <RoleBadge role={user.role} />
            </div>
          </div>

          {/* Change Role Section */}
          {!showDeactivateConfirm && (
            <>
              <div>
                <label className={MODAL_LABEL_CLASS}>
                  Change User Role
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as "client" | "lawyer" | "admin")}
                  disabled={loading || isLastAdmin}
                  className={MODAL_INPUT_CLASS}
                >
                  <option value="client">Client</option>
                  <option value="lawyer">Lawyer</option>
                  <option value="admin">Admin</option>
                </select>
                {isLastAdmin && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3 leading-relaxed">
                    ⚠️ This is the only active administrator. The role is locked until you promote
                    someone else to admin, otherwise nobody could manage the firm.
                  </p>
                )}
                <button
                  onClick={handleRoleChange}
                  disabled={loading || selectedRole === user.role || isLastAdmin}
                  className="w-full mt-3 bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Updating..." : "Update Role"}
                </button>
              </div>

              {/* Deactivate Section */}
              <div className="pt-4 border-t border-[#e8e4dc]">
                <label className={MODAL_LABEL_CLASS}>
                  Account Actions
                </label>
                {isInactive ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-amber-800 leading-relaxed">
                        This account is currently <strong>deactivated</strong> and cannot sign in.
                      </p>
                    </div>
                    <button
                      onClick={handleReactivate}
                      disabled={loading}
                      className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold py-3 rounded-lg border border-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Reactivating..." : "Reactivate Account"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowDeactivateConfirm(true)}
                      disabled={loading || isLastAdmin}
                      className="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold py-3 rounded-lg border border-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Deactivate Account
                    </button>
                    <p className="text-xs text-[#8a9ab5] mt-2 leading-relaxed">
                      Deactivating prevents login but preserves all user data. You can reactivate it
                      later from this same screen.
                    </p>
                  </>
                )}
                {isSelf && (
                  <p className="text-xs text-[#8a9ab5] mt-2 leading-relaxed">
                    ℹ️ This is your own account. Changes take effect the next time you sign in.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Deactivate Confirmation */}
          {showDeactivateConfirm && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800 font-semibold mb-2">⚠️ Confirm Deactivation</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Are you sure you want to deactivate {user.full_name}'s account? They will not be
                  able to sign in until reactivated.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeactivateConfirm(false)}
                  disabled={loading}
                  className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-3 rounded-lg transition-all duration-200 hover:shadow-[0_8px_24px_-4px_rgb(217_119_6/0.4)] active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
                >
                  {loading ? "Deactivating..." : "Deactivate"}
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p role="alert" className={MODAL_ERROR_CLASS}>
              {error}
            </p>
          )}

          {/* Close button (when not in deactivate confirm) */}
          {!showDeactivateConfirm && (
            <div className="pt-2">
              <button
                onClick={onClose}
                disabled={loading}
                className={`w-full ${MODAL_BUTTON_SECONDARY_CLASS}`}
              >
                Close
              </button>
            </div>
          )}
      </ModalBody>
    </Modal>
  );
}

// ── Create user modal (admin) ─────────────────────────────────────────────────

// Law-firm positions offered when an admin creates a lawyer or staff account.

const LAW_FIRM_POSITIONS = [
  "Managing Partner",

  "Senior Partner",

  "Partner",

  "Of Counsel",

  "Senior Associate",

  "Associate",

  "Junior Associate",

  "Paralegal",

  "Legal Secretary",

  "Firm Administrator",

  "Office Administrator",
];

function CreateUserModal({
  onClose,
  onCreate,
  existingCount,
}: {
  onClose: () => void;
  onCreate: (u: Profile) => void;
  existingCount: number;
}) {
  const [form, setForm] = useState({
    name: "",

    email: "",

    password: "",

    confirmPassword: "",

    role: "client" as "client" | "lawyer" | "admin",

    position: "",

    phone: "",

    address: "",

    city: "",
  });

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation

    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      setError("Name, email, and password are required.");

      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");

      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");

      return;
    }

    setLoading(true);

    setError("");

    // Call the admin service to create user

    const { data, error: createError } = await adminCreateUser({
      email: form.email,

      password: form.password,

      fullName: form.name,

      role: form.role,

      phone: form.phone || undefined,

      address: form.address || undefined,

      city: form.city || undefined,

      position: form.role !== "client" && form.position ? form.position : undefined,
    });

    setLoading(false);

    if (createError) {
      setError(createError);

      return;
    }

    if (data) {
      // Call onCreate with the created profile

      onCreate({
        id: data.id,

        email: data.email,

        full_name: data.fullName,

        role: data.role,

        phone: form.phone || null,

        address: form.address || null,

        city: form.city || null,

        date_of_birth: null,

        created_at: new Date().toISOString(),

        updated_at: new Date().toISOString(),
      } as Profile);

      // Clear password fields immediately

      setForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));

      onClose();
    }
  };

  return (
    <Modal open onClose={onClose} size="md" labelledBy="create-user-title" dismissible={!loading}>
      <ModalHeader
        title="Add User Account"
        titleId="create-user-title"
        onClose={onClose}
        closeDisabled={loading}
      />
      <ModalBody className="p-7">
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Full Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={loading}
                className={MODAL_INPUT_CLASS}
                placeholder="Enter full name"
              />
            </div>

            {/* Email */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Email Address *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={loading}
                className={MODAL_INPUT_CLASS}
                placeholder="user@example.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  disabled={loading}
                  className={`${MODAL_INPUT_CLASS} pr-10`}
                  placeholder="Minimum 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  disabled={loading}
                  className={`${MODAL_INPUT_CLASS} pr-10`}
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9ab5] hover:text-[#0d1f3c] text-sm"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Phone (optional)
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={loading}
                className={MODAL_INPUT_CLASS}
                placeholder="+63 9XX XXX XXXX"
              />
            </div>

            {/* Role */}
            <div>
              <label className={MODAL_LABEL_CLASS}>
                Role *
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as "client" | "lawyer" | "admin",
                    position: "",
                  })
                }
                disabled={loading}
                className={MODAL_INPUT_CLASS}
              >
                <option value="client">Client</option>
                <option value="lawyer">Lawyer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Position at the firm (lawyers & staff) */}
            {form.role !== "client" && (
              <div>
                <label className={MODAL_LABEL_CLASS}>
                  Position at the Firm
                </label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                  disabled={loading}
                  className={MODAL_INPUT_CLASS}
                >
                  <option value="">Select position…</option>
                  {LAW_FIRM_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#8a9ab5] mt-1">
                  Shown on the public "Our Lawyers" page for lawyers.
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <p role="alert" className={MODAL_ERROR_CLASS}>
                {error}
              </p>
            )}

            {/* Security note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700 leading-relaxed">
                🔒 Password is securely encrypted and will never be displayed after account
                creation.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
              >
                {loading ? "Creating..." : "Create Account"}
              </button>
            </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function ClientPortal({ onNavigate, savedLawyers }: ClientPortalProps) {
  const { user, loading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  // Redirect to auth page if not authenticated (must be at top level, not conditional)

  useEffect(() => {
    if (!user && !loading) {
      onNavigate("auth");
    }
  }, [user, loading, onNavigate]);

  // Show loading state while checking authentication

  if (loading) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen flex items-center justify-center px-6 py-12">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#8a9ab5] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Show redirecting message if not authenticated

  if (!user) {
    return (
      <div className="bg-[#f7f5f0] min-h-screen flex items-center justify-center px-6 py-12">
        <div className="text-center">
          <p className="text-[#8a9ab5] text-sm">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  // Route to appropriate portal based on role

  if (user.role === "client") {
    return (
      <ClientPortalView
        currentUser={user}
        onNavigate={onNavigate}
        onSignOut={handleSignOut}
        onSwitchUser={
          () => {} // No-op: can't switch users with real auth
        }
        savedLawyers={savedLawyers}
      />
    );
  }

  if (user.role === "lawyer") {
    return (
      <LawyerPortalView
        currentUser={user}
        onNavigate={onNavigate}
        onSignOut={handleSignOut}
        onSwitchUser={() => {}} // No-op
      />
    );
  }

  return (
    <AdminPortalView
      currentUser={user}
      onNavigate={onNavigate}
      onSignOut={handleSignOut}
      onSwitchUser={() => {}} // No-op
    />
  );
}
