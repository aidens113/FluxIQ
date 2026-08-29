import { describe, expect, it, vi } from "vitest";
import {
  createAutomationStudioMutationStore,
  mutationMatchesFilter
} from "./mutation-transaction-store";

describe("Automation Studio mutation transaction store", () => {
  it("commits ordered immutable transactions without browser globals", () => {
    const store = createAutomationStudioMutationStore();
    const first = store.commit({ kind: "flow-settings.changed", projectId: "project.one", flowId: "flow.one" });
    const second = store.commit({ kind: "instruction.changed", projectId: "project.one", flowId: "flow.one", instructionId: "instruction.one" });

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(store.getSnapshot()).toBe(second);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second.mutation)).toBe(true);
  });

  it("notifies only matching project, flow, and mutation subscribers", () => {
    const store = createAutomationStudioMutationStore();
    const flowOne = vi.fn();
    const runtime = vi.fn();
    const unsubscribe = store.subscribe(flowOne, {
      kinds: ["subflow.changed"],
      projectId: "project.one",
      flowId: "flow.one"
    });
    store.subscribe(runtime, { kinds: ["runtime-run.changed"], projectId: "project.one" });

    store.commit({ kind: "subflow.changed", projectId: "project.one", flowId: "flow.two" });
    store.commit({ kind: "subflow.changed", projectId: "project.one", flowId: "flow.one", subflowId: "subflow.one" });
    store.commit({ kind: "runtime-run.changed", projectId: "project.one", flowId: "flow.one", runId: "run.one" });
    unsubscribe();
    store.commit({ kind: "subflow.changed", projectId: "project.one", flowId: "flow.one" });

    expect(flowOne).toHaveBeenCalledTimes(1);
    expect(runtime).toHaveBeenCalledTimes(1);
  });

  it("supports project-wide runtime refreshes and exact scoped matches", () => {
    expect(mutationMatchesFilter(
      { kind: "runtime-run.changed", projectId: "project.one", runId: "run.one" },
      { kinds: ["runtime-run.changed"], projectId: "project.one" }
    )).toBe(true);
    expect(mutationMatchesFilter(
      { kind: "runtime-run.changed", projectId: "project.two", flowId: "flow.one", runId: "run.two" },
      { projectId: "project.one", flowId: "flow.one" }
    )).toBe(false);
  });
});
