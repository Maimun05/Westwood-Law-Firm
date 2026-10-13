// ============================================================================
// SEO metadata
// ============================================================================
// Per-route title/description/robots and the JSON-LD builders, applied
// client-side by usePageMeta. SITE_URL is the host that actually serves the
// site — westwoodlaw.ph is parked at ParkLogic and cannot serve it. If a
// custom domain ever lands, update it here and in index.html (og:url,
// og:image, the LegalService JSON-LD), plus public/robots.txt.
// ============================================================================

import type { Article, CaseDecision, Lawyer, PracticeArea } from "@/lib/content";
import { FIRM_NAME } from "@/lib/firm";
import type { Page } from "@/types/navigation";

export const SITE_URL = "https://westwood-law-firm.vercel.app";

export type PageMeta = {
  title: string;
  description: string;
  noindex?: boolean;
};

export const PAGE_META: Record<Page, PageMeta> = {
  home: {
    title: "Westwood Law Firm — Legal Counsel in San Juan City",
    description:
      "Westwood Law Firm provides corporate, labor, civil, and family law services in San Juan City, Metro Manila, Philippines.",
  },
  about: {
    title: "About — Westwood Law Firm",
    description:
      "Established in August 1998 in Greenhills, San Juan City, Westwood Law Firm works with a nationwide network of lawyers across twelve fields of law.",
  },
  expertise: {
    title: "Practice Areas — Westwood Law Firm",
    description:
      "Twelve fields of legal practice — corporate, labor, civil, family, taxation, immigration and more — each handled by lawyers specialised in that field.",
  },
  lawyers: {
    title: "Our Lawyers — Westwood Law Firm",
    description:
      'Meet the lawyers of Westwood Law Firm, led by Managing Partner Atty. Ernesto "Boyet" Tabao — specialists across twelve fields of Philippine law.',
  },
  specialists: {
    title: "Partner Network — Westwood Law Firm",
    description:
      "The Westwood partner network — allied specialists and firms the firm works with on matters across the Philippines.",
  },
  "insights-resources": {
    title: "Insights & Resources — Westwood Law Firm",
    description:
      "Legal insights, guides and seminars from Westwood Law Firm — practical reading on Philippine business, labor and civil law.",
  },
  "law-library": {
    title: "Law Library — Westwood Law Firm",
    description:
      "A reference library of Philippine Supreme Court decisions, summarised by Westwood Law Firm for quick reading across practice areas.",
  },
  contact: {
    title: "Contact — Westwood Law Firm",
    description:
      "Contact Westwood Law Firm — Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, San Juan City, Metro Manila. Call +63 2 8722 9244.",
  },
  inquiry: {
    title: "Legal Inquiry — Westwood Law Firm",
    description: "File a legal inquiry with Westwood Law Firm — for registered clients.",
  },
  consultation: {
    title: "Consultation — Westwood Law Firm",
    description: "Book a consultation with Westwood Law Firm — for registered clients.",
  },
  portal: {
    title: "Client Portal — Westwood Law Firm",
    description: "Sign in to your Westwood Law Firm account.",
    noindex: true,
  },
  auth: {
    title: "Sign In — Westwood Law Firm",
    description: "Sign in or create your Westwood Law Firm account.",
    noindex: true,
  },
  "forgot-password": {
    title: "Reset Password — Westwood Law Firm",
    description: "Reset the password for your Westwood Law Firm account.",
    noindex: true,
  },
  "reset-password": {
    title: "Reset Password — Westwood Law Firm",
    description: "Choose a new password for your Westwood Law Firm account.",
    noindex: true,
  },
  "not-found": {
    title: "Page Not Found — Westwood Law Firm",
    description: "The page you were looking for could not be found.",
    noindex: true,
  },
};

// Meta descriptions should stay under ~160 characters; item-level overrides
// (a lawyer's bio, an article excerpt) can run longer than that.
const MAX_DESCRIPTION = 160;

function clampDescription(text: string): string {
  if (text.length <= MAX_DESCRIPTION) return text;

  const cut = text.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${cut.slice(0, lastSpace > 0 ? lastSpace : cut.length)}…`;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);

  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }

  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }

  el.setAttribute("href", href);
}

/**
 * Apply one page's metadata to <head>. jsonLd is pre-serialized (pass null to
 * remove the per-page block). Pages should go through usePageMeta; this is
 * exported separately so it can be tested without a renderer.
 */
export function applyMeta(meta: PageMeta, canonicalPath: string, jsonLd: string | null): void {
  const url = `${SITE_URL}${canonicalPath}`;
  const description = clampDescription(meta.description);

  document.title = meta.title;
  upsertMeta("name", "description", description);
  upsertMeta("property", "og:title", meta.title);
  upsertMeta("property", "og:description", description);
  upsertMeta("property", "og:url", url);
  upsertMeta("name", "twitter:title", meta.title);
  upsertMeta("name", "twitter:description", description);
  upsertMeta("name", "robots", meta.noindex ? "noindex, nofollow" : "index, follow");
  upsertLink("canonical", url);

  const existing = document.getElementById("page-jsonld");

  if (jsonLd) {
    const script = (existing as HTMLScriptElement | null) ?? document.createElement("script");

    script.id = "page-jsonld";
    script.setAttribute("type", "application/ld+json");
    script.textContent = jsonLd;

    if (!existing) document.head.appendChild(script);
  } else {
    existing?.remove();
  }
}

export function articleJsonLd(article: Article, authorName?: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    ...(article.published_at ? { datePublished: article.published_at } : {}),
    ...(authorName ? { author: { "@type": "Person", name: authorName } } : {}),
    publisher: { "@type": "Organization", name: FIRM_NAME },
    mainEntityOfPage: `${SITE_URL}/insights-resources?article=${article.id}`,
  };
}

export function courtDecisionJsonLd(decision: CaseDecision): object {
  // schema.org has no "court decision" type, so this is modelled as a
  // CreativeWork: the Supreme Court is the publisher, the ponente the creator,
  // and the library the collection it belongs to. The firm is deliberately not
  // named as the author of a decision it did not write.
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: decision.title,
    description: decision.summary,
    ...(decision.decision_date ? { datePublished: decision.decision_date } : {}),
    ...(decision.ponente ? { creator: { "@type": "Person", name: decision.ponente } } : {}),
    ...(decision.gr_no ? { identifier: decision.gr_no } : {}),
    publisher: { "@type": "Organization", name: "Supreme Court of the Philippines" },
    isPartOf: {
      "@type": "CollectionPage",
      name: "Law Library",
      url: `${SITE_URL}/law-library`,
    },
    mainEntityOfPage: `${SITE_URL}/law-library?decision=${decision.id}`,
  };
}

export function lawyerJsonLd(lawyer: Lawyer): object {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: lawyer.full_name,
    ...(lawyer.position ? { jobTitle: lawyer.position } : {}),
    ...(lawyer.bio ? { description: lawyer.bio } : {}),
    worksFor: { "@type": "Organization", name: FIRM_NAME },
    url: `${SITE_URL}/lawyers?lawyer=${lawyer.id}`,
  };
}

export function practiceAreaJsonLd(area: PracticeArea): object {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: area.name,
    description: area.description,
    provider: { "@type": "LegalService", name: FIRM_NAME },
    areaServed: "PH",
    url: `${SITE_URL}/expertise?area=${area.id}`,
  };
}
