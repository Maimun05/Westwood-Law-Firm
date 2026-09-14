// ============================================================================
// Image helpers
// ============================================================================

export const PORTRAIT_PLACEHOLDER = "/lawyers/placeholder.svg";

/**
 * Swaps a broken portrait for the neutral placeholder.
 *
 * Several lawyer photos are hotlinked from images.unsplash.com. When one of
 * those URLs dies the <img> used to fall back to a *different lawyer's* photo,
 * so the directory silently showed the wrong person. This shows an obvious
 * "photo pending" card instead, and will not loop if the placeholder itself
 * fails to load.
 */
export function onPortraitError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied === "1") return;
  img.dataset.fallbackApplied = "1";
  img.src = PORTRAIT_PLACEHOLDER;
}
