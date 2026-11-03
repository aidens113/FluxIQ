import { expect, it } from "vitest";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { hasAutomationExecutionObservation } from "../../execution-admission/index.ts";
import { AutomationRetrySeries } from "../../execution-admission/kernel/index.ts";
import { automationObservationFixture } from "../../execution-admission/tests/fixture.ts";
import { automationStudioCallAcrossBoundary } from "../boundary.ts";
import { AutomationExpectationCollector, AutomationExpectationDiagnostics } from "../../expectation-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { enteredAutomationFrameFixture } from "../../tests/observed-frame.ts";

it("preserves stripped data cursors and parent authority despite observed child overrides", async () => {
  const parent = await enteredAutomationFrameFixture();
  const foreign = await automationObservationFixture();
  const reads: string[] = [];
  const originalReads: string[] = [];
  const marker = Symbol("parent extra field");
  const original = Object.freeze({ value: "original parent" });
  const invocation = automationStudioRootInvocation({ flowId: "flow.parent", nodes: [], edges: [] }, {});
  const parentSeries = Object.freeze({});
  AutomationRetrySeries.bind(parent.options, parentSeries);
  AutomationExpectationDiagnostics.bind(parent.options, new AutomationExpectationCollector());
  AutomationRetrySeries.bind(foreign.options, Object.freeze({}));
  Object.defineProperties(parent.options, {
    startNodeId: { enumerable: true, value: "parent.start" },
    stopAfterNodeId: { enumerable: true, value: "parent.stop" },
    invocation: { enumerable: true, value: invocation },
    [marker]: { enumerable: true, value: original }
  });
  foreign.options.currentSubflowId = "child.actual";
  const overrideExtra = Object.freeze({ value: "original override" });
  Object.defineProperty(foreign.options, "overrideExtra", { enumerable: true, value: overrideExtra });
  let calls = 0;
  try {
    await parent.run(async options => {
      const crossed = await automationStudioCallAcrossBoundary({
        contract: { interface: { inputs: [], outputs: [] }, errors: [] },
        bindings: {}, callInputs: {}, parentOptions: options,
        childOverrides: foreign.options, maxAttempts: 1, frame: () => undefined,
        runChild: async child => {
          calls += 1;
          expect(reads).toEqual(originalReads);
          for (const key of ["startNodeId", "stopAfterNodeId", "invocation"]) expect(Object.hasOwn(child, key)).toBe(false);
          expect(child.currentSubflowId).toBe("child.actual");
          expect(Object.getOwnPropertyDescriptor(child, marker)?.value).toBe(original);
          expect(Object.getOwnPropertyDescriptor(child, "overrideExtra")?.value).toBe(overrideExtra);
          expect(hasAutomationExecutionObservation(child)).toBe(true);
          expect(AutomationExpectationDiagnostics.has(child)).toBe(true);
          expect(AutomationRetrySeries.original(child)).toBe(parentSeries);
          return await runAutomationStudioGraph({ flowId: "flow.child", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] }, child);
        },
        executedTrace: saved => saved, failedMessage: "The isolated child failed."
      });
      expect(crossed.result.status).toBe("success");
      expect(calls).toBe(1);
      expect(reads).toEqual(originalReads);
      expect([...parent.store.rows.values()].some(value => value.row.sourceKey === "automation.engine")).toBe(true);
      expect([...foreign.store.rows.values()].some(value => value.row.sourceKey === "automation.engine")).toBe(false);
    });
  } finally {
    await parent.authority.consumer.release(parent.reserved.reservation);
    await foreign.authority.consumer.release(foreign.reserved.reservation);
  }
});

it("preserves every excluded cursor getter read and child option in an unobserved legacy call", async () => {
  const foreign = await automationObservationFixture();
  const parent: AutomationStudioGraphExecutionOptions = {};
  const reads: string[] = [];
  const originalReads = ["start", "stop", "start", "stop"];
  const marker = Symbol("parent extra field");
  const original = Object.freeze({ value: "original parent" });
  const invocation = automationStudioRootInvocation({ flowId: "flow.parent", nodes: [], edges: [] }, {});
  const parentSeries = Object.freeze({});
  AutomationRetrySeries.bind(parent, parentSeries);
  AutomationExpectationDiagnostics.bind(parent, new AutomationExpectationCollector());
  Object.defineProperties(parent, {
    startNodeId: { enumerable: true, get: () => {
      reads.push("start");
      return "parent.start";
    } },
    stopAfterNodeId: { enumerable: true, get: () => {
      reads.push("stop");
      return "parent.stop";
    } },
    invocation: { enumerable: true, get: () => invocation },
    [marker]: { enumerable: true, value: original }
  });
  foreign.options.currentSubflowId = "child.actual";
  const overrideExtra = Object.freeze({ value: "original override" });
  Object.defineProperty(foreign.options, "overrideExtra", { enumerable: true, value: overrideExtra });
  let calls = 0;
  try {
    const crossed = await automationStudioCallAcrossBoundary({
      contract: { interface: { inputs: [], outputs: [] }, errors: [] },
      bindings: {}, callInputs: {}, parentOptions: parent,
      childOverrides: foreign.options, maxAttempts: 1, frame: () => undefined,
      runChild: async child => {
        calls++;
        expect(reads).toEqual(originalReads);
        for (const key of ["startNodeId", "stopAfterNodeId", "invocation"]) expect(Object.hasOwn(child, key)).toBe(false);
        expect(child.currentSubflowId).toBe("child.actual");
        expect(Object.getOwnPropertyDescriptor(child, marker)?.value).toBe(original);
        expect(Object.getOwnPropertyDescriptor(child, "overrideExtra")?.value).toBe(overrideExtra);
        expect(hasAutomationExecutionObservation(child)).toBe(false);
        expect(AutomationExpectationDiagnostics.has(child)).toBe(true);
        expect(AutomationRetrySeries.original(child)).toBe(parentSeries);
        return await runAutomationStudioGraph({ flowId: "flow.child", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] }, child);
      },
      executedTrace: saved => saved, failedMessage: "The isolated child failed."
    });
    expect(crossed.result.status).toBe("success");
    expect(calls).toBe(1);
    expect(reads).toEqual(originalReads);
    expect([...foreign.store.rows.values()].some(value => value.row.sourceKey === "automation.engine")).toBe(false);
  } finally {
    await foreign.authority.consumer.release(foreign.reserved.reservation);
  }
});

it.each(["startNodeId", "stopAfterNodeId", "invocation"] as const)("refuses an observed %s accessor before its excluded cursor is read", async key => {
  const f = await enteredAutomationFrameFixture();
  let reads = 0;
  let calls = 0;
  await f.run(async options => {
    Object.defineProperty(options, key, { enumerable: true, get() {
      reads++;
      return undefined;
    } });
    await expect(automationStudioCallAcrossBoundary({
      contract: { interface: { inputs: [], outputs: [] }, errors: [] }, bindings: {}, callInputs: {}, parentOptions: options,
      maxAttempts: 1, frame: () => undefined,
      runChild: async () => {
        calls++;
        return { status: "succeeded", startedAt: 1, attempts: [], values: {}, effects: [] };
      },
      executedTrace: saved => saved, failedMessage: "The isolated child failed."
    })).rejects.toThrow("option_copy_accessor_unsupported");
  });
  expect(reads).toBe(0);
  expect(calls).toBe(0);
  await f.pending();
});
