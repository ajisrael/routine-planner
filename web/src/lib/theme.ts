import { useEffect, useState } from "react";

export type ThemeName = "pastel" | "pasteldusk";
const KEY = "rp-theme";

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode */
  }
}

export function currentTheme(): ThemeName {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "pastel" ? "pastel" : "pasteldusk";
}

/** Theme toggle state (Pastel ↔ Pastel Dusk, DESIGN.md §2). */
export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(currentTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const toggle = (): void => setTheme((t) => (t === "pastel" ? "pasteldusk" : "pastel"));
  return [theme, toggle];
}
