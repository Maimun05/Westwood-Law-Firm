// ============================================================================
// Seminar helpers
// ============================================================================

// seminar_events.date is a TIMESTAMPTZ, so it arrives as a full ISO string and
// used to be printed verbatim ("2026-10-15T00:00:00+08:00"). Show the date the
// firm would write on a flyer instead. Manila time, to match the office — do
// not switch this to the browser's local zone or the date shifts for anyone
// outside PHT.
export const formatSeminarDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
