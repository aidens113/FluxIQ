import type { ThemeChoice } from "./theme";

/** A stored or typed value as a choice; anything else follows the device (system), the default. */
export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}
