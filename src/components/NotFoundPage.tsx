// ============================================================================
// 404 page
// ============================================================================
// Rendered for any path the router does not recognise (and for /404 itself).
// Eager, not lazy: it is the recovery screen for unknown URLs, so it must not
// depend on a chunk that might be the thing failing. usePageMeta marks it
// noindex so bad URLs do not read as soft 404s to search engines.
// ============================================================================

import { usePageMeta } from "@/hooks/usePageMeta";
import type { Page } from "@/types/navigation";

type NotFoundPageProps = {
  onNavigate: (page: Page) => void;
};

export default function NotFoundPage({ onNavigate }: NotFoundPageProps) {
  usePageMeta("not-found");

  return (
    <div className="bg-[var(--surface-sunken)] min-h-screen pt-20 flex items-center justify-center px-6 py-16">
      <div className="text-center max-w-md">
        <p className="font-serif text-7xl font-bold text-[#c9a84c]">404</p>
        <h1 className="font-serif text-2xl font-bold text-[var(--ink-strong)] mt-4">
          Page not found
        </h1>
        <p className="text-[var(--ink-muted)] text-sm mt-3">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <button
          onClick={() => onNavigate("home")}
          className="mt-6 bg-[#c9a84c] hover:bg-[#e2c87a] text-[var(--ink-on-gold)] text-sm font-semibold px-5 py-3 rounded transition-colors"
        >
          Back to home
        </button>
      </div>
    </div>
  );
}
