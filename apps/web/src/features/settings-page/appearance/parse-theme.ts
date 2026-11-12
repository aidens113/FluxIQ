import type { ThemeChoice } from "./theme";

/** A stored or typed value as a choice; anything else is dark, the default. */
export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "system" ? value : "dark";
}
