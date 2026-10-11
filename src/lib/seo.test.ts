// ============================================================================
// SEO metadata invariants
// ============================================================================
// PAGE_META is a Record<Page, ...>, so a new route cannot ship without an
// entry (TypeScript enforces it). These tests pin the decisions TypeScript
// cannot: the portal surface and the 404 stay out of the index, the
// marketing surface stays in, and the canonical host is the one that
// actually serves the site.
// ============================================================================

import { describe, expect, it } from "vitest";

import { PAGE_META, SITE_URL } from "@/lib/seo";
import type { Page } from "@/types/navigation";

const ALL_PAGES: Page[] = [
  "home",
  "about",
  "expertise",
  "lawyers",
  "specialists",
  "insights-resources",
  "contact",
  "inquiry",
  "consultation",
  "portal",
  "auth",
  "forgot-password",
  "reset-password",
  "not-found",
];

const NOINDEX_PAGES: Page[] = ["portal", "auth", "forgot-password", "reset-password", "not-found"];

const INDEXABLE_PAGES: Page[] = [
  "home",
  "about",
  "expertise",
  "lawyers",
  "specialists",
  "insights-resources",
  "contact",
];

describe("PAGE_META", () => {
  it("covers exactly the routes in the Page union", () => {
    expect(Object.keys(PAGE_META).sort()).toEqual([...ALL_PAGES].sort());
  });

  it("gives every route a real title and description", () => {
    for (const page of ALL_PAGES) {
      expect(PAGE_META[page].title.length, page).toBeGreaterThan(0);
      expect(PAGE_META[page].description.length, page).toBeGreaterThan(0);
      expect(PAGE_META[page].title, page).toMatch(/Westwood Law Firm/);
    }
  });

  it("noindexes the portal routes and the 404", () => {
    for (const page of NOINDEX_PAGES) {
      expect(PAGE_META[page].noindex, page).toBe(true);
    }
  });

  it("keeps the marketing pages indexable", () => {
    for (const page of INDEXABLE_PAGES) {
      expect(PAGE_META[page].noindex, page).toBeUndefined();
    }
  });

  it("canonicalises to the host that actually serves the site", () => {
    expect(SITE_URL).toBe("https://westwood-law-firm.vercel.app");
    expect(SITE_URL).not.toMatch(/\/$/);
  });
});
