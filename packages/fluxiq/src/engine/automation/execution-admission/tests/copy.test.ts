import { expect, it } from "vitest";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { bindAutomationExecutionObservation, copyAutomationExecutionOptions, hasAutomationExecutionObservation, inheritAutomationExecutionObservation } from "../index.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import { AutomationRetrySeries } from "../kernel/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { automationObservationFixture } from "./fixture.ts";
import type { JsonValue } from "../../../../core/index.ts";
import type { ExecutableGraph } from "../../../../flows/executable/graph/index.ts";
import { AutomationExpectationCollector, AutomationExpectationDiagnostics, invokeAutomationExpectation } from "../../expectation-observation/index.ts";

it("keeps the original observation through a copy and blocks a second committing callback after a throw", async () => {
  const f = await automationObservationFixture();
  class Host {
    readonly capabilities = ["state-snapshot"];
    #commits = 0;
    get commits() { return this.#commits; }
    captureStateSnapshot(): never {
      this.#commits++;
      throw new Error("synthetic write then throw");
    }
  }
  const host = new Host();
  f.options.hostRuntime = host;
  const copied = copyAutomationExecutionOptions(f.options, { maxSteps: 9 });
  expect(copied).not.toBe(f.options);
  expect(copied.hostRuntime).toBe(host);
  expect(copied.maxSteps).toBe(9);
  expect(f.options.maxSteps).toBeUndefined();
  expect(Object.keys(copied).sort()).toEqual([...Object.keys(f.options), "maxSteps"].sort());
  const flow = { flowId: "flow.copy", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] };
  expect((await runAutomationStudioGraph(flow, copied)).status).toBe("failed");
  await expect(runAutomationStudioGraph(flow, copyAutomationExecutionOptions(copied))).rejects.toThrow();
  expect(host.commits).toBe(1);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});

it("does not grant a private observation to a public or serialized options object", async () => {
  const f = await automationObservationFixture();
  const forged = JSON.parse(JSON.stringify(f.options));
  expect(hasAutomationExecutionObservation(copyAutomationExecutionOptions(forged))).toBe(false);
  expect(hasAutomationExecutionObservation(copyAutomationExecutionOptions({}))).toBe(false);
  expect(copyAutomationExecutionOptions(undefined, { maxSteps: 3 })).toEqual({ maxSteps: 3 });
  expect(hasAutomationExecutionObservation(copyAutomationExecutionOptions(undefined, f.options))).toBe(false);
  expect(hasAutomationExecutionObservation(copyAutomationExecutionOptions(f.options))).toBe(true);
});

it("defers only observation binding until an actual child enters, preserving its original retry series", async () => {
  const f = await automationObservationFixture();
  if (!(f.engine instanceof AutomationAdmissionDriver)) throw new Error("test.original_driver_missing");
  const retrySeries = Object.freeze({});
  AutomationRetrySeries.bind(f.options, retrySeries);
  const deferred = copyAutomationExecutionOptions(f.options, { maxSteps: 7 }, null);
  expect(hasAutomationExecutionObservation(deferred)).toBe(false);
  expect(AutomationRetrySeries.original(deferred)).toBe(retrySeries);
  const identity = { receiver: undefined, callback: () => undefined };
  f.engine.callbacks.manage({ ...identity, contract: "no_direct_effects" });
  const entered = await f.engine.callbacks.prepare(f.engine.callbacks.forParent(f.parent), identity);
  const child = f.engine.callbacks.context(entered);
  inheritAutomationExecutionObservation(f.options, deferred, child);
  const actual = AutomationObservationBindings.read(AutomationObservationBindings.of(deferred)!);
  expect(actual.parent).toBe(child);
  expect(actual.source).toBe(f.engine);
  const immediate = copyAutomationExecutionOptions(f.options, {}, child);
  expect(AutomationObservationBindings.read(AutomationObservationBindings.of(immediate)!).parent).toBe(child);
  expect(AutomationObservationBindings.of(f.options)).toBe(f.observation);
  expect(() => bindAutomationExecutionObservation(deferred, f.observation)).toThrow("execution_observation.options_already_bound");
  await f.engine.callbacks.invoke(entered, { ...identity, args: [] });
});

it("retains original configured evaluator coverage and diagnostics through the real graph option copies", async () => {
  const f = await automationObservationFixture();
  if (!(f.engine instanceof AutomationAdmissionDriver)) throw new Error("test.original_driver_missing");
  class Host {
    readonly capabilities = ["expectation-evaluation"];
    #calls = 0;
    get calls() { return this.#calls; }
    expectationEvaluator(conditions: JsonValue[]) {
      this.#calls++;
      return { passed: true, checkedConditionCount: conditions.length };
    }
  }
  const host = Object.freeze(new Host());
  const original = host.expectationEvaluator;
  f.options.hostRuntime = host;
  f.engine.callbacks.manage({ receiver: host, callback: original, contract: "no_direct_effects" });
  const collector = new AutomationExpectationCollector();
  AutomationExpectationDiagnostics.bind(f.options, collector);
  const copied = copyAutomationExecutionOptions(copyAutomationExecutionOptions(f.options), { maxSteps: 4 });
  const graph: ExecutableGraph = {
    flowId: "flow.original-expectation",
    nodes: [
      { id: "changed", definitionId: "builtin.data.constant", parameterValues: { value: "ok", expectedState: { conditions: [{ kind: "controlled.condition" }] } } },
      { id: "end", definitionId: "builtin.control.end" }
    ],
    edges: [{ id: "changed.end", sourceNodeId: "changed", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
  };
  expect((await runAutomationStudioGraph(graph, copied)).status).toBe("succeeded");
  expect(copied.hostRuntime).toBe(host);
  expect(copied.hostRuntime?.expectationEvaluator).toBe(original);
  expect(host.calls).toBe(1);
  expect(collector.facts("changed.attempt.1")).toEqual([{ attemptId: "changed.attempt.1", source: "transition_comparison", declaredCount: 1, checkedCount: 1, outcome: "passed" }]);
  await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
});

it("does not let evaluator diagnostics bypass an original callback that acted and threw", async () => {
  const f = await automationObservationFixture();
  const failure = new Error("controlled evaluator effect then failure");
  let calls = 0;
  const host = { expectationEvaluator(): never {
    calls++;
    throw failure;
  } };
  const collector = new AutomationExpectationCollector();
  AutomationExpectationDiagnostics.bind(f.options, collector);
  const options = copyAutomationExecutionOptions(f.options);
  const context = { source: "transition_comparison" as const, attemptId: "attempt.original" };
  await expect(invokeAutomationExpectation(options, { receiver: host, callback: host.expectationEvaluator, args: [[{ id: 1 }], "all", 0, context] })).rejects.toBe(failure);
  await expect(invokeAutomationExpectation(copyAutomationExecutionOptions(options), { receiver: host, callback: host.expectationEvaluator, args: [[{ id: 1 }], "all", 0, context] })).rejects.toThrow();
  expect(calls).toBe(1);
  expect(collector.outcome(context.attemptId)).toBe("unknown");
  await f.authority.consumer.release(f.reserved.reservation);
  expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
});
