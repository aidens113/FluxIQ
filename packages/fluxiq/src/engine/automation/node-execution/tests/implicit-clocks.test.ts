import { describe, expect, it } from "vitest";
import type { ExecutableGraph, AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { getAutomationNodeDefinition } from "../../../../components/automation/index.ts";
import { enteredObservationFixture } from "../../../../runtime/execution-observation/tests/frame.ts";
import { enteredAutomationFixture } from "../../execution-admission/tests/frame.ts";
import { automationExecutionClock, automationObservedClock } from "../../execution-admission/kernel/index.ts";
import { automationStudioTraceWithholding } from "../../trace/index.ts";
import { automationStudioRunState } from "../../state/index.ts";
import { executeAutomationStudioNode } from "../execution.ts";

function graph(node: AutomationStudioFlowNode): ExecutableGraph {
  return { flowId: "clock.graph", nodes: [node], edges: [] };
}

describe("clocks on actual entered execution frames", () => {
  it.each(["now", "random"] as const)("accounts a successful custom %s callback on its exact original pair", async operation => {
    const f = await enteredAutomationFixture();
    let calls = 0;
    await f.run(async options => {
      const receiver = { privateValue: 0.375 };
      options[operation] = function(this: typeof receiver, ...args: []) {
        expect(this).toBe(receiver);
        expect(args).toEqual([]);
        calls++;
        return this.privateValue;
      };
      expect(automationExecutionClock(options, operation, receiver)).toBe(0.375);
    });
    expect(calls).toBe(1);
    await f.pending();
    expect(calls).toBe(1);
  });

  it("accounts an unsupported successful generic clock and preserves its private receiver", async () => {
    const f = await enteredObservationFixture();
    class Clock {
      #calls = 0;
      now(...args: []) {
        expect(args).toEqual([]);
        this.#calls++;
        return 71;
      }
      get calls() { return this.#calls; }
    }
    const original = new Clock();
    await f.run(async observation => { expect(automationObservedClock(observation, original, original)()).toBe(71); });
    expect(original.calls).toBe(1);
    await f.pending();
  });

  it("keeps an existing registered original read-only clock supported", async () => {
    const f = await enteredObservationFixture();
    const clock = { now: () => 71 };
    f.source.manage({ receiver: clock, callback: clock.now, contract: "no_direct_effects" });
    await f.run(async observation => { expect(automationObservedClock(observation, clock, clock)()).toBe(71); });
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it.each([undefined, null])("keeps the native fallback after accounting a custom nullable result %s", async result => {
    const f = await enteredObservationFixture();
    let calls = 0;
    const original = {
      now: () => {
        calls++;
        return result as unknown as number;
      },
    };
    await f.run(async observation => {
      expect(automationObservedClock(observation, original, original)()).toBeGreaterThan(0);
    });
    expect(calls).toBe(1);
    await f.pending();
  });

  it.each(["now", "random"] as const)("refuses a replacement native %s getter used by a built-in fallback", async operation => {
    const f = await enteredAutomationFixture();
    const container = operation === "now" ? Date : Math;
    const original = Object.getOwnPropertyDescriptor(container, operation)!;
    const node = { id: "node", definitionId: operation === "now" ? "builtin.data.constant" : "builtin.random.number", parameterValues: { min: 2, max: 4, mode: "integer" } };
    let reads = 0;
    let calls = 0;
    await f.run(async options => {
      let result;
      try {
        Object.defineProperty(container, operation, {
          configurable: true,
          get() {
            reads++;
            return () => {
              calls++;
              return 0.5;
            };
          },
        });
        result = await executeAutomationStudioNode(graph(node), node, {}, options, 1, automationStudioTraceWithholding(), automationStudioRunState());
      } finally { Object.defineProperty(container, operation, original); }
      expect(result?.status).toBe("failed");
    });
    expect(reads).toBe(0);
    expect(calls).toBe(0);
    await f.pending();
  });

  it("refuses a built-in execute getter installed after its trusted body was captured", async () => {
    const f = await enteredAutomationFixture();
    const node = { id: "node", definitionId: "builtin.data.constant", parameterValues: { value: "safe" } };
    const definition = getAutomationNodeDefinition(node.definitionId)!;
    const descriptor = Object.getOwnPropertyDescriptor(definition, "execute")!;
    let reads = 0;
    let acts = 0;
    await f.run(async options => {
      let result;
      try {
        Object.defineProperty(definition, "execute", {
          configurable: true,
          get() {
            reads++;
            return () => {
              acts++;
              return {};
            };
          },
        });
        result = await executeAutomationStudioNode(graph(node), node, {}, options, 1, automationStudioTraceWithholding(), automationStudioRunState());
      } finally { Object.defineProperty(definition, "execute", descriptor); }
      expect(result?.status).toBe("failed");
    });
    expect(reads).toBe(0);
    expect(acts).toBe(0);
    await f.pending();
  });

  it("preserves the primary native action failure after that action replaces the wall clock", async () => {
    const f = await enteredAutomationFixture();
    const node = { id: "node", definitionId: "example.native" };
    const descriptor = Object.getOwnPropertyDescriptor(Date, "now")!;
    const primary = new Error("original native action failed");
    let reads = 0;
    let acts = 0;
    await f.run(async options => {
      options.nativeNodeExecutor = async () => {
        acts++;
        Object.defineProperty(Date, "now", {
          configurable: true,
          get() {
            reads++;
            throw new Error("secondary clock getter");
          },
        });
        throw primary;
      };
      let result;
      try { result = await executeAutomationStudioNode(graph(node), node, {}, options, 1, automationStudioTraceWithholding(), automationStudioRunState()); }
      finally { Object.defineProperty(Date, "now", descriptor); }
      expect(result).toMatchObject({ status: "failed", message: primary.message });
    });
    expect(acts).toBe(1);
    expect(reads).toBe(0);
    await f.pending();
  });

  it("keeps missing Wait randomness at 0.5 and preserves integer draw count", async () => {
    const f = await enteredAutomationFixture();
    await f.run(async options => {
      const wait = { id: "wait", definitionId: "builtin.timing.wait", parameterValues: { duration: 100, unit: "milliseconds", jitterMs: 50 } };
      const result = await executeAutomationStudioNode(graph(wait), wait, {}, options, 1, automationStudioTraceWithholding(), automationStudioRunState());
      expect(result.outputs.durationMs).toBe(100);
      let draws = 0;
      options.random = () => {
        draws++;
        return 0.25;
      };
      const integer = { id: "integer", definitionId: "builtin.random.number", parameterValues: { min: 0, max: 10, mode: "integer" } };
      const number = await executeAutomationStudioNode(graph(integer), integer, {}, options, 2, automationStudioTraceWithholding(), automationStudioRunState());
      expect(number.outputs.value).toBe(2);
      expect(draws).toBe(2);
    });
  });
});
