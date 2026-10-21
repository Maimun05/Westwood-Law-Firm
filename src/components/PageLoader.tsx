// ============================================================================
// Page loader
// ============================================================================
// Shared Suspense fallback for the lazily-loaded routes (portal, auth pages,
// inquiry/consultation flows). Matches the portal's own loading screen
// (ClientPortal.tsx) so the handoff from chunk-load to auth-load is visually
// seamless.
// ============================================================================

export default function PageLoader() {
  return (
    <div className="bg-[var(--surface-sunken)] min-h-screen flex items-center justify-center px-6 py-12">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 border-4 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
        <p className="text-[var(--ink-muted)] text-sm">Loading...</p>
      </div>
    </div>
  );
}
