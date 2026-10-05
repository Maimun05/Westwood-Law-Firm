// ============================================================================
// Content schema — shape of the five public-site content tables
// ============================================================================
// What each table's columns are, which are required, which one controls
// publication, and how a form draft maps onto a row.
//
// The five tables do NOT share a shape. They disagree on the primary key
// (articles/faqs/seminars/retainers/practice areas all use TEXT ids, but only
// faqs has a database default for it), on the published flag (is_published vs
// is_active), on the ordering column, and on whether a date column is a plain
// DATE or a TIMESTAMPTZ. That knowledge lives here so neither the UI nor the
// database layer has to special-case it.
//
// No Supabase import on purpose: this module is pure, so the payload shape can
// be checked against a real database by scripts/content-payload-check.ts
// without a browser or a network.
// ============================================================================

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];

export type ContentKind =
  | "articles"
  | "faqs"
  | "seminar_events"
  | "retainer_packages"
  | "practice_areas";

export type ContentRow<K extends ContentKind> = Tables[K]["Row"];
export type ContentInsert<K extends ContentKind> = Tables[K]["Insert"];
export type ContentUpdate<K extends ContentKind> = Tables[K]["Update"];

type Config = {
  label: string;
  /** Column holding the row's headline, used in lists and delete prompts. */
  titleField: string;
  /** Column that controls whether the public site shows the row. */
  publishedColumn: "is_published" | "is_active";
  /** Column to sort by, and whether it should be descending. */
  orderBy: string;
  descending?: boolean;
  /**
   * NOT NULL columns, checked before sending so the admin gets a plain-English
   * message instead of "null value in column ... violates not-null constraint".
   *
   * Four of these tables use a TEXT id with no database default, so `id` is in
   * their list and the admin has to type it. Only faqs has a default (added by
   * the seed), so `id` is absent there.
   */
  requiredFields: string[];
  /** Columns the admin can edit, in the order the form should show them. */
  fields: string[];
  /**
   * Columns that are TIMESTAMPTZ in the database but edited as a plain date.
   * A bare 'YYYY-MM-DD' written to a timestamptz lands at midnight UTC and
   * renders as a raw ISO string, so these are expanded on the way out.
   */
  timestampDateFields?: string[];
};

export const CONTENT_CONFIG: Record<ContentKind, Config> = {
  articles: {
    label: "Articles",
    titleField: "title",
    publishedColumn: "is_published",
    orderBy: "published_at",
    descending: true,
    requiredFields: ["id", "title", "slug", "excerpt", "content", "category"],
    fields: [
      "id",
      "title",
      "slug",
      "excerpt",
      "content",
      "category",
      "cover_image",
      "reading_time",
      "is_published",
    ],
  },
  faqs: {
    label: "FAQs",
    titleField: "question",
    publishedColumn: "is_active",
    orderBy: "display_order",
    requiredFields: ["question", "answer"],
    fields: ["question", "answer", "category", "display_order", "is_active"],
  },
  seminar_events: {
    label: "Seminars",
    titleField: "title",
    publishedColumn: "is_published",
    orderBy: "date",
    descending: true,
    requiredFields: ["id", "title", "description", "location"],
    // date / time / speaker are the columns the public page renders. The table
    // also carries event_date / event_time / speaker_name from the original
    // schema; nothing reads those, so the form does not offer them.
    fields: [
      "id",
      "title",
      "description",
      "date",
      "time",
      "location",
      "mode",
      "speaker",
      "capacity",
      "registration_url",
      "is_published",
    ],
    timestampDateFields: ["date"],
  },
  retainer_packages: {
    label: "Retainer Packages",
    titleField: "name",
    publishedColumn: "is_active",
    orderBy: "display_order",
    requiredFields: ["id", "name"],
    fields: [
      "id",
      "name",
      "tagline",
      "description",
      "price_display",
      "features",
      "cta_text",
      "is_highlighted",
      "display_order",
      "is_active",
    ],
  },
  practice_areas: {
    label: "Practice Areas",
    titleField: "name",
    publishedColumn: "is_active",
    orderBy: "display_order",
    requiredFields: ["id", "name", "slug", "description", "icon", "color"],
    fields: [
      "id",
      "name",
      "slug",
      "description",
      "icon",
      "color",
      "services",
      "client_needs",
      "display_order",
      "is_active",
    ],
  },
};

/** The firm is in Manila; a date with no time means midnight there, not UTC. */
const FIRM_UTC_OFFSET = "+08:00";

/**
 * Columns edited as one-item-per-line text but stored as an array.
 * retainer_packages.features is JSONB while the rest are text[] — they look
 * identical in TypeScript (both read back as string[]) but are not
 * interchangeable in SQL, which is why this distinction is recorded.
 */
const LIST_FIELDS = new Set(["features", "services", "client_needs"]);
export const JSONB_LIST_FIELDS = new Set(["features"]);
const NUMBER_FIELDS = new Set(["display_order", "capacity"]);

/**
 * Columns that can stand in for a readable id, most specific first.
 * `slug` is the intended URL key; `title`/`name` are the human headline.
 */
const ID_SOURCE_FIELDS = ["slug", "title", "name"];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derive a readable id for a new row from its slug/title/name, so the admin
 * does not have to invent a text primary key (these tables have no database
 * default for it). Returns "" when none of those columns is filled.
 */
export function deriveId(draft: Record<string, unknown>): string {
  for (const f of ID_SOURCE_FIELDS) {
    const v = draft[f];
    if (typeof v === "string" && v.trim()) return slugify(v);
  }
  return "";
}

/**
 * Check a form draft against the table's NOT NULL columns.
 * Returns a human-readable message, or null when the draft is sendable.
 *
 * `id` is only demanded when creating: on an edit the id is the row we are
 * already updating and the form locks it.
 */
export function validateDraft(
  kind: ContentKind,
  draft: Record<string, unknown>,
  isNew: boolean,
): string | null {
  const cfg = CONTENT_CONFIG[kind];
  const fields = isNew ? cfg.requiredFields : cfg.requiredFields.filter((f) => f !== "id");

  for (const f of fields) {
    const v = draft[f];
    if (v === null || v === undefined || String(v).trim() === "") {
      const label = f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return f === "id"
        ? "The id is generated from the name, title or slug — fill one of those in."
        : `${label} is required.`;
    }
  }
  return null;
}

/**
 * Turn a form draft into a row payload: list fields become arrays, numbers
 * become numbers, blank optional text becomes NULL, and bare dates on
 * TIMESTAMPTZ columns are anchored to Manila midnight.
 */
export function draftToPayload(
  kind: ContentKind,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const cfg = CONTENT_CONFIG[kind];
  const timestampDates = new Set(cfg.timestampDateFields ?? []);
  const payload: Record<string, unknown> = {};

  for (const f of cfg.fields) {
    const v = draft[f];

    if (LIST_FIELDS.has(f)) {
      payload[f] = String(v ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }

    if (NUMBER_FIELDS.has(f)) {
      payload[f] = v === "" || v === null || v === undefined ? null : Number(v);
      continue;
    }

    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed === "") {
        payload[f] = null;
      } else if (timestampDates.has(f) && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        payload[f] = `${trimmed}T00:00:00${FIRM_UTC_OFFSET}`;
      } else {
        payload[f] = trimmed;
      }
      continue;
    }

    payload[f] = v;
  }

  return payload;
}
