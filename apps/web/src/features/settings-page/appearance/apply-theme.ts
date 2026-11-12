import { type ThemeChoice, themeStorageKey } from "./theme";

/** Sets `data-theme` on the root element and remembers the choice in this browser. Returns false when storage is blocked: the choice then holds for this page only. */
export function applyTheme(choice: ThemeChoice): boolean {
  document.documentElement.setAttribute("data-theme", choice);
  try {
    window.localStorage.setItem(themeStorageKey, choice);
    return true;
  } catch {
    return false;
  }
}
