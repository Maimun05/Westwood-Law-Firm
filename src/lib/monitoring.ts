// ============================================================================
// Error reporting
// ============================================================================
// The single sink the app reports unexpected errors to. Sentry is loaded on
// demand and only when VITE_SENTRY_DSN is configured, so builds without the
// secret (local, CI) stay a clean no-op and the SDK never lands in the main
// bundle — it is a separate chunk fetched only when a DSN exists.
//
// captureException() is safe to call before the module has finished loading:
// it simply no-ops until then. Sentry's default browser integrations cover
// uncaught errors and unhandled promise rejections once init() has run; the
// ErrorBoundary reports caught render errors through captureException().
// ============================================================================

type SentryModule = typeof import("@sentry/react");

let sentry: SentryModule | null = null;

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initMonitoring(): void {
  if (!dsn || sentry) return;

  void import("@sentry/react").then((mod) => {
    sentry = mod;

    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      // No performance tracing for now — errors only.
      tracesSampleRate: 0,
    });
  });
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.error("[monitoring]", error, extra ?? "");
  }

  sentry?.captureException(error, { extra });
}
