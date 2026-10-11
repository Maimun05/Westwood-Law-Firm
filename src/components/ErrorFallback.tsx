// ============================================================================
// Error fallback
// ============================================================================
// Branded stand-in rendered by ErrorBoundary when a page crashes. "Reload" is
// the primary recovery (it also fixes stale-chunk failures after a redeploy);
// "Go home" is offered by the in-page boundary, which sits inside App and can
// navigate. The error detail block is dev-only so production never leaks
// internals into the UI.
// ============================================================================

import { BrandMark } from "@/components/BrandLogo";

type ErrorFallbackProps = {
  error: Error;
  onGoHome?: () => void;
};

export default function ErrorFallback({ error, onGoHome }: ErrorFallbackProps) {
  return (
    <div className="bg-[#f7f5f0] min-h-screen flex items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-[#e8e4dc] shadow-sm p-8 text-center">
        <div className="flex justify-center mb-5">
          <BrandMark className="h-12 w-12" />
        </div>

        <h1 className="font-serif text-2xl font-bold text-[#0d1f3c]">Something went wrong</h1>

        <p className="text-[#8a9ab5] text-sm mt-3">
          An unexpected error interrupted this page. Reloading usually fixes it.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => window.location.reload()}
            className="bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c] text-sm font-semibold px-5 py-3 rounded transition-colors"
          >
            Reload
          </button>

          {onGoHome && (
            <button
              onClick={onGoHome}
              className="bg-[#0d1f3c] hover:bg-[#1a2f52] text-white text-sm font-semibold px-5 py-3 rounded transition-colors"
            >
              Go to home page
            </button>
          )}
        </div>

        {import.meta.env.DEV && (
          <pre className="mt-6 text-left text-xs leading-relaxed text-red-700 bg-red-50 border border-red-100 rounded-lg p-4 overflow-auto max-h-48 whitespace-pre-wrap">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        )}
      </div>
    </div>
  );
}
