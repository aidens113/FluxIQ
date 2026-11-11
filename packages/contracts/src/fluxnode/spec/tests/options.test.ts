// Options: defaults, overrides, and the retry floor.
import { describe, expect, it } from "vitest";
import { fluxNodeOptionsSchema, FLUXNODE_DEFAULT_BUDGET_USD, FLUXNODE_MIN_RETRIES, resolveFluxNodeOptions } from "../index.ts";

describe("resolveFluxNodeOptions", () => {
  it("fills Core's defaults when nothing is set", () => {
    expect(resolveFluxNodeOptions(undefined, undefined)).toEqual({ retries: FLUXNODE_MIN_RETRIES, judge: "auto", budgetUsd: FLUXNODE_DEFAULT_BUDGET_USD, mode: "auto" });
    expect(FLUXNODE_DEFAULT_BUDGET_USD).toBe(5);
  });

  it("lets an override win over the declaration", () => {
    expect(resolveFluxNodeOptions({ retries: 5, budgetUsd: 1, model: "a", timeoutMs: 10 }, { budgetUsd: 0, model: "b" })).toEqual({ retries: 5, judge: "auto", budgetUsd: 0, mode: "auto", model: "b", timeoutMs: 10 });
  });

  it("leaves humanness absent unless set, lets an override win, and refuses out-of-range", () => {
    expect(resolveFluxNodeOptions(undefined, undefined)).not.toHaveProperty("humanness");
    expect(resolveFluxNodeOptions({ humanness: 20 }, undefined).humanness).toBe(20);
    expect(resolveFluxNodeOptions({ humanness: 20 }, { humanness: 0 }).humanness).toBe(0);
    for (const bad of [-1, 101, 1.5]) expect(fluxNodeOptionsSchema.safeParse({ humanness: bad }).success, String(bad)).toBe(false);
    expect(fluxNodeOptionsSchema.safeParse({ humanness: 100 }).success).toBe(true);
  });

  it("never resolves below the retry floor", () => {
    expect(resolveFluxNodeOptions({ retries: 1 }, undefined).retries).toBe(FLUXNODE_MIN_RETRIES);
  });
});
