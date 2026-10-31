import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioScreenRouteSituation } from "../screen-situation.ts";

describe("route situation privacy before comparison", () => {
  it("withholds secret values and secret-shaped keys, preserving whole safe values", () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz0123456789";
    expect(automationStudioScreenRouteSituation({ safe: ["whole", { value: null }], secret, [secret]: true }, []))
      .toEqual({ safe: ["whole", { value: null }] });
  });

  it("refuses denied evidence without exposing its value", () => {
    expect(() => automationStudioScreenRouteSituation({ key: { raw: "private value" } }, ["raw"]))
      .toThrow("The routing situation could not be screened for evidence.");
  });

  it("does not copy unreadable value or callback error prose into a refusal", () => {
    const state = Object.defineProperty({}, "key", { enumerable: true, get() { throw new Error("private callback prose"); } }) as JsonObject;
    expect(() => automationStudioScreenRouteSituation(state, [])).toThrow("The routing situation could not be screened for evidence.");
  });
});
