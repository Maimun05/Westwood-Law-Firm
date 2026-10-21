import { useTheme } from "@/hooks/useTheme";

// ============================================================================
// Brand mark
// ============================================================================
// The header used to point at /westwood-logo.png, which was never in the repo,
// so every page showed a broken-image icon. The mark is now the Lady Justice
// emblem extracted from the firm's logo artwork the owner supplied
// (src/imports/Westwood_Law_Firm_Logo__revised___1_.png). Two transparent
// recolours of the same art are shipped: navy for light surfaces and gold for
// the navy hero/sidebar. The old 128px blue-on-navy tile was soft and read as
// a dark blob on the light header; the vector-sourced artwork stays crisp.
// The wordmark stays as text so it renders sharp at any size and in either tone.
//
// The mark is a raster tint, so it cannot inherit a CSS colour: the file has to
// match the surface it sits on. `tone` says what the surface is ("light" = navy
// hero / portal sidebar), and dark mode turns every other surface navy too,
// which is why the theme is consulted as well — a navy mark on a dark header is
// invisible.

export function BrandMark({
  tone = "dark",
  className = "h-9 w-9",
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  const { theme } = useTheme();

  // Gold on anything dark: an explicit light-tone surface, or the whole page
  // once dark mode is on. Navy only on a light surface.
  const gold = tone === "light" || theme === "dark";

  return (
    <img
      src={gold ? "/westwood-mark-light.png" : "/westwood-mark.png"}
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
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
            tone === "light" ? "text-white" : "text-[var(--ink-strong)]"
          }`}
        >
          WESTWOOD
        </span>
        <span
          className={`text-[0.55rem] lg:text-[0.6rem] tracking-[0.32em] uppercase mt-1 ${
            tone === "light" ? "text-white/60" : "text-[var(--ink-muted)]"
          }`}
        >
          Law Firm
        </span>
      </span>
    </span>
  );
}

export default BrandLogo;
