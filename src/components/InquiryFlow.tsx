import { useState, useEffect, useRef } from "react";

import { getPracticeAreas, getLawyers, type PracticeArea, type Lawyer } from "@/lib/content";

import {
  submitInquiry,
  notifyFirmOfInquiry,
  uploadInquiryAttachment,
  attachInquiryFiles,
  type InquiryFileMeta,
} from "@/utils/api";

import { formatFileSize } from "@/lib/services/documents";

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

type InquiryFlowProps = {
  onNavigate: (page: Page, params?: Record<string, string>) => void;

  prefilledLawyerId?: string;

  prefilledAreaId?: string;
};

const inquiryTypes = [
  {
    id: "advice",
    label: "I need legal advice",
    desc: "Get guidance on a legal question or situation",
  },

  {
    id: "hire",
    label: "I want to hire a lawyer",
    desc: "Retain a Westwood lawyer for a legal matter",
  },

  {
    id: "existing",
    label: "I have an existing matter",
    desc: "Follow up on an ongoing legal matter",
  },

  {
    id: "question",
    label: "I have a general question",
    desc: "Ask about our services, fees, or process",
  },

  {
    id: "specific",
    label: "I want to contact a specific lawyer",
    desc: "Reach out to a particular Westwood lawyer",
  },
];

function generateRef() {
  const n = String(Math.floor(100 + Math.random() * 900));

  const y = new Date().getFullYear();

  return `WI-${y}-00${n}`;
}

// Attachments: what the visitor may send, and how much of it. The bucket in

// 20261008_inquiry_attachments.sql enforces the same size ceiling server-side.

const MAX_FILES = 5;

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ACCEPT = "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";

function fileKind(file: File): "image" | "video" | "pdf" | "doc" {
  if (file.type.startsWith("image/")) return "image";

  if (file.type.startsWith("video/")) return "video";

  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";

  return "doc";
}

function FileKindIcon({ kind }: { kind: "image" | "video" | "pdf" | "doc" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "image" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" {...common} />
          <circle cx="8.5" cy="10" r="1.5" {...common} />
          <path d="M21 15l-5-5-9 9" {...common} />
        </>
      )}
      {kind === "video" && (
        <>
          <rect x="3" y="6" width="13" height="12" rx="2" {...common} />
          <path d="M16 10l5-3v10l-5-3" {...common} />
        </>
      )}
      {kind === "pdf" && (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...common} />
          <path d="M14 3v5h5" {...common} />
        </>
      )}
      {kind === "doc" && (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...common} />
          <path d="M14 3v5h5" {...common} />
          <path d="M9 13h6M9 17h4" {...common} />
        </>
      )}
    </svg>
  );
}

function InquiryForm({ onNavigate, prefilledLawyerId, prefilledAreaId }: InquiryFlowProps) {
  const { user } = useAuth();

  const [lawyers, setLawyers] = useState<Lawyer[]>([]);

  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);

  const [step, setStep] = useState<"type" | "form" | "success">("type");

  const [inquiryType, setInquiryType] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const [refNumber, setRefNumber] = useState(generateRef);

  // Attachments (file / photo / video) for "discoverable insights".

  const [files, setFiles] = useState<File[]>([]);

  const [fileError, setFileError] = useState<string | null>(null);

  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const [attachedSummary, setAttachedSummary] = useState<string | null>(null);

  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (list: FileList | File[]) => {
    setFileError(null);

    setFiles((prev) => {
      const next = [...prev];

      for (const f of Array.from(list)) {
        if (next.length >= MAX_FILES) {
          setFileError(`Up to ${MAX_FILES} files per inquiry.`);
          break;
        }

        if (f.size > MAX_FILE_BYTES) {
          setFileError(`"${f.name}" is larger than 25 MB.`);
          continue;
        }

        if (next.some((x) => x.name === f.name && x.size === f.size)) continue;

        next.push(f);
      }

      return next;
    });
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  useEffect(() => {
    Promise.all([getLawyers(), getPracticeAreas()]).then(([lawyerResult, practiceAreaResult]) => {
      if (lawyerResult.data) setLawyers(lawyerResult.data);

      if (practiceAreaResult.data) setPracticeAreas(practiceAreaResult.data);
    });
  }, []);

  const [form, setForm] = useState({
    fullName: "",

    email: "",

    phone: "",

    practiceArea: prefilledAreaId ?? "",

    lawyerId: prefilledLawyerId ?? "",

    description: "",

    contactMethod: "Email",
  });

  // The contact details come from the signed-in account, not from typed fields
  // (the name/email/phone inputs were removed). `user` is the live `profiles`
  // row from useAuth -> getCurrentUserProfile, so it tracks the Profile screen
  // rather than the stale sign-up metadata.

  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,

        fullName: user.fullName || prev.fullName,

        email: user.email || prev.email,

        phone: user.phone || prev.phone,
      }));
    }
  }, [user]);

  const selectedLawyer = form.lawyerId ? lawyers.find((l) => l.id === form.lawyerId) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);

    setSubmitError(null);

    try {
      const pa = practiceAreas.find((p) => p.id === form.practiceArea);

      // submitInquiry reports failures by RETURNING { success: false }, it does

      // not throw. Ignoring the result used to show the success screen even

      // when nothing was saved.

      const result = await submitInquiry(
        {
          name: form.fullName,

          email: form.email,

          phone: form.phone,

          concern: inquiryTypes.find((t) => t.id === inquiryType)?.label ?? inquiryType,

          method: form.contactMethod,

          message: `${form.description}${
            selectedLawyer ? `\n\nRequested lawyer: ${selectedLawyer.full_name}` : ""
          }`,

          practiceArea: pa?.name ?? form.practiceArea,
        },
        { notifyFirm: false },
      );

      if (!result.success) {
        setSubmitError("Unable to submit your inquiry. Please try again.");

        return;
      }

      const ref = result.referenceNumber ?? refNumber;

      setRefNumber(ref);

      // The inquiry is safely recorded at this point. Attachments are a

      // second, best-effort step: upload each file to the private bucket,

      // then link them to the inquiry by reference number. A failure here

      // must not turn a submitted inquiry into an error screen — it is

      // reported on the success screen instead.

      try {
        if (files.length > 0) {
          let failed = 0;

          const metas: InquiryFileMeta[] = [];

          if (!result.referenceNumber) {
            failed = files.length;
          } else {
            for (let i = 0; i < files.length; i++) {
              setUploadNote(`Uploading attachment ${i + 1} of ${files.length}…`);

              const up = await uploadInquiryAttachment(files[i]);

              if (up.path) {
                metas.push({
                  path: up.path,
                  name: files[i].name,
                  mime: files[i].type || "application/octet-stream",
                  size: files[i].size,
                });
              } else {
                failed++;
              }
            }

            if (metas.length > 0) {
              setUploadNote("Linking attachments…");

              const linked = await attachInquiryFiles(result.referenceNumber, metas);

              if (!linked.success) failed += metas.length;
            }
          }

          setUploadNote(null);

          setAttachedSummary(
            failed === 0
              ? `${files.length} attachment${files.length > 1 ? "s" : ""} sent with this inquiry.`
              : `${files.length - failed} of ${files.length} attachments were sent — the rest could not be uploaded.`,
          );
        }
      } finally {
        // After the attachments, so the firm's email can include them. In the

        // finally because a signed-out visitor's inquiry is only reachable by

        // email — Client Intake does not show it. The call is idempotent, so

        // it is safe even if the attachment step threw.

        void notifyFirmOfInquiry(ref);
      }

      setStep("success");
    } catch {
      setSubmitError("Unable to submit your inquiry. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "success") {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-[#e8e4dc] p-10 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[#c9a84c]/15 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-7 h-7 text-[#c9a84c]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-3">
            Submitted
          </p>
          <h2 className="font-serif text-3xl font-bold text-[#0d1f3c] mb-3">
            Your legal inquiry has been submitted successfully.
          </h2>
          <p className="text-[#8a9ab5] text-sm mb-8 leading-relaxed">
            A Westwood team member will review your inquiry and contact you within one to two
            business days.
          </p>

          <div className="bg-[#f7f5f0] rounded-xl p-6 text-left space-y-3 mb-8">
            <div className="flex justify-between text-sm">
              <span className="text-[#8a9ab5]">Reference No.</span>
              <span className="font-mono font-semibold text-[#0d1f3c] text-base">{refNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8a9ab5]">Inquiry Type</span>
              <span className="text-[#0d1f3c] font-medium text-right max-w-[220px]">
                {inquiryTypes.find((t) => t.id === inquiryType)?.label}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8a9ab5]">Contact Method</span>
              <span className="text-[#0d1f3c] font-medium">{form.contactMethod}</span>
            </div>
            {attachedSummary && (
              <div className="flex justify-between text-sm gap-4">
                <span className="text-[#8a9ab5] flex-shrink-0">Attachments</span>
                <span className="text-[#0d1f3c] font-medium text-right">{attachedSummary}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[#8a9ab5]">Date</span>
              <span className="text-[#0d1f3c] font-medium">
                {new Date().toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#8a9ab5] mb-6 leading-relaxed">
            Submitting this inquiry does not establish an attorney-client relationship. All
            communications are treated with strict confidentiality.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => onNavigate("portal")}
              className="bg-[#0d1f3c] hover:bg-[#162d52] text-white font-semibold py-3 px-6 rounded text-sm transition-colors"
            >
              Track It in Your Account
            </button>
            <button
              onClick={() => onNavigate("home")}
              className="text-[#8a9ab5] hover:text-[#0d1f3c] text-sm transition-colors py-2"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "type") {
    return (
      <div className="bg-[#f7f5f0] min-h-screen pt-20">
        <div className="bg-[#0d1f3c] py-12">
          <div className="max-w-3xl mx-auto px-6 lg:px-8 text-center">
            <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-4">
              Get Started
            </p>
            <h1 className="font-serif text-4xl font-bold text-white mb-4">Start a Legal Inquiry</h1>
            <p className="text-white/60 text-lg">
              Tell us how we can help. Our team responds within 1–2 business days.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-14">
          <h2 className="font-serif text-2xl font-bold text-[#0d1f3c] mb-2 text-center">
            What brings you to Westwood?
          </h2>
          <p className="text-[#8a9ab5] text-sm text-center mb-10">
            Select the option that best describes your situation.
          </p>

          <div className="space-y-3">
            {inquiryTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setInquiryType(t.id);
                  setStep("form");
                }}
                className={`w-full p-5 rounded-xl border-2 text-left transition-all flex items-center gap-5 ${
                  inquiryType === t.id
                    ? "border-[#c9a84c] bg-[#0d1f3c] text-white"
                    : "border-[#e8e4dc] bg-white hover:border-[#c9a84c]/50 text-[#0d1f3c]"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    inquiryType === t.id ? "border-[#c9a84c] bg-[#c9a84c]" : "border-[#e8e4dc]"
                  }`}
                >
                  {inquiryType === t.id && <div className="w-2 h-2 rounded-full bg-[#0d1f3c]" />}
                </div>
                <div>
                  <p
                    className={`font-semibold ${
                      inquiryType === t.id ? "text-white" : "text-[#0d1f3c]"
                    }`}
                  >
                    {t.label}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      inquiryType === t.id ? "text-white/60" : "text-[#8a9ab5]"
                    }`}
                  >
                    {t.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // step === "form"

  return (
    <div className="bg-[#f7f5f0] min-h-screen pt-20">
      <div className="bg-[#0d1f3c] py-10">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <button
            onClick={() => setStep("type")}
            className="text-white/40 hover:text-white text-sm mb-6 flex items-center gap-2 transition-colors"
          >
            ← Change inquiry type
          </button>
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-2">
            Legal Inquiry
          </p>
          <h1 className="font-serif text-3xl font-bold text-white">
            {inquiryTypes.find((t) => t.id === inquiryType)?.label}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl border border-[#e8e4dc] p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contact details come from the signed-in account — nothing to type. */}
            <div className="flex items-start gap-3 rounded-xl bg-[#f7f5f0] border border-[#e8e4dc] px-4 py-3.5">
              <svg
                className="w-5 h-5 text-[#c9a84c] flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0d1f3c] truncate">
                  {form.fullName || "Your account"}
                </p>
                <p className="text-xs text-[#8a9ab5] truncate">
                  {form.email}
                  {form.phone ? ` · ${form.phone}` : ""}
                </p>
                <p className="text-xs text-[#8a9ab5] mt-1">
                  We&rsquo;ll contact you using the details on your account.
                </p>
              </div>
            </div>

            {/* Inquiry details */}
            <div>
              <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-4">Inquiry Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                    Practice Area
                  </label>
                  <select
                    value={form.practiceArea}
                    onChange={(e) => setForm({ ...form, practiceArea: e.target.value })}
                    className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
                  >
                    <option value="">Not sure / General</option>
                    {practiceAreas.map((pa) => (
                      <option key={pa.id} value={pa.id}>
                        {pa.name}
                      </option>
                    ))}
                  </select>
                </div>

                {inquiryType === "specific" && (
                  <div>
                    <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                      Preferred Lawyer
                    </label>
                    <select
                      value={form.lawyerId}
                      onChange={(e) => setForm({ ...form, lawyerId: e.target.value })}
                      className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
                    >
                      <option value="">Select a lawyer (optional)</option>
                      {lawyers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.full_name} — {l.position}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                    Brief Description <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Describe your legal concern or question. The more detail you provide, the better we can assist you."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-4 py-3 text-sm text-[#0d1f3c] placeholder-[#8a9ab5] focus:outline-none focus:border-[#c9a84c] resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                    Attach File / Photo / Video
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    className={`rounded-xl border-2 border-dashed px-5 py-6 text-center cursor-pointer transition-colors ${
                      dragOver
                        ? "border-[#c9a84c] bg-[#c9a84c]/5"
                        : "border-[#e8e4dc] hover:border-[#c9a84c]/60"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <svg
                      className="w-6 h-6 mx-auto mb-2 text-[#c9a84c]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 9 12 4 17 9" />
                      <line x1="12" y1="4" x2="12" y2="16" />
                    </svg>
                    <p className="text-sm font-medium text-[#0d1f3c]">
                      Click to attach, or drag files here
                    </p>
                    <p className="text-xs text-[#8a9ab5] mt-1">
                      Photos, videos, PDF or office documents — up to {MAX_FILES} files, 25 MB each.
                      Evidence and documents help us understand your concern faster.
                    </p>
                  </div>
                  {fileError && <p className="text-xs text-red-500 mt-2">{fileError}</p>}
                  {files.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {files.map((f, i) => (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-3 bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2"
                        >
                          <span className="text-[#c9a84c] flex-shrink-0">
                            <FileKindIcon kind={fileKind(f)} />
                          </span>
                          <span
                            className="flex-1 min-w-0 text-sm text-[#0d1f3c] truncate"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                          <span className="text-xs text-[#8a9ab5] flex-shrink-0">
                            {formatFileSize(f.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            aria-label={`Remove ${f.name}`}
                            className="text-[#8a9ab5] hover:text-red-500 text-lg leading-none flex-shrink-0"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1.5">
                    Preferred Contact Method
                  </label>
                  <div className="flex gap-3">
                    {["Email", "Phone Call", "Video Call"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setForm({ ...form, contactMethod: m })}
                        className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                          form.contactMethod === m
                            ? "border-[#c9a84c] bg-[#0d1f3c] text-white"
                            : "border-[#e8e4dc] text-[#2c3347] hover:border-[#c9a84c]/50"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-[#8a9ab5] leading-relaxed mb-4">
                Submitting this inquiry does not establish an attorney-client relationship. All
                information is treated with strict confidentiality. A reference number will be
                generated upon submission.
              </p>
              {submitError && <p className="text-red-500 text-sm mb-4">{submitError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#c9a84c] hover:bg-[#e2c87a] disabled:opacity-60 text-[#0d1f3c] font-semibold py-4 rounded transition-colors text-sm"
              >
                {submitting ? (uploadNote ?? "Submitting…") : "Submit Legal Inquiry"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

// Legal inquiries are for registered clients. An unregistered visitor who

// reaches this page (button or direct URL) gets the firm's email and the

// Contact page instead — no sign-in prompt, per the owner's direction.

export default function InquiryFlow({
  onNavigate,
  prefilledLawyerId,
  prefilledAreaId,
}: InquiryFlowProps) {
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
      <div className="bg-[#f7f5f0] min-h-screen pt-20 flex items-center justify-center px-6 py-12">
        <div className="bg-white rounded-2xl border border-[#e8e4dc] p-10 max-w-lg w-full">
          <p className="text-[#c9a84c] text-xs tracking-[0.2em] uppercase font-medium mb-3">
            Get Started
          </p>
          <InquiryFallback title="Start a Legal Inquiry" onNavigate={onNavigate} />
        </div>
      </div>
    );
  }

  return (
    <InquiryForm
      onNavigate={onNavigate}
      prefilledLawyerId={prefilledLawyerId}
      prefilledAreaId={prefilledAreaId}
    />
  );
}
