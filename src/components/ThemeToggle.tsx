import { IconMoon, IconSun } from "@/components/Icons";
import { useTheme } from "@/hooks/useTheme";

type ThemeToggleProps = {
  /** `hero` is for the transparent nav sitting on the navy home hero. */
  tone?: "default" | "hero";
  className?: string;
};

/**
 * Light/dark switch. The icon shows the theme you would get by clicking:
 * a moon in light mode, a sun in dark mode.
 */
export default function ThemeToggle({ tone = "default", className = "" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const toneClass =
    tone === "hero"
      ? "text-white/70 hover:text-white hover:bg-white/10"
      : "text-[var(--ink-muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--surface-hover)]";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${toneClass} ${className}`}
    >
      {isDark ? (
        <IconSun className="h-[18px] w-[18px]" />
      ) : (
        <IconMoon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
