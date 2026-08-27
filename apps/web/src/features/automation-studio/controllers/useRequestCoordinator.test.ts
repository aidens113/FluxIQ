import { describe, expect, it } from "vitest";
import { idleAutomationRequestState, LatestAutomationRequestRegistry, nextAutomationRequestState } from "./useRequestCoordinator";

describe("Automation Studio request state", () => {
  it("tracks a request from loading to completion", () => {
    const loading = nextAutomationRequestState("loading", 10);
    expect(loading).toEqual({ phase: "loading", startedAt: 10 });
    expect(nextAutomationRequestState("success", 25, loading)).toEqual({ phase: "success", startedAt: 10, finishedAt: 25 });
  });

  it("preserves the start time and explicit failure", () => {
    const loading = nextAutomationRequestState("loading", 10, idleAutomationRequestState);
    expect(nextAutomationRequestState("error", 30, loading, "No connection")).toEqual({
      phase: "error", startedAt: 10, finishedAt: 30, error: "No connection"
    });
  });
  it("aborts stale work and retains only the latest owner", () => {
    const registry = new LatestAutomationRequestRegistry();
    const first = registry.begin("runtime-summary");
    const second = registry.begin("runtime-summary");
    expect(first.signal.aborted).toBe(true);
    expect(registry.owns("runtime-summary", first)).toBe(false);
    expect(registry.owns("runtime-summary", second)).toBe(true);
    registry.cancelAll();
    expect(second.signal.aborted).toBe(true);
  });
});