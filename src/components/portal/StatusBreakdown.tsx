// ============================================================================
// StatusBreakdown — matters grouped by status as a hand-rolled SVG stacked bar
// ============================================================================
// No chart library: a single inline <svg> draws the bar (one <rect> per status)
// and the legend below lists each status with its count. Fill colours are hex
// strings so the SVG rects and the legend dots can share one source.

export type BreakdownItem = { label: string; value: number };

const STATUS_FILL: Record<string, string> = {
  "New Inquiry": "#9ca3af",
  "Under Review": "#3b82f6",
  Consultation: "#a855f7",
  "Conflict Check": "#f59e0b",
  Accepted: "#14b8a6",
  Active: "#22c55e",
  Resolved: "#c9a84c",
  Closed: "#d1d5db",
  Confirmed: "#22c55e",
  Pending: "#f59e0b",
  Draft: "#3b82f6",
  Received: "#22c55e",
  Inactive: "#d1d5db",
};

const FALLBACK_FILL = "#94a3b8";

export default function StatusBreakdown({ items }: { items: BreakdownItem[] }) {
  const present = items.filter((i) => i.value > 0);
  const total = present.reduce((sum, i) => sum + i.value, 0);

  if (total === 0) {
    return <p className="text-sm text-[#8a9ab5] py-4 text-center">No matters to show yet.</p>;
  }

  let cursor = 0;
  const segments = present.map((i) => {
    const width = (i.value / total) * 100;
    const segment = { ...i, width, offset: cursor, fill: STATUS_FILL[i.label] ?? FALLBACK_FILL };
    cursor += width;
    return segment;
  });

  return (
    <div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[#f7f5f0]">
        <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="block h-3 w-full">
          {segments.map((s) => (
            <rect key={s.label} x={s.offset} y={0} width={s.width} height={1} fill={s.fill} />
          ))}
        </svg>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: s.fill }}
              />
              <span className="truncate text-[#2c3347]">{s.label}</span>
            </span>
            <span className="font-semibold text-[#0d1f3c]">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
