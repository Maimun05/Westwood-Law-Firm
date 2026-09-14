// ============================================================================
// Prove the ContentManager payloads match the real database columns
// ============================================================================
//   npx tsx scripts/content-payload-check.ts
//
// Emits SQL that inserts one row per content table using the exact draft ->
// payload path the admin form uses, then updates and deletes it. Run the
// output against a real database and a wrong column name fails loudly.
//
// This exists because a config-only review missed a real bug: the form edited
// seminar_events.speaker_name while the public page renders .speaker, so every
// admin edit would have been invisible on the website.
//
// scripts/local-pg-validate.sh runs this automatically.
// ============================================================================

import {
  CONTENT_CONFIG,
  validateDraft,
  draftToPayload,
  JSONB_LIST_FIELDS,
  type ContentKind,
} from "../src/lib/contentSchema";

const KINDS: ContentKind[] = [
  "articles",
  "faqs",
  "seminar_events",
  "retainer_packages",
  "practice_areas",
];

// One realistic draft per table, with every field filled so no column is
// skipped. Values are deliberately distinctive so a wrong column is obvious.
const DRAFTS: Record<ContentKind, Record<string, unknown>> = {
  articles: {
    id: "payload-check-article",
    title: "Payload Check Article",
    slug: "payload-check-article",
    excerpt: "Excerpt written by the payload check.",
    content: "First paragraph.\n\nSecond paragraph.",
    category: "Corporate and Commercial Laws",
    cover_image: "",
    reading_time: "4 min read",
    is_published: true,
  },
  faqs: {
    question: "Payload check question?",
    answer: "Payload check answer.",
    category: "General",
    display_order: 99,
    is_active: true,
  },
  seminar_events: {
    id: "payload-check-seminar",
    title: "Payload Check Seminar",
    description: "Description written by the payload check.",
    date: "2027-03-04",
    time: "9:00 AM - 12:00 PM",
    location: "Westwood Law Firm",
    mode: "In-Person",
    speaker: "Atty. Payload Check",
    capacity: 40,
    registration_url: "",
    is_published: true,
  },
  retainer_packages: {
    id: "payload-check-retainer",
    name: "Payload Check Retainer",
    tagline: "Tagline written by the payload check.",
    description: "Description written by the payload check.",
    price_display: "Contact for quote",
    features: "Feature one\nFeature two",
    cta_text: "Enquire",
    is_highlighted: false,
    display_order: 99,
    is_active: true,
  },
  practice_areas: {
    id: "payload-check-area",
    name: "Payload Check Area",
    slug: "payload-check-area",
    description: "Description written by the payload check.",
    icon: "gavel",
    color: "text-[#c9a84c]",
    services: "Service one\nService two",
    client_needs: "Need one",
    display_order: 99,
    is_active: true,
  },
};

const quoteText = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;

// Array-valued columns split into text[] and jsonb. PostgREST papers over the
// difference, raw SQL does not.
const quote = (v: unknown, jsonb = false): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (Array.isArray(v)) {
    return jsonb
      ? `${quoteText(JSON.stringify(v))}::jsonb`
      : `ARRAY[${v.map(quoteText).join(", ")}]::text[]`;
  }
  return quoteText(v);
};

let failures = 0;
const out: string[] = [];

for (const kind of KINDS) {
  const cfg = CONTENT_CONFIG[kind];
  const draft = DRAFTS[kind];

  // The form's own validation must accept the draft, or the test is not
  // exercising the real path.
  const problem = validateDraft(kind, draft, true);
  if (problem) {
    failures++;
    console.error(`FAIL  ${kind}: validateDraft rejected a complete draft — ${problem}`);
    continue;
  }

  const payload = draftToPayload(kind, draft);
  const keys = Object.keys(payload);

  // Every configured field must survive into the payload.
  const missing = cfg.fields.filter((f) => !keys.includes(f));
  if (missing.length) {
    failures++;
    console.error(`FAIL  ${kind}: draftToPayload dropped ${missing.join(", ")}`);
  }

  const cols = keys.join(", ");
  const vals = keys.map((k) => quote(payload[k], JSONB_LIST_FIELDS.has(k))).join(", ");

  // faqs is the one table whose id comes from a database default, so it is
  // keyed on its natural key (question) instead.
  const hasId = keys.includes("id");
  const keyClause = hasId
    ? `id = ${quote(payload.id)}`
    : `question = ${quote(payload[cfg.titleField])}`;

  out.push(`-- ${kind}`);
  out.push(`INSERT INTO public.${kind} (${cols}) VALUES (${vals});`);

  // The timestampDateFields rule: a bare date must have been anchored to
  // Manila midnight, or the public page shows a raw ISO string at UTC.
  for (const f of cfg.timestampDateFields ?? []) {
    if (typeof payload[f] === "string" && !String(payload[f]).includes("T")) {
      failures++;
      console.error(
        `FAIL  ${kind}.${f}: bare date was not anchored to a timestamp (${payload[f]})`,
      );
    }
  }

  // Publish toggle: exercises the publishedColumn mapping.
  out.push(`UPDATE public.${kind} SET ${cfg.publishedColumn} = FALSE WHERE ${keyClause};`);
  out.push(`UPDATE public.${kind} SET ${cfg.publishedColumn} = TRUE  WHERE ${keyClause};`);
  out.push(`DELETE FROM public.${kind} WHERE ${keyClause};`);
  out.push("");
}
out.push(`SELECT 'content payload check rows left behind' AS check,`);
out.push(
  `       (SELECT count(*) FROM public.articles           WHERE id          = 'payload-check-article')`,
);
out.push(
  `     + (SELECT count(*) FROM public.faqs               WHERE question    = 'Payload check question?')`,
);
out.push(
  `     + (SELECT count(*) FROM public.seminar_events     WHERE id          = 'payload-check-seminar')`,
);
out.push(
  `     + (SELECT count(*) FROM public.retainer_packages  WHERE id          = 'payload-check-retainer')`,
);
out.push(
  `     + (SELECT count(*) FROM public.practice_areas     WHERE id          = 'payload-check-area')`,
);
out.push(`       AS leftover;`);

if (failures > 0) {
  console.error(`\n${failures} payload problem(s) found.`);
  process.exit(1);
}

console.log(out.join("\n"));
