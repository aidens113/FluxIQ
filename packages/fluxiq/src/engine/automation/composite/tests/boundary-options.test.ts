import { expect, it } from "vitest";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { hasAutomationExecutionObservation } from "../../execution-admission/index.ts";
import { AutomationRetrySeries } from "../../execution-admission/kernel/index.ts";
import { automationObservationFixture } from "../../execution-admission/tests/fixture.ts";
import { automationStudioCallAcrossBoundary } from "../boundary.ts";

it("preserves stripped cursor getter order and parent authority despite observed child overrides", async () => {
  const parent = await automationObservationFixture();
  const foreign = await automationObservationFixture();
  const reads: string[] = [];
  // The original native object-rest operation reads this fixture's excluded accessors twice.
  const originalReads = ["start", "stop", "start", "stop"];
  const marker = Symbol("parent extra field");
  const original = Object.freeze({ value: "original parent" });
  const invocation = automationStudioRootInvocation({ flowId: "flow.parent", nodes: [], edges: [] }, {});
  const parentSeries = Object.freeze({});
  AutomationRetrySeries.bind(parent.options, parentSeries);
  AutomationRetrySeries.bind(foreign.options, Object.freeze({}));
  Object.defineProperties(parent.options, {
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
      bindings: {}, callInputs: {}, parentOptions: parent.options,
      childOverrides: foreign.options, maxAttempts: 1, frame: () => undefined,
      runChild: async child => {
        calls += 1;
        expect(reads).toEqual(originalReads);
        for (const key of ["startNodeId", "stopAfterNodeId", "invocation"]) expect(Object.hasOwn(child, key)).toBe(false);
        expect(child.currentSubflowId).toBe("child.actual");
        expect(Object.getOwnPropertyDescriptor(child, marker)?.value).toBe(original);
        expect(Object.getOwnPropertyDescriptor(child, "overrideExtra")?.value).toBe(overrideExtra);
        expect(hasAutomationExecutionObservation(child)).toBe(true);
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
  } finally {
    await parent.authority.consumer.release(parent.reserved.reservation);
    await foreign.authority.consumer.release(foreign.reserved.reservation);
  }
});
