import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "wlf-theme";
const CHANGE_EVENT = "wlf-theme-change";

/** Browser chrome colour, kept in step with the page surface. */
const THEME_COLOR: Record<Theme, string> = {
  light: "#0d1f3c",
  dark: "#081120",
};

/**
 * The source of truth is the class on <html>, not React state: the inline
 * script in index.html sets it before first paint so a dark-mode visitor
 * never sees a white flash. Reading it back keeps this hook in step with
 * that script and with any other mounted toggle.
 */
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const sync = () => setTheme(currentTheme());

    // `storage` covers a second tab; the custom event covers a second toggle
    // on the same page (the public nav and a portal header never coexist, but
    // this keeps the hook honest if they ever do).
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies
      // for this session, it just will not be remembered.
    }

    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, toggle };
}
