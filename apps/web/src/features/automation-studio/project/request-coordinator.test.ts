import { describe, expect, it } from "vitest";
import { AutomationRequestStateStore, idleAutomationRequestState, LatestAutomationRequestRegistry, nextAutomationRequestState } from "./request-coordinator";

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

  it("updates request state snapshots outside React state", () => {
    const store = new AutomationRequestStateStore();
    const emptySnapshot = store.snapshot;

    store.set("projects", nextAutomationRequestState("loading", 10));
    expect(emptySnapshot).toEqual({});
    expect(store.snapshot).toEqual({ projects: { phase: "loading", startedAt: 10 } });

    store.update("projects", (current) => nextAutomationRequestState("success", 25, current));
    expect(store.snapshot.projects).toEqual({ phase: "success", startedAt: 10, finishedAt: 25 });

    store.reset("projects");
    expect(store.snapshot.projects).toBe(idleAutomationRequestState);
  });
});
