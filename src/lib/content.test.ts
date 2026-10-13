// ============================================================================
// Content fallback semantics
// ============================================================================
// The mock content is returned ONLY when the request itself fails — an empty
// table is a valid answer and must never be masked (this is what made "Our
// Lawyers" show the wrong count before). The Supabase client is mocked with a
// thenable chain, so nothing touches the network or window.localStorage.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("./supabase", () => ({ supabase: { from: mockFrom } }));

import { getLawyers, getPracticeAreas, getPublishedDecisions } from "./content";
import { fallbackCourtDecisions, fallbackLawyers, fallbackPracticeAreas } from "./fallbackContent";

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => Promise.resolve(result);
  return builder;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("getPracticeAreas", () => {
  it("returns the rows on success", async () => {
    const rows = [{ id: "labor", name: "Labor" }];
    mockFrom.mockReturnValue(query({ data: rows, error: null }));

    const result = await getPracticeAreas();
    expect(result.data).toBe(rows);
    expect(result.error).toBeNull();
  });

  it("returns [] for an empty table — never the mock content", async () => {
    mockFrom.mockReturnValue(query({ data: [], error: null }));

    const result = await getPracticeAreas();
    expect(result.data).toEqual([]);
    expect(result.data).not.toBe(fallbackPracticeAreas);
  });

  it("falls back to the mock content when the request fails", async () => {
    mockFrom.mockReturnValue(query({ data: null, error: { message: "network down" } }));

    const result = await getPracticeAreas();
    expect(result.data).toBe(fallbackPracticeAreas);
    expect(result.error).toBe("network down");
  });
});

describe("getLawyers", () => {
  it("returns [] for an empty view — never the mock content", async () => {
    mockFrom.mockReturnValue(query({ data: [], error: null }));

    const result = await getLawyers();
    expect(result.data).toEqual([]);
    expect(result.data).not.toBe(fallbackLawyers);
  });

  it("falls back to the mock lawyers when the request fails", async () => {
    mockFrom.mockReturnValue(query({ data: null, error: { message: "boom" } }));

    const result = await getLawyers();
    expect(result.data).toBe(fallbackLawyers);
    expect(result.error).toBe("boom");
  });
});

describe("getPublishedDecisions", () => {
  it("returns [] for an empty library — never the mock decisions", async () => {
    mockFrom.mockReturnValue(query({ data: [], error: null }));

    const result = await getPublishedDecisions();
    expect(result.data).toEqual([]);
    expect(result.data).not.toBe(fallbackCourtDecisions);
  });

  it("falls back to the mock decisions when the request fails", async () => {
    mockFrom.mockReturnValue(query({ data: null, error: { message: "boom" } }));

    const result = await getPublishedDecisions();
    expect(result.data).toBe(fallbackCourtDecisions);
    expect(result.error).toBe("boom");
  });
});
