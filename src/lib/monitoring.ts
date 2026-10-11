// ============================================================================
// Error reporting
// ============================================================================
// The single sink the app reports unexpected errors to. For now it only logs
// in development; the remote reporter (Sentry) is wired in later behind
// VITE_SENTRY_DSN so a build without the secret stays a clean no-op.
//
// Keep this module free of heavy imports: ErrorBoundary imports it on the
// render path, so anything added here lands in the main bundle.
// ============================================================================

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.error("[monitoring]", error, extra ?? "");
  }
}
