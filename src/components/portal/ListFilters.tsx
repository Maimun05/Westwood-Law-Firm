// Shared search + filter bar for the portal's long lists (matters, documents,
// users, inquiries). Filtering is client-side over rows the database has
// already decided the user may see — these are not a security boundary, they
// only stop the operator from scrolling.

export type FilterDef = {
  key: string;
  label: string;
  /** "All" is prepended automatically and means "no constraint". */
  options: string[];
};

export const ALL = "All";

export function applyFilters<T>(
  rows: T[],
  query: string,
  text: (row: T) => (string | null | undefined)[],
  filters: Record<string, string>,
  valueFor: (row: T, key: string) => string | null | undefined,
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const haystack = text(row).filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    for (const [key, wanted] of Object.entries(filters)) {
      if (!wanted || wanted === ALL) continue;
      if ((valueFor(row, key) ?? "") !== wanted) return false;
    }
    return true;
  });
}

export default function ListFilters({
  search,
  onSearch,
  placeholder,
  filters = [],
  values,
  onFilter,
  shown,
  total,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  filters?: FilterDef[];
  values: Record<string, string>;
  onFilter: (key: string, value: string) => void;
  shown: number;
  total: number;
  children?: React.ReactNode;
}) {
  const inputCls =
    "bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c]";
  const filtering = search.trim() !== "" || Object.values(values).some((v) => v && v !== ALL);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${inputCls} w-56`}
      />

      {filters.map((f) => (
        <select
          key={f.key}
          value={values[f.key] ?? ALL}
          onChange={(e) => onFilter(f.key, e.target.value)}
          aria-label={f.label}
          className={inputCls}
        >
          <option value={ALL}>{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}

      {filtering && (
        <button
          onClick={() => {
            onSearch("");
            for (const f of filters) onFilter(f.key, ALL);
          }}
          className="text-xs text-[#8a9ab5] hover:text-[#0d1f3c] underline"
        >
          Clear
        </button>
      )}

      <span className="text-xs text-[#8a9ab5] ml-auto">
        {filtering ? `${shown} of ${total}` : `${total}`}
      </span>

      {children}
    </div>
  );
}
