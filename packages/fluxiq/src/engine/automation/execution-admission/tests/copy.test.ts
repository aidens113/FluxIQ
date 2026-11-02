import { expect, it } from "vitest";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { bindAutomationExecutionObservation, copyAutomationExecutionOptions, hasAutomationExecutionObservation, inheritAutomationExecutionObservation } from "../index.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import { AutomationRetrySeries } from "../kernel/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { automationObservationFixture } from "./fixture.ts";

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
