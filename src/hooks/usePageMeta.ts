// ============================================================================
// usePageMeta — per-route document metadata
// ============================================================================
// Called by every page; detail views (article/lawyer/practice area) pass
// overrides + JSON-LD that revert automatically when the item closes. The
// effect keys on the resolved primitives, so an overrides object literal can
// be passed inline without re-running on every render. The canonical URL is
// read from the live address bar, which the router keeps in step with the
// page (including ?article=/?lawyer=/?area= deep links).
// ============================================================================

import { useEffect } from "react";

import { applyMeta, PAGE_META, type PageMeta } from "@/lib/seo";
import type { Page } from "@/types/navigation";

export function usePageMeta(page: Page, overrides?: Partial<PageMeta>, jsonLd?: object | null) {
  const base = PAGE_META[page];
  const title = overrides?.title ?? base.title;
  const description = overrides?.description ?? base.description;
  const noindex = overrides?.noindex ?? base.noindex;
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    applyMeta(
      { title, description, noindex },
      window.location.pathname + window.location.search,
      jsonLdText,
    );
  }, [title, description, noindex, jsonLdText]);
}
