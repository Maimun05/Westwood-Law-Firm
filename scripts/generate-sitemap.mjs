// ============================================================================
// Sitemap generator (postbuild)
// ============================================================================
// Writes dist/sitemap.xml: the seven marketing routes plus one URL per
// published article, active practice area, and public lawyer — the
// query-param deep links the router understands. Content is DB-backed and
// changes without a deploy, so the sitemap is generated on every build rather
// than committed. Any missing env var or fetch failure degrades to the static
// routes: a database outage must never fail the build.
//
// Runs via the "postbuild" npm script after `vite build`. CI passes
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY into the build, which is what
// makes the live queries work there; a plain local build without env vars
// produces the static-only sitemap.
// ============================================================================

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE_URL = "https://westwood-law-firm.vercel.app";

const STATIC_PATHS = [
  "/",
  "/about",
  "/expertise",
  "/lawyers",
  "/specialists",
  "/insights-resources",
  "/contact",
];

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function fetchIds(table, filter) {
  const query = `select=id${filter ? `&${filter}` : ""}`;
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);

  const rows = await res.json();
  return rows.map((row) => row.id).filter(Boolean);
}

function urlEntry(path) {
  return `  <url>\n    <loc>${SITE_URL}${path}</loc>\n  </url>`;
}

async function main() {
  const paths = [...STATIC_PATHS];

  if (supabaseUrl && anonKey) {
    try {
      const [articles, areas, lawyers] = await Promise.all([
        fetchIds("articles", "is_published=eq.true"),
        fetchIds("practice_areas", "is_active=eq.true"),
        fetchIds("public_lawyers"),
      ]);

      paths.push(
        ...articles.map((id) => `/insights-resources?article=${encodeURIComponent(id)}`),
        ...areas.map((id) => `/expertise?area=${encodeURIComponent(id)}`),
        ...lawyers.map((id) => `/lawyers?lawyer=${encodeURIComponent(id)}`),
      );
    } catch (error) {
      console.warn(`[sitemap] live queries failed (${error.message}); static routes only`);
    }
  } else {
    console.warn("[sitemap] Supabase env vars missing; static routes only");
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map(urlEntry),
    "</urlset>",
    "",
  ].join("\n");

  const dist = join(process.cwd(), "dist");

  if (!existsSync(dist)) {
    console.warn("[sitemap] dist/ not found — run after a build; skipping");
    return;
  }

  writeFileSync(join(dist, "sitemap.xml"), xml);
  console.log(`[sitemap] wrote ${paths.length} URLs to dist/sitemap.xml`);
}

main().catch((error) => {
  // Never fail the build over the sitemap.
  console.warn(`[sitemap] unexpected error: ${error.message}`);
});
