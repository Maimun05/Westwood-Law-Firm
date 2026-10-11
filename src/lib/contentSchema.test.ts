// ============================================================================
// Content schema
// ============================================================================
// src/lib/contentSchema.ts is deliberately pure (no Supabase import) so the
// form ↔ row mapping can be tested — and checked against a real database —
// without a browser. These tests pin the behaviors the admin forms rely on:
// readable ids, plain-English validation, array/number coercion, and the
// Manila-midnight anchoring of bare dates on TIMESTAMPTZ columns.
// ============================================================================

import { describe, expect, it } from "vitest";

import {
  CONTENT_CONFIG,
  JSONB_LIST_FIELDS,
  deriveId,
  draftToPayload,
  slugify,
  validateDraft,
} from "@/lib/contentSchema";

describe("slugify / deriveId", () => {
  it("slugifies headlines", () => {
    expect(slugify("Labor & Employment Law")).toBe("labor-employment-law");
    expect(slugify("  Spaced  Out  ")).toBe("spaced-out");
    expect(slugify("--Edges--")).toBe("edges");
  });

  it("derives ids from slug, then title, then name", () => {
    expect(deriveId({ slug: "My Slug" })).toBe("my-slug");
    expect(deriveId({ title: "My Title" })).toBe("my-title");
    expect(deriveId({ name: "My Name" })).toBe("my-name");
    expect(deriveId({ name: "My Name", title: "My Title" })).toBe("my-title");
  });

  it("returns an empty id when nothing readable is filled", () => {
    expect(deriveId({})).toBe("");
    expect(deriveId({ name: "   " })).toBe("");
  });
});

describe("validateDraft", () => {
  it("demands a derivable id on create", () => {
    expect(validateDraft("articles", { title: "T" }, true)).toBe(
      "The id is generated from the name, title or slug — fill one of those in.",
    );
  });

  it("skips the id check on edit — the row being updated already has one", () => {
    const draft = { title: "T", slug: "s", excerpt: "e", content: "c", category: "x" };
    expect(validateDraft("articles", draft, false)).toBeNull();
  });

  it("reports the first missing field in plain words", () => {
    expect(validateDraft("faqs", { question: "Q" }, false)).toBe("Answer is required.");
  });

  it("accepts a complete draft", () => {
    const draft = { id: "a9", title: "T", slug: "s", excerpt: "e", content: "c", category: "x" };
    expect(validateDraft("articles", draft, true)).toBeNull();
  });
});

describe("draftToPayload", () => {
  it("splits list fields into trimmed arrays, dropping blanks", () => {
    const payload = draftToPayload("retainer_packages", { features: "A\n\n B \nC" });
    expect(payload.features).toEqual(["A", "B", "C"]);
  });

  it("coerces number fields and nulls blanks", () => {
    expect(draftToPayload("faqs", { display_order: "3" }).display_order).toBe(3);
    expect(draftToPayload("faqs", { display_order: "" }).display_order).toBeNull();
  });

  it("turns blank optional text into NULL", () => {
    expect(draftToPayload("faqs", { question: "Q", answer: "  " }).answer).toBeNull();
  });

  it("anchors bare seminar dates to Manila midnight", () => {
    expect(draftToPayload("seminar_events", { date: "2026-11-05" }).date).toBe(
      "2026-11-05T00:00:00+08:00",
    );
  });

  it("leaves dates that already carry a time alone", () => {
    expect(draftToPayload("seminar_events", { date: "2026-11-05T09:00:00+08:00" }).date).toBe(
      "2026-11-05T09:00:00+08:00",
    );
  });
});

describe("schema knowledge", () => {
  it("flags only features as jsonb — services/client_needs are text[]", () => {
    expect([...JSONB_LIST_FIELDS]).toEqual(["features"]);
  });

  it("orders seminars newest first and keeps each table's published column explicit", () => {
    expect(CONTENT_CONFIG.seminar_events.orderBy).toBe("date");
    expect(CONTENT_CONFIG.seminar_events.descending).toBe(true);
    expect(CONTENT_CONFIG.articles.publishedColumn).toBe("is_published");
    expect(CONTENT_CONFIG.faqs.publishedColumn).toBe("is_active");
  });
});
