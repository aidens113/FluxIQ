import { describe, expect, it } from "vitest";
import { createScopedExternalStore } from "./external-store";
import { automationEntityScope, createAutomationProjectDataStore } from "./project-data-store";
import { createAutomationSelectionStore } from "./selection-store";
import { createAutomationRuntimeStatusStore } from "./runtime-status-store";

describe("Automation Studio scoped stores", () => {
  it("batches atomic writes and notifies only affected scoped subscribers", () => {
    const store = createScopedExternalStore({ a: 0, b: 0 });
    let global = 0;
    let a = 0;
    let b = 0;
    store.subscribe(() => { global += 1; });
    store.subscribe(() => { a += 1; }, "a");
    store.subscribe(() => { b += 1; }, "b");
    store.transaction(() => {
      store.update((state) => ({ ...state, a: 1 }), ["a"]);
      store.update((state) => ({ ...state, a: 2 }), ["a"]);
    });
    expect({ global, a, b }).toEqual({ global: 1, a: 1, b: 0 });
    expect(store.update((state) => state, ["a"])).toBe(false);
    expect({ global, a, b }).toEqual({ global: 1, a: 1, b: 0 });
  });

  it("keeps entity maps stable outside the changed kind", () => {
    const store = createAutomationProjectDataStore();
    const recordings = store.getState().entities.recordings;
    let flowUpdates = 0;
    let recordingUpdates = 0;
    store.subscribe(() => { flowUpdates += 1; }, automationEntityScope("flows"));
    store.subscribe(() => { recordingUpdates += 1; }, automationEntityScope("recordings"));
    expect(store.upsert("flows", "flow.one", { flowId: "flow.one" })).toBe(true);
    expect(store.getState().entities.recordings).toBe(recordings);
    expect({ flowUpdates, recordingUpdates }).toEqual({ flowUpdates: 1, recordingUpdates: 0 });
  });

  it("guards semantic selection no-ops without notifying unrelated scopes", () => {
    const store = createAutomationSelectionStore();
    let selectionUpdates = 0;
    let previewUpdates = 0;
    store.subscribe(() => { selectionUpdates += 1; }, "selection");
    store.subscribe(() => { previewUpdates += 1; }, "preview");
    expect(store.select({ kind: "flow", id: "flow.one" })).toBe(true);
    expect(store.select({ kind: "flow", id: "flow.one" })).toBe(false);
    expect({ selectionUpdates, previewUpdates }).toEqual({ selectionUpdates: 1, previewUpdates: 0 });
  });

  it("publishes command status by command ID and ignores equal status", () => {
    const store = createAutomationRuntimeStatusStore();
    const status = { id: "save-flow", state: "running" as const, detail: "Saving" };
    let calls = 0;
    store.subscribe(() => { calls += 1; }, "command:save-flow");
    expect(store.set(status)).toBe(true);
    expect(store.set({ ...status })).toBe(false);
    expect(calls).toBe(1);
  });
});