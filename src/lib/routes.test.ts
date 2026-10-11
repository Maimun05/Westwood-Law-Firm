// ============================================================================
// Router round-trips
// ============================================================================
// The hand-rolled router (src/lib/routes.ts) is the only thing standing
// between the address bar and the app: every page must map to a URL and back,
// unknown params must be dropped, unknown paths must land on the 404 page
// (not silently on home), and the Supabase recovery hash must win over the
// pathname before the SDK clears it.
// ============================================================================

import { afterEach, describe, expect, it, vi } from "vitest";

import { locationToRoute, pageToUrl, readRoute } from "@/lib/routes";
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

describe("pageToUrl / locationToRoute", () => {
  it("round-trips every page", () => {
    for (const page of ALL_PAGES) {
      const url = pageToUrl(page);
      const [pathname, search = ""] = url.split("?");

      expect(locationToRoute(pathname, search ? `?${search}` : "").page).toBe(page);
    }
  });

  it("carries whitelisted params both ways", () => {
    expect(pageToUrl("lawyers", { lawyer: "l1" })).toBe("/lawyers?lawyer=l1");
    expect(locationToRoute("/lawyers", "?lawyer=l1")).toEqual({
      page: "lawyers",
      params: { lawyer: "l1" },
    });
    expect(pageToUrl("consultation", { lawyer: "l1", area: "labor" })).toBe(
      "/consultation?lawyer=l1&area=labor",
    );
  });

  it("drops params the page does not understand", () => {
    expect(pageToUrl("lawyers", { lawyer: "l1", area: "labor" })).toBe("/lawyers?lawyer=l1");
    expect(locationToRoute("/lawyers", "?lawyer=l1&area=labor").params).toEqual({ lawyer: "l1" });
  });

  it("ignores empty param values", () => {
    expect(pageToUrl("lawyers", { lawyer: "" })).toBe("/lawyers");
    expect(locationToRoute("/lawyers", "?lawyer=").params).toEqual({});
  });

  it("strips trailing slashes", () => {
    expect(locationToRoute("/about/", "").page).toBe("about");
    expect(locationToRoute("/lawyers//", "").page).toBe("lawyers");
  });

  it("lands unknown paths on the 404 page, not home", () => {
    expect(locationToRoute("/nope", "").page).toBe("not-found");
    expect(locationToRoute("/lawyers/extra", "").page).toBe("not-found");
    expect(locationToRoute("/404", "").page).toBe("not-found");
  });
});

describe("readRoute", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes the Supabase recovery hash to reset-password before the SDK clears it", () => {
    vi.stubGlobal("window", {
      location: { hash: "#access_token=x&type=recovery", pathname: "/", search: "" },
    });

    expect(readRoute()).toEqual({ page: "reset-password", params: {} });
  });

  it("reads the pathname otherwise", () => {
    vi.stubGlobal("window", {
      location: { hash: "", pathname: "/insights-resources", search: "?article=a1" },
    });

    expect(readRoute()).toEqual({ page: "insights-resources", params: { article: "a1" } });
  });
});
