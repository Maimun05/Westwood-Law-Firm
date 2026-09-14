// ============================================================================
// URL <-> Page mapping
// ============================================================================
// The app used to hold the current page in React state only, so the address
// bar never changed: refresh dropped you back on the home page, the browser
// Back button did nothing, and no page could be linked to. These two helpers
// translate between the two so App.tsx can drive the History API.
// ============================================================================

import type { Page } from "@/types/navigation";

const PAGE_PATHS: Record<Page, string> = {
  home: "/",
  about: "/about",
  expertise: "/expertise",
  lawyers: "/lawyers",
  specialists: "/specialists",
  "insights-resources": "/insights-resources",
  contact: "/contact",
  inquiry: "/inquiry",
  consultation: "/consultation",
  portal: "/portal",
  auth: "/auth",
  "forgot-password": "/forgot-password",
  "reset-password": "/reset-password",
};

// Which query parameters each page actually understands. Anything else is
// dropped, so a stale ?lawyer=... does not ride along into the next page.
const PAGE_PARAMS: Partial<Record<Page, string[]>> = {
  expertise: ["area"],
  lawyers: ["lawyer"],
  "insights-resources": ["article"],
  inquiry: ["lawyer", "area"],
  consultation: ["lawyer", "area"],
  auth: ["mode"],
};

export function pageToUrl(page: Page, params?: Record<string, string>): string {
  const base = PAGE_PATHS[page] ?? "/";
  const query = new URLSearchParams();

  for (const key of PAGE_PARAMS[page] ?? []) {
    const value = params?.[key];
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `${base}?${qs}` : base;
}

export function locationToRoute(
  pathname: string,
  search: string,
): { page: Page; params: Record<string, string> } {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = (Object.entries(PAGE_PATHS) as [Page, string][]).find(([, p]) => p === path);

  // An unrecognised path (typo, old bookmark) falls back to the home page
  // rather than rendering nothing.
  const page: Page = match ? match[0] : "home";

  const params: Record<string, string> = {};
  const query = new URLSearchParams(search);
  for (const key of PAGE_PARAMS[page] ?? []) {
    const value = query.get(key);
    if (value) params[key] = value;
  }

  return { page, params };
}

/**
 * The route the browser is currently sitting on.
 *
 * Password-recovery emails land on /reset-password with the token in the hash
 * (`#access_token=...&type=recovery`). Supabase reads that hash asynchronously
 * on startup, so we detect it here but must not rewrite the URL before the
 * SDK has consumed it — App.tsx only pushes a new URL when the user navigates.
 */
export function readRoute(): { page: Page; params: Record<string, string> } {
  if (window.location.hash.includes("type=recovery")) {
    return { page: "reset-password", params: {} };
  }
  return locationToRoute(window.location.pathname, window.location.search);
}
