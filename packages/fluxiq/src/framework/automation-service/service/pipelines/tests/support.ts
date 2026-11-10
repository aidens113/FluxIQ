import type { DataLineage, DatasetRef } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { FlowCaller, PipelinePorts, PipelineRecord, PipelineRunContext } from "../types.ts";

export function context(ports: PipelinePorts = {}, inputs: JsonObject = {}): PipelineRunContext {
  return { runId: "run-1", flowId: "flow-1", projectId: "project-1", pipeline: "demo.pipeline", inputs, ports };
}

export function records(rows: JsonObject[]): PipelineRecord[] {
  return rows.map((data, index) => ({ data, lineage: [{ pointer: "", runId: "run-0", stepId: "source", source: { kind: "read", readId: `read-${index}` } } satisfies DataLineage] }));
}

export function rowsOf(list: readonly PipelineRecord[]): JsonValue[] {
  return list.map((record) => record.data);
}

/** A fake Flow caller: doubles `n` and says which call it was. Counts calls and tracks how many ran at once. */
export function fakeCaller(): { caller: FlowCaller; calls: JsonObject[]; peak: () => number } {
  const calls: JsonObject[] = [];
  let running = 0;
  let peak = 0;
  const caller: FlowCaller = async (_target, inputs) => {
    calls.push(inputs);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return { outputs: { doubled: Number(inputs["n"]) * 2 }, lineage: [{ pointer: "/doubled", runId: "run-child", stepId: "child-step", source: { kind: "read", readId: `child-${calls.length}` } }] };
  };
  return { caller, calls, peak: () => peak };
}

export function datasetPort(): { write: (name: string, rows: readonly JsonObject[]) => Promise<DatasetRef>; stored: Map<string, JsonObject[]> } {
  const stored = new Map<string, JsonObject[]>();
  return {
    stored,
    write: async (name, rows) => {
      stored.set(name, [...rows]);
      return { datasetId: `ds-${name}`, name, rowCount: rows.length };
    }
  };
}
