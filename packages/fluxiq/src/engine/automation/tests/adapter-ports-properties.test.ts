import { describe, expect, it } from "vitest";
import type { ExecutableGraph } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../index.ts";
import { enteredObservationFixture } from "../../../runtime/execution-observation/tests/frame.ts";
import { enteredAutomationFixture } from "../execution-admission/tests/frame.ts";
import { AutomationExecutionPorts, automationCallbackObservation } from "../execution-admission/kernel/index.ts";
import { automationStudioRunFrames } from "../frames/index.ts";
import type { AutomationStudioInvocationFrame } from "../frames/index.ts";
import { automationStudioActiveLifecycleRegistrations, automationStudioLifecycleRouteTarget, runAutomationStudioHandlerBody } from "../lifecycle-run/index.ts";
import type { AutomationStudioRegisteredLifecycleGraph } from "../lifecycle-run/index.ts";
import { executeWithRegionTimeout } from "../regions/index.ts";
import { runExecutableRouter } from "../router/index.ts";

const attempt: AutomationStudioNodeAttemptTrace = { attemptId: "node.attempt.1", nodeId: "node", definitionId: "builtin.data.constant", startedAt: 1, finishedAt: 2, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
const graph: ExecutableGraph = { flowId: "parent.graph", nodes: [{ id: "checkpoint", definitionId: "builtin.data.constant", metadata: { "fluxiq.checkpoint": { id: "saved", requires: ["saved.value"] } } }], edges: [] };
const registered: AutomationStudioRegisteredLifecycleGraph = { subflowId: null, graph, graphRevision: null, registrations: [], problems: [] };
function frame(invocationId: string, graphFlowId = graph.flowId): AutomationStudioInvocationFrame {
  return { invocationId, subflowId: null, graphFlowId, graphRevision: null, entry: { kind: "default" }, inputs: {}, outputs: {}, cursor: { nodeId: "checkpoint", phase: "before_attempt" } };
}

describe("retained ports and delegated callback selections", () => {
  it("rechecks a retained port after an await and preserves the original object", async () => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    let calls = 0;
    await f.run(async options => {
      class Control {
        #calls = 0;
        async checkpoint(...args: []) { expect(args).toEqual([]); this.#calls++; calls++; }
        heldBy() { return undefined; }
      }
      const original = new Control();
      expect(AutomationExecutionPorts.method(options, original, "checkpoint")).toBe(original);
      await AutomationExecutionPorts.method(options, original, "checkpoint").checkpoint();
      await Promise.resolve();
      Object.defineProperty(original, "checkpoint", { get() { reads++; return () => { calls++; }; } });
      expect(() => AutomationExecutionPorts.method(options, original, "checkpoint").checkpoint()).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    expect(calls).toBe(1);
    await f.pending();
  });

  it("refuses a timer cancel getter installed by the actual awaited region action", async () => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    let calls = 0;
    await f.run(async options => {
      const timer = { cancel() { calls++; } };
      await expect(executeWithRegionTimeout(async () => {
        await Promise.resolve();
        Object.defineProperty(timer, "cancel", { get() { reads++; return () => { calls++; }; } });
        return attempt;
      }, 50, undefined, () => attempt, undefined, () => timer, options)).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    expect(calls).toBe(0);
    await f.pending();
  });

  it.each(["own", "inherited"] as const)("refuses a %s recovery loader getter without loading", async placement => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    let calls = 0;
    await f.run(async options => {
      const owner = {};
      Object.defineProperty(owner, "recovery", { get() { reads++; return () => { calls++; }; } });
      const source = Object.assign(placement === "own" ? owner : Object.create(owner), { load: async () => undefined });
      await expect(automationStudioActiveLifecycleRegistrations(automationStudioRunFrames(), source, automationCallbackObservation(options))).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    expect(calls).toBe(0);
    await f.pending();
  });

  it("retains a successful custom recovery loader on its private original receiver", async () => {
    const f = await enteredAutomationFixture();
    class Source {
      #calls = 0;
      async load() { return undefined; }
      async recovery(...args: []) { expect(args).toEqual([]); this.#calls++; return undefined; }
      get calls() { return this.#calls; }
    }
    const source = new Source();
    await f.run(async options => { await automationStudioActiveLifecycleRegistrations(automationStudioRunFrames(), source, automationCallbackObservation(options)); });
    expect(source.calls).toBe(1);
    await f.pending();
  });

  it("refuses a handler runner getter before choosing an invocation id or starting its body", async () => {
    const f = await enteredAutomationFixture();
    let reads = 0;
    let bodies = 0;
    await f.run(async options => {
      const run = automationStudioRunFrames();
      Object.defineProperty(run, "runSubflow", { get() { reads++; return () => { bodies++; }; } });
      await expect(runAutomationStudioHandlerBody({ run, parent: frame("parent"), graph: registered, bodyNodeId: "checkpoint", inputs: {}, options })).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    expect(bodies).toBe(0);
    await f.pending();
  });

  it("refuses an ancestor values getter at the actual lifecycle checkpoint lookup", async () => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const input = { stack: [frame("parent"), frame("child", "child.graph")], graphs: new Map([[graph.flowId, registered]]), checkpointId: "saved", values: {} };
      Object.defineProperty(input, "valuesOf", { get() { reads++; return () => ({ "saved.value": 1 }); } });
      expect(() => automationStudioLifecycleRouteTarget(input, observation)).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it.each(["own", "inherited"] as const)("refuses a %s router clock getter under the original entered owner", async placement => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const input = { projectId: "project", flowId: "flow", router: { routerId: "router", flowId: "flow", rules: [] }, subflows: [] };
      const owner = placement === "own" ? input : {};
      Object.defineProperty(owner, "now", { get() { reads++; return () => 2; } });
      if (placement === "inherited") Object.setPrototypeOf(input, owner);
      expect(() => runExecutableRouter(input, observation)).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it("accounts a router clock that returns after an effect without changing its original receiver", async () => {
    const f = await enteredObservationFixture();
    let acts = 0;
    await f.run(async observation => {
      const input = { projectId: "project", flowId: "flow", router: { routerId: "router", flowId: "flow", rules: [] }, subflows: [], now(...args: []) { expect(this).toBe(input); expect(args).toEqual([]); acts++; return 0; } };
      expect(runExecutableRouter(input, observation).decision.decidedAt).toBe(0);
    });
    expect(acts).toBe(1);
    await f.pending();
  });
});
