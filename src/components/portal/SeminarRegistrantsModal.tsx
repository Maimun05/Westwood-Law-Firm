import { useCallback, useEffect, useState } from "react";

import { subscribeToTables } from "@/lib/realtime";

import {
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
import {
  listSeminarEmailLog,
  listSeminarRegistrants,
  sendSeminarEmail,
  type SeminarEmailFailure,
  type SeminarEmailLogRow,
  type SeminarRegistrant,
} from "@/lib/services/seminarEmail";
import { formatSeminarDate } from "@/utils/seminar";

// ============================================================================
// Registrants of one seminar — list, compose, send
// ============================================================================
// Opened from Website Content → Seminars. The compose form is pre-filled from
// the seminar's own fields, the admin can rewrite every word of it, and the
// send is one edge-function call (send-seminar-email) so the API key stays
// server-side. Every send lands in seminar_email_log, which the "Recent sends"
// list reads back.
// ============================================================================

const TITLE_ID = "seminar-registrants-title";

/** The seminar fields this dialog needs; ContentManager passes its content row. */
export type SeminarForEmail = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  speaker: string;
};

/** One address is one recipient, matching the edge function's dedupe. */
const uniqueEmailCount = (registrants: SeminarRegistrant[]) => {
  const seen = new Set<string>();
  for (const r of registrants) {
    const email = r.email.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return seen.size;
};

const defaultSubject = (seminar: SeminarForEmail) => `Your registration: ${seminar.title}`;

const defaultMessage = (seminar: SeminarForEmail) =>
  [
    "Hi {name},",
    "",
    `Thank you for registering for ${seminar.title} on ${formatSeminarDate(seminar.date)} at ${seminar.time}.`,
    "",
    `Venue: ${seminar.location}`,
    `Speaker: ${seminar.speaker}`,
    "",
    "We look forward to seeing you. If you can no longer attend, simply reply to this email.",
    "",
    "Best regards,",
    "Westwood Law Firm",
  ].join("\n");

const formatDay = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatStamp = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function SeminarRegistrantsModal({
  seminar,
  onClose,
  onToast,
}: {
  seminar: SeminarForEmail;
  onClose: () => void;
  onToast?: (message: string, tone?: "success" | "error") => void;
}) {
  const [registrants, setRegistrants] = useState<SeminarRegistrant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [log, setLog] = useState<SeminarEmailLogRow[]>([]);

  const [subject, setSubject] = useState(() => defaultSubject(seminar));
  const [message, setMessage] = useState(() => defaultMessage(seminar));
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    failures: SeminarEmailFailure[];
  } | null>(null);

  const loadAll = useCallback(async () => {
    const [list, history] = await Promise.all([
      listSeminarRegistrants(seminar.id),
      listSeminarEmailLog(seminar.id),
    ]);
    if (list.error) setLoadError(list.error);
    else {
      setLoadError(null);
      setRegistrants(list.data ?? []);
    }
    setLog(history.data ?? []);
  }, [seminar.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Live registrations: a new sign-up (an inquiries row carrying seminar_id)
  // and every send appended to the log show up while the dialog is open. The
  // composed subject/message are local state and are never overwritten.
  useEffect(() => {
    return subscribeToTables(["inquiries", "seminar_email_log"], () => void loadAll(), {
      filter: `seminar_id=eq.${seminar.id}`,
      channelKey: seminar.id,
    });
  }, [loadAll, seminar.id]);

  const recipients = registrants ? uniqueEmailCount(registrants) : 0;
  const ready = subject.trim().length > 0 && message.trim().length > 0 && recipients > 0;

  const send = async () => {
    setSending(true);
    setSendError(null);
    const res = await sendSeminarEmail({
      seminarId: seminar.id,
      subject: subject.trim(),
      message: message.trim(),
    });
    setSending(false);
    setConfirming(false);

    if (!res.ok) {
      setSendError(res.error ?? "Could not send the email.");
      onToast?.(res.error ?? "Could not send the email.", "error");
      return;
    }

    setResult({ sent: res.sent, failed: res.failed, failures: res.failures });
    onToast?.(
      res.failed
        ? `Sent to ${res.sent} of ${res.recipients} — ${res.failed} failed.`
        : `Sent to ${res.sent} registrant${res.sent === 1 ? "" : "s"}.`,
      res.failed ? "error" : "success",
    );
    const history = await listSeminarEmailLog(seminar.id);
    setLog(history.data ?? []);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      align="top"
      labelledBy={TITLE_ID}
      dismissible={!sending}
    >
      <ModalHeader
        tone="light"
        eyebrow="Seminar registrants"
        title={seminar.title}
        titleId={TITLE_ID}
        description={`${formatSeminarDate(seminar.date)} · ${seminar.time} · ${seminar.location}`}
        onClose={onClose}
        closeDisabled={sending}
      />

      <ModalBody className="p-6 space-y-5">
        {/* ── Who registered ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--line)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[var(--surface-sunken)] border-b border-[var(--line)]">
            <p className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
              Registrants
            </p>
            <p className="text-xs text-[var(--ink-muted)]">
              {registrants === null
                ? "Loading…"
                : `${registrants.length} registration${registrants.length === 1 ? "" : "s"} · ${recipients} email address${recipients === 1 ? "" : "es"}`}
            </p>
          </div>

          {loadError ? (
            <p className="px-4 py-5 text-sm text-red-600">{loadError}</p>
          ) : registrants === null ? null : registrants.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--ink-muted)] text-center">
              No one has registered for this seminar yet. Registrations from the public page appear
              here as soon as they are submitted.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {registrants.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--ink-strong)] truncate">{r.name || "—"}</p>
                    <p className="text-xs text-[var(--ink-muted)] truncate">
                      {r.email}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--ink-muted)] tabular-nums">
                    {formatDay(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── The email ──────────────────────────────────────────────────── */}
        {recipients > 0 && (
          <div className="space-y-3">
            <div>
              <label className={MODAL_LABEL_CLASS} htmlFor="seminar-email-subject">
                Subject
              </label>
              <input
                id="seminar-email-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sending}
                maxLength={200}
                className={MODAL_INPUT_CLASS}
              />
            </div>
            <div>
              <label className={MODAL_LABEL_CLASS} htmlFor="seminar-email-message">
                Message
              </label>
              <textarea
                id="seminar-email-message"
                rows={12}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                maxLength={5000}
                className={`${MODAL_INPUT_CLASS} resize-y`}
              />
              <p className="mt-1.5 text-xs text-[var(--ink-muted)] leading-relaxed">
                Use <span className="font-mono text-[var(--ink-strong)]">{"{name}"}</span> to greet
                each registrant by name. Plain text — a blank line starts a new paragraph. Replies
                go to the firm's inbox.
              </p>
            </div>
          </div>
        )}

        {sendError && (
          <p role="alert" className={MODAL_ERROR_CLASS}>
            {sendError}
          </p>
        )}

        {result && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              result.failed
                ? "border-amber-200 bg-amber-50/70"
                : "border-emerald-200 bg-emerald-50/70"
            }`}
          >
            <p className="text-sm text-[var(--ink-strong)]">
              {result.failed === 0
                ? `Sent to ${result.sent} registrant${result.sent === 1 ? "" : "s"}.`
                : `Sent to ${result.sent} — ${result.failed} could not be delivered.`}
            </p>
            {result.failures.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.failures.map((f) => (
                  <li key={f.email} className="text-xs text-red-700 break-words">
                    {f.email} — {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── What was sent before ───────────────────────────────────────── */}
        {log.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--ink-muted)] uppercase tracking-wide mb-2">
              Recent sends
            </p>
            <ul className="space-y-1.5">
              {log.map((entry) => (
                <li key={entry.id} className="text-xs text-[var(--ink-muted)]">
                  {formatStamp(entry.created_at)} · “{entry.subject}” · sent {entry.sent_count} of{" "}
                  {entry.recipient_count}
                  {entry.failed_count > 0 ? ` · ${entry.failed_count} failed` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </ModalBody>

      {confirming ? (
        <ModalFooter className="px-6 pb-6 pt-1">
          <div className="w-full space-y-3">
            <p className="text-center text-sm text-[var(--ink-body)]">
              Send “{subject.trim()}” to {recipients} email address{recipients === 1 ? "" : "es"}?
              This cannot be unsent.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={sending}
                className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
              >
                {sending
                  ? "Sending… this can take a minute"
                  : `Yes, send ${recipients} email${recipients === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </ModalFooter>
      ) : (
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className={`flex-1 ${MODAL_BUTTON_SECONDARY_CLASS}`}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready || sending}
            className={`flex-1 ${MODAL_BUTTON_PRIMARY_CLASS}`}
          >
            {recipients === 0
              ? "No registrants to email"
              : `Send to ${recipients} registrant${recipients === 1 ? "" : "s"}`}
          </button>
        </ModalFooter>
      )}
    </Modal>
  );
}
