import { useEffect, useState } from "react";
import { submitInquiry } from "@/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { formatSeminarDate } from "@/utils/seminar";
import type { SeminarEvent } from "@/lib/content";
import {
  MODAL_BUTTON_SECONDARY_CLASS,
  MODAL_ERROR_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_LABEL_CLASS,
  Modal,
  ModalBody,
  ModalHeader,
} from "@/components/ui/Modal";

type SeminarRegistrationModalProps = {
  /** The seminar being registered for; nothing renders when null. */
  event: SeminarEvent | null;
  onClose: () => void;
  onRegistered: (id: string) => void;
};

// Registrations are recorded as inquiries, so the firm sees them in the same
// queue as every other request (see submitInquiry). Shared by the landing page
// and the Insights & Resources page so both register through one code path.
export default function SeminarRegistrationModal({
  event,
  onClose,
  onRegistered,
}: SeminarRegistrationModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Prefill from the signed-in client each time a seminar is opened.
  useEffect(() => {
    if (!event) return;
    setForm({
      name: user?.fullName || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
    setError("");
  }, [event, user]);

  if (!event) return null;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.email.trim()) {
      setError("Please enter your name and email address.");
      return;
    }

    setSending(true);
    const result = await submitInquiry({
      name: form.name,
      email: form.email,
      phone: form.phone,
      concern: "Seminar registration",
      practiceArea: "",
      message: [
        `I would like to register for the following seminar:`,
        ``,
        `Seminar: ${event.title}`,
        `Date: ${formatSeminarDate(event.date)}`,
        `Time: ${event.time}`,
        `Location: ${event.location}`,
        `Speaker: ${event.speaker}`,
      ].join("\n"),
    });
    setSending(false);

    if (!result.success) {
      setError("We could not record your registration. Please try again, or email us directly.");
      return;
    }

    onRegistered(event.id);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      labelledBy="seminar-register-title"
      dismissible={!sending}
    >
      <ModalHeader
        tone="light"
        title="Register for this Seminar"
        titleId="seminar-register-title"
        description={`${event.title} · ${formatSeminarDate(event.date)} · ${event.time}`}
        onClose={onClose}
        closeDisabled={sending}
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
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={sending}
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
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={sending}
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
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={sending}
                placeholder="(63) 917 000 0000"
                className={MODAL_INPUT_CLASS}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className={MODAL_ERROR_CLASS}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] font-semibold py-3 rounded-lg transition-all text-sm active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none"
            >
              {sending ? "Registering…" : "Confirm Registration"}
            </button>
          </div>

          <p className="text-xs text-[#8a9ab5] leading-relaxed text-center">
            The firm will confirm your slot by email. Seats are subject to availability.
          </p>
        </form>
      </ModalBody>
    </Modal>
  );
}
