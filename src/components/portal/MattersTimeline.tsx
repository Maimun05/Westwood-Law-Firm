import { useMemo, useState } from "react";
import type { Database } from "@/lib/database.types";

// ============================================================================
// Matters opened per month — the Reports chart
// ============================================================================
// Replaces the static "Matters by Practice Area" bar list, which had no date
// axis at all ("make it per date and connect it"). This is a hand-built SVG
// line/area chart: no chart library ships with this app, and adding one for a
// single chart is not worth the bundle.
//
// Data comes straight from the matters the admin already loaded; the practice
// area filter narrows it in place.

type Matter = Database["public"]["Tables"]["matters"]["Row"];

type Props = {
  matters: Matter[];
  practiceAreas: { id: string; name: string }[];
};

const W = 760;
const H = 260;
const PAD = { l: 42, r: 16, t: 20, b: 38 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

// Round the y-axis ceiling up so gridlines land on whole numbers.
function niceCeil(max: number) {
  if (max <= 4) return 4;
  if (max <= 8) return 8;
  if (max <= 12) return 12;
  if (max <= 20) return 20;
  return Math.ceil(max / 10) * 10;
}

export default function MattersTimeline({ matters, practiceAreas }: Props) {
  const [area, setArea] = useState<string>("all");
  const [hover, setHover] = useState<number | null>(null);

  // Last 12 calendar months, oldest first, so "per date" always means the
  // trailing year ending today.
  const months = useMemo(() => {
    const out: { key: string; label: string; year: number; jan: boolean }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-PH", { month: "short" }),
        year: d.getFullYear(),
        jan: d.getMonth() === 0,
      });
    }
    return out;
  }, []);

  const filtered = area === "all" ? matters : matters.filter((m) => m.practice_area === area);

  const counts = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const m of filtered) {
      const key = (m.date_opened ?? "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(key)) byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return months.map((mo) => ({ ...mo, count: byMonth.get(mo.key) ?? 0 }));
  }, [filtered, months]);

  const totalsByArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matters) {
      const name =
        practiceAreas.find((p) => p.id === m.practice_area)?.name ??
        m.practice_area ??
        "Unspecified";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [matters, practiceAreas]);

  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const yMax = niceCeil(Math.max(1, ...counts.map((c) => c.count)));
  const step = yMax <= 4 ? 1 : yMax <= 8 ? 2 : yMax <= 12 ? 3 : 5;

  const x = (i: number) => PAD.l + (PLOT_W * i) / (counts.length - 1);
  const y = (v: number) => PAD.t + PLOT_H * (1 - v / yMax);
  const yBottom = PAD.t + PLOT_H;

  const line = counts
    .map((c, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(c.count).toFixed(1)}`)
    .join(" ");
  const areaPath = `${line} L ${x(counts.length - 1).toFixed(1)} ${yBottom} L ${x(0).toFixed(1)} ${yBottom} Z`;

  const gridValues: number[] = [];
  for (let v = 0; v <= yMax; v += step) gridValues.push(v);

  return (
    <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="font-serif text-lg font-bold text-[#0d1f3c]">Matters Opened per Month</h3>
        <select
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
            setHover(null);
          }}
          className="bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-xs text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]"
        >
          <option value="all">All practice areas</option>
          {practiceAreas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-[#8a9ab5] mb-4">
        {total} matter{total === 1 ? "" : "s"} opened in the last 12 months
        {area !== "all" ? ` · ${practiceAreas.find((p) => p.id === area)?.name ?? area}` : ""}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Line chart of matters opened per month over the last 12 months, ${total} total`}
      >
        <defs>
          <linearGradient id="mattersArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#c9a84c" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Gridlines + y labels */}
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="#e8e4dc"
              strokeWidth={1}
              strokeDasharray={v === 0 ? "0" : "3 4"}
            />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#8a9ab5">
              {v}
            </text>
          </g>
        ))}

        {/* Area + connected line */}
        <path d={areaPath} fill="url(#mattersArea)" />
        <path
          d={line}
          fill="none"
          stroke="#c9a84c"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover guide */}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.t}
            y2={yBottom}
            stroke="#c9a84c"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}

        {/* Points */}
        {counts.map((c, i) => (
          <circle
            key={c.key}
            cx={x(i)}
            cy={y(c.count)}
            r={hover === i ? 5.5 : 3.5}
            fill={hover === i ? "#c9a84c" : "#0d1f3c"}
            stroke="#c9a84c"
            strokeWidth={2}
          />
        ))}

        {/* Month labels; the year is shown when it changes */}
        {counts.map((c, i) => (
          <g key={c.key}>
            <text
              x={x(i)}
              y={H - 18}
              textAnchor="middle"
              fontSize={11}
              fill={hover === i ? "#0d1f3c" : "#8a9ab5"}
            >
              {c.label}
            </text>
            {(i === 0 || c.jan) && (
              <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#b9c2d0">
                {c.year}
              </text>
            )}
          </g>
        ))}

        {/* Tooltip */}
        {hover !== null &&
          (() => {
            const c = counts[hover];
            const tx = Math.min(Math.max(x(hover), PAD.l + 52), W - PAD.r - 52);
            const ty = Math.max(y(c.count) - 44, 4);
            return (
              <g pointerEvents="none">
                <rect
                  x={tx - 52}
                  y={ty}
                  width={104}
                  height={30}
                  rx={6}
                  fill="#0d1f3c"
                  opacity={0.94}
                />
                <text
                  x={tx}
                  y={ty + 13}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="#c9a84c"
                  fontWeight={600}
                >
                  {c.label} {c.year}
                </text>
                <text x={tx} y={ty + 24.5} textAnchor="middle" fontSize={10.5} fill="#ffffff">
                  {c.count} matter{c.count === 1 ? "" : "s"} opened
                </text>
              </g>
            );
          })()}

        {/* Hit areas: one transparent column per month */}
        {counts.map((c, i) => {
          const colW = PLOT_W / (counts.length - 1);
          return (
            <rect
              key={`hit-${c.key}`}
              x={x(i) - colW / 2}
              y={PAD.t}
              width={colW}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
          );
        })}
      </svg>

      {total === 0 && (
        <p className="text-sm text-[#8a9ab5] text-center -mt-24 mb-16 pointer-events-none relative">
          No matters opened in this period.
        </p>
      )}

      {/* All-time totals, so the area reading the old bar list provided is not lost */}
      {totalsByArea.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[#e8e4dc] flex flex-wrap gap-x-5 gap-y-2">
          {totalsByArea.map(([name, n]) => (
            <span key={name} className="text-xs text-[#2c3347] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#c9a84c] inline-block" />
              {name} <span className="font-semibold">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
