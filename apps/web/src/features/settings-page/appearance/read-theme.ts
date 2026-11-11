import { parseTheme } from "./parse-theme";
import type { ThemeChoice } from "./theme";
import { themeStorageKey } from "./theme";

/** The stored choice, or dark when nothing is stored or storage is unavailable. */
export function readTheme(): ThemeChoice {
  try {
    return parseTheme(window.localStorage.getItem(themeStorageKey));
  } catch {
    return "dark";
  }
}
