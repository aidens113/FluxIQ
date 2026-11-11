import { describe, expect, it } from "vitest";
import { accentTokens } from "../accent-tokens";

describe("the accent on the panel's own tokens", () => {
  it("maps a product's accent to --accent, --accent-hover, --accent-text, --accent-ink and --focus", () => {
    expect(accentTokens({ "--color-primary": "#0b5cad", "--color-primary-hover": "#084a8a", "--color-focus": "#0a4f95" })).toEqual({
      "--accent": "#0b5cad",
      "--accent-hover": "#084a8a",
      "--accent-text": "#0b5cad",
      "--accent-ink": "#ffffff",
      "--focus": "#0a4f95"
    });
  });
  it("picks the dark ink on a light accent", () => {
    expect(accentTokens({ "--color-primary": "#f5b83d" })["--accent-ink"]).toBe("#0c0d0f");
  });
  it("adds no token the package does not define, and sets nothing without a brand (stock)", () => {
    expect(accentTokens({})).toEqual({});
    expect(Object.keys(accentTokens({ "--color-primary": "#0b5cad" }))).toEqual(["--accent", "--accent-hover", "--accent-text", "--accent-ink", "--focus"]);
  });
});
