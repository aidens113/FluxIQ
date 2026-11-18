import { describe, expect, it } from "vitest";
import { isClosedPlansPath } from "../closed-plans-path";

describe("isClosedPlansPath", () => {
  it("matches the plan page only while no commerce configuration is named", () => {
    expect(isClosedPlansPath("/plans", undefined)).toBe(true);
    expect(isClosedPlansPath("/plans/", "")).toBe(true);
    expect(isClosedPlansPath("/plans", "   ")).toBe(true);
    expect(isClosedPlansPath("/plans", "/run/secrets/commerce_config")).toBe(false);
  });

  it("leaves the checkout API (its own JSON 404) and other pages alone", () => {
    expect(isClosedPlansPath("/api/platform/v1/commerce/checkout", undefined)).toBe(false);
    expect(isClosedPlansPath("/plansx", undefined)).toBe(false);
    expect(isClosedPlansPath("/signup", undefined)).toBe(false);
    expect(isClosedPlansPath("/", undefined)).toBe(false);
  });
});
