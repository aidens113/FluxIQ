import type { ThemeChoice } from "./choice";

/** The choices Settings offers, in order, with the words shown for each. */
export const themeChoices: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" }
];
