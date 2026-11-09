import { dataStepSchema, type DataStep } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { context, fakeCaller, records } from "../../tests/support.ts";
import { createMemoryPipelineState } from "../memory-pipeline-state.ts";
import { mapStep } from "../map-step.ts";
import { runLimited } from "../run-limited.ts";

function mapDeclaration(extra: Record<string, unknown> = {}): Extract<DataStep, { kind: "map" }> {
  return dataStepSchema.parse({ id: "double", kind: "map", target: { fluxNode: "demo.double" }, inputs: { n: { field: "n" } }, ...extra }) as Extract<DataStep, { kind: "map" }>;
}

const input = () => records([{ n: 1, id: "a" }, { n: 2, id: "b" }, { n: 3, id: "c" }, { n: 4, id: "d" }]);

describe("mapStep", () => {
  it("calls the Flow once per record in order, under the concurrency limit, and rebases the call lineage under the field", async () => {
    const fake = fakeCaller();
    const out = await mapStep(mapDeclaration({ concurrency: 2 }), input(), context({ callFlow: fake.caller }));
    expect(out.map((record) => record.data["result"])).toEqual([{ doubled: 2 }, { doubled: 4 }, { doubled: 6 }, { doubled: 8 }]);
    expect(fake.calls).toHaveLength(4);
    expect(fake.peak()).toBe(2);
    const lineage = out[0]?.lineage ?? [];
    expect(lineage.map((entry) => entry.pointer)).toEqual(["", "/result/doubled", ""]);
    expect(lineage[1]).toMatchObject({ runId: "run-child", stepId: "child-step" });
    expect(lineage[2]?.source).toEqual({ kind: "derived", from: ["/0"] });
  });

  it("runs one at a time by default", async () => {
    const fake = fakeCaller();
    await mapStep(mapDeclaration(), input(), context({ callFlow: fake.caller }));
    expect(fake.peak()).toBe(1);
  });

  it("incremental: skips keys an earlier run of this pipeline processed, per project", async () => {
    const state = createMemoryPipelineState();
    const first = fakeCaller();
    const declaration = mapDeclaration({ skipProcessedBy: ["id"] });
    await mapStep(declaration, input().slice(0, 2), context({ callFlow: first.caller, state }));
    expect(first.calls).toHaveLength(2);
    const second = fakeCaller();
    const out = await mapStep(declaration, input(), context({ callFlow: second.caller, state }));
    expect(second.calls.map((call) => call["n"])).toEqual([3, 4]);
    expect(out.map((record) => record.data["id"])).toEqual(["c", "d"]);
    const other = fakeCaller();
    await mapStep(declaration, input(), { ...context({ callFlow: other.caller, state }), projectId: "project-2" });
    expect(other.calls).toHaveLength(4);
  });

  it("incremental: a key is remembered only after its call succeeded", async () => {
    const state = createMemoryPipelineState();
    const declaration = mapDeclaration({ skipProcessedBy: ["id"] });
    const failing = async () => {
      throw new Error("boom");
    };
    await expect(mapStep(declaration, input(), context({ callFlow: failing, state }))).rejects.toThrow("boom");
    expect(await state.isProcessed("project-1", "demo.pipeline", "double", '["a"]')).toBe(false);
  });

  it("incremental without state is an error rather than a silent full run", async () => {
    await expect(mapStep(mapDeclaration({ skipProcessedBy: ["id"] }), input(), context({ callFlow: fakeCaller().caller }))).rejects.toMatchObject({ code: "pipeline.no_state" });
  });

  it("cached: identical inputs reuse a result inside the stated time and call again after it", async () => {
    const state = createMemoryPipelineState();
    let clock = 1000;
    const fake = fakeCaller();
    const ports = { callFlow: fake.caller, state, now: () => clock };
    const declaration = mapDeclaration({ reuseResultsForMs: 500 });
    const same = records([{ n: 5 }, { n: 5 }, { n: 6 }]);
    await mapStep(declaration, same.slice(0, 1), context(ports));
    const out = await mapStep(declaration, same, context(ports));
    expect(fake.calls.map((call) => call["n"])).toEqual([5, 6]);
    expect(out.map((record) => record.data["result"])).toEqual([{ doubled: 10 }, { doubled: 10 }, { doubled: 12 }]);
    clock = 1600;
    await mapStep(declaration, same.slice(0, 1), context(ports));
    expect(fake.calls.map((call) => call["n"])).toEqual([5, 6, 5]);
  });

  it("stops starting calls after a failure and rethrows it", async () => {
    const started: number[] = [];
    await expect(
      runLimited(10, 1, async (index) => {
        started.push(index);
        if (index === 2) throw new Error("third");
        return index;
      })
    ).rejects.toThrow("third");
    expect(started).toEqual([0, 1, 2]);
  });

  it("refuses to run when stopped", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(mapStep(mapDeclaration(), input(), { ...context({ callFlow: fakeCaller().caller }), signal: controller.signal })).rejects.toMatchObject({ code: "pipeline.aborted" });
  });
});
