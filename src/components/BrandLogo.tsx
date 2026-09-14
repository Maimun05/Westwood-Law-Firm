// ============================================================================
// Brand mark
// ============================================================================
// The header used to point at /westwood-logo.png, which was never in the repo,
// so every page showed a broken-image icon. The mark is now the Lady Justice
// emblem cropped from the firm's logo artwork the owner supplied
// (public/westwood-mark.png), shown as a small tile. The wordmark stays as
// text so it renders crisp at any size and in either tone.
//
// The emblem is royal blue on navy — the banner's own treatment — so it reads
// on the white scrolled header and on the navy hero alike; the thin ring just
// separates the tile from whatever is behind it.

export function BrandMark({
  tone = "dark",
  className = "h-9 w-9",
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <img
      src="/westwood-mark.png"
      alt=""
      aria-hidden="true"
      className={`${className} rounded-lg object-cover shadow-sm ${
        tone === "light" ? "ring-1 ring-white/20" : "ring-1 ring-[#0d1f3c]/10"
      }`}
    />
  );
}

export function BrandLogo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark tone={tone} className="h-9 w-9 lg:h-10 lg:w-10" />
      <span className="flex flex-col items-start leading-none">
        <span
          className={`font-serif text-[1.05rem] lg:text-[1.2rem] font-bold tracking-wide ${
            tone === "light" ? "text-white" : "text-[#0d1f3c]"
          }`}
        >
          WESTWOOD
        </span>
        <span
          className={`text-[0.55rem] lg:text-[0.6rem] tracking-[0.32em] uppercase mt-1 ${
            tone === "light" ? "text-white/60" : "text-[#8a9ab5]"
          }`}
        >
          Law Firm
        </span>
      </span>
    </span>
  );
}

export default BrandLogo;
