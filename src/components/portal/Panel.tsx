// ============================================================================
// Panel — the shared card shell for dashboard sections
// ============================================================================
// One place defines the white card chrome (radius, border, padding) and the
// section heading style so every dashboard panel reads the same.

import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[var(--surface-card)] rounded-xl border border-[var(--line)] p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="font-serif text-lg font-bold text-[var(--ink-strong)]">{title}</h3>
        {subtitle && <p className="text-xs text-[var(--ink-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
