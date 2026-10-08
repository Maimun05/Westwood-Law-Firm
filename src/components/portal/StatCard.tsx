// ============================================================================
// StatCard — a single KPI tile for the portal dashboards
// ============================================================================
// Mirrors the reference dashboard's metric tiles: a white card with the value in
// the serif display face, a small tone-tinted icon chip, and a caption. The tone
// classes are written out statically so Tailwind's scanner keeps them.

import type { ReactNode } from "react";

export type StatTone = "navy" | "green" | "blue" | "amber" | "red" | "gold" | "purple";

const TONES: Record<StatTone, { value: string; chip: string }> = {
  navy: { value: "text-[#0d1f3c]", chip: "bg-[#0d1f3c]/5 text-[#0d1f3c]" },
  green: { value: "text-green-600", chip: "bg-green-50 text-green-600" },
  blue: { value: "text-blue-600", chip: "bg-blue-50 text-blue-600" },
  amber: { value: "text-amber-600", chip: "bg-amber-50 text-amber-600" },
  red: { value: "text-red-600", chip: "bg-red-50 text-red-600" },
  gold: { value: "text-[#a8863a]", chip: "bg-[#c9a84c]/10 text-[#a8863a]" },
  purple: { value: "text-purple-600", chip: "bg-purple-50 text-purple-600" },
};

export default function StatCard({
  label,
  value,
  tone = "navy",
  icon,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: StatTone;
  icon?: ReactNode;
  hint?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
      <div className="flex items-start justify-between gap-2">
        <p className={`font-serif text-3xl font-bold leading-none ${t.value}`}>{value}</p>
        {icon && (
          <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${t.chip}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="text-xs text-[#8a9ab5] mt-2">{label}</p>
      {hint && <p className="text-[11px] text-[#8a9ab5] mt-0.5">{hint}</p>}
    </div>
  );
}
