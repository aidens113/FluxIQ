// Options: defaults, overrides, and the retry floor.
import { describe, expect, it } from "vitest";
import { FLUXNODE_DEFAULT_BUDGET_USD, FLUXNODE_MIN_RETRIES, resolveFluxNodeOptions } from "../index.ts";

describe("resolveFluxNodeOptions", () => {
  it("fills Core's defaults when nothing is set", () => {
    expect(resolveFluxNodeOptions(undefined, undefined)).toEqual({ retries: FLUXNODE_MIN_RETRIES, judge: "auto", budgetUsd: FLUXNODE_DEFAULT_BUDGET_USD, mode: "auto" });
    expect(FLUXNODE_DEFAULT_BUDGET_USD).toBe(5);
  });

  it("lets an override win over the declaration", () => {
    expect(resolveFluxNodeOptions({ retries: 5, budgetUsd: 1, model: "a", timeoutMs: 10 }, { budgetUsd: 0, model: "b" })).toEqual({ retries: 5, judge: "auto", budgetUsd: 0, mode: "auto", model: "b", timeoutMs: 10 });
  });

  it("never resolves below the retry floor", () => {
    expect(resolveFluxNodeOptions({ retries: 1 }, undefined).retries).toBe(FLUXNODE_MIN_RETRIES);
  });
});
