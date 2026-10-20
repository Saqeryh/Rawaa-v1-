import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "rawa.theme";

/** Read the persisted theme; fall back to the attribute (set by a previous session) then light. */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch { /* storage unavailable */ }
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Apply the theme to <html>: data-theme drives every themed CSS variable; colorScheme keeps form controls in sync. */
export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === "dark") {
    html.setAttribute("data-theme", "dark");
    html.style.colorScheme = "dark";
  } else {
    html.removeAttribute("data-theme");
    html.style.colorScheme = "light";
  }
}

/** Called once before the first render (main.tsx) so the correct theme paints immediately. */
export function initTheme() {
  applyTheme(readTheme());
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

/** Light/dark state shared by every toggle instance; external changes (e.g. another tab) are picked up on mount. */
export function useTheme(): { theme: Theme; isDark: boolean; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      setTheme(next);
      return next;
    });
  }, []);
  return { theme, isDark: theme === "dark", toggle };
}
