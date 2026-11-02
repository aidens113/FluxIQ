import { expect, it, vi } from "vitest";
import * as canonical from "../../../../../engine/automation/index.ts";
import { automationObservationFixture } from "../../../../../engine/automation/execution-admission/tests/fixture.ts";
import { runAutomationStudioGraph } from "../graph-run.ts";

it("materializes original getters before the legacy override while keeping extra fields", async () => {
  const execute = vi.spyOn(canonical, "runAutomationStudioGraph").mockResolvedValue({ status: "succeeded", startedAt: 1, attempts: [], values: {}, effects: [] });
  const events: string[] = [];
  const extra = Symbol("original option field");
  const original = Object.freeze({ value: "original companion" });
  const first = () => { throw new Error("The first classifier must not run."); };
  const second = () => { throw new Error("The second classifier must not run."); };
  let reads = 0;
  const options = {
    get maxSteps() {
      events.push("maxSteps");
      return 13;
    },
    get classifyLegacyStepAct() {
      reads += 1;
      events.push(`classifier.${reads}`);
      return reads === 1 ? first : second;
    },
    explicitUndefined: undefined,
    get [extra]() {
      events.push("symbol");
      return original;
    }
  };
  try {
    await runAutomationStudioGraph({ flowId: "flow.getters", nodes: [], edges: [] }, options);
    expect(events).toEqual(["maxSteps", "classifier.1", "symbol", "classifier.2"]);
    const placed = execute.mock.calls[0]?.[1];
    expect(placed?.classifyLegacyStepAct).toBe(second);
    expect(placed?.maxSteps).toBe(13);
    expect(placed && Object.getOwnPropertyDescriptor(placed, extra)?.value).toBe(original);
    expect(placed && Object.hasOwn(placed, "explicitUndefined")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(options, "classifyLegacyStepAct")?.get).toBeTypeOf("function");
  } finally {
    execute.mockRestore();
  }
});

it("keeps an original observed host counter protected through the legacy graph wrapper", async () => {
  const f = await automationObservationFixture();
  class Host {
    readonly capabilities = ["state-snapshot"];
    #commits = 0;
    get commits() { return this.#commits; }
    captureStateSnapshot(): never {
      this.#commits += 1;
      throw new Error("synthetic original host write then lost acknowledgement");
    }
  }
  const host = new Host();
  f.options.hostRuntime = host;
  const flow = { flowId: "flow.legacy.copy", nodes: [{ id: "start", definitionId: "builtin.control.start" }], edges: [] };
  try {
    expect((await runAutomationStudioGraph(flow, f.options)).status).toBe("failed");
    await expect(runAutomationStudioGraph(flow, f.options)).rejects.toThrow();
    expect(host.commits).toBe(1);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("pending");
  } finally {
    await f.authority.consumer.release(f.reserved.reservation);
  }
});
