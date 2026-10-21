import { describe, expect, it } from "vitest";
import { automationStudioActivityHumanLabel } from "../index.ts";

// t753: a wordless control's class ("css-0732x7m") was read as its name and
// shown as "Reading the details of “css-0732x7m”". A class name or a token a
// page generated is no person's words.
describe("automationStudioActivityHumanLabel and generated tokens", () => {
  it.each(["css-0732x7m", "css-k008qs", "sc-AxjAm", "jsx-2849671", "nav__item", "btn--primary", "x7f3k9q2"])("rejects %s", (token) => {
    expect(automationStudioActivityHumanLabel(token)).toBeUndefined();
  });

  it.each(["7-in-1", "USB-C", "Wi-Fi", "Sign-in", "X-Large", "Save", "2-pack", "Size 10", "SKU-12345", "4K60"])("keeps %s", (label) => {
    expect(automationStudioActivityHumanLabel(label)).toBe(label);
  });
});
