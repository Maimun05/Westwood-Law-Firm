// ============================================================================
// StatCard — a single KPI tile for the portal dashboards
// ============================================================================
// Mirrors the reference dashboard's metric tiles: a white card with the value in
// the serif display face, a small tone-tinted icon chip, and a caption. The tone
// classes are written out statically so Tailwind's scanner keeps them.
// A tile with a destination gets an onClick and renders as a button; tiles with
// no counterpart stay non-interactive.

import type { ReactNode } from "react";

export type StatTone = "navy" | "green" | "blue" | "amber" | "red" | "gold" | "purple";

const TONES: Record<StatTone, { value: string; chip: string }> = {
  navy: {
    value: "text-[var(--ink-strong)]",
    chip: "bg-[var(--navy-solid)]/5 text-[var(--ink-strong)]",
  },
  green: { value: "text-green-600", chip: "bg-green-50 text-green-600" },
  blue: { value: "text-blue-600", chip: "bg-blue-50 text-blue-600" },
  amber: { value: "text-amber-600", chip: "bg-amber-50 text-amber-600" },
  red: { value: "text-red-600", chip: "bg-red-50 text-red-600" },
  gold: { value: "text-[var(--gold-ink)]", chip: "bg-[#c9a84c]/10 text-[var(--gold-ink)]" },
  purple: { value: "text-purple-600", chip: "bg-purple-50 text-purple-600" },
};

export default function StatCard({
  label,
  value,
  tone = "navy",
  icon,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: StatTone;
  icon?: ReactNode;
  hint?: string;
  /** When set, the tile becomes a button that jumps to the stat's section. */
  onClick?: () => void;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-serif text-3xl font-bold leading-none ${t.value}`}>{value}</p>
        {icon && (
          <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${t.chip}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--ink-muted)] mt-2">{label}</p>
      {hint && <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">{hint}</p>}
    </>
  );

  if (!onClick) {
    return (
      <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-5">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-5 cursor-pointer transition-colors hover:border-[#c9a84c] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
    >
      {body}
    </button>
  );
}
