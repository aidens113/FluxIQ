import { dataFieldPathSteps, formatJsonPointer, isJsonObject, type DataLineage, type DataPipeline } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { PipelineError } from "../errors.ts";
import { evaluateExpression, readField } from "../expression/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";

/** The id the source gives its lineage, as a step would. */
export const PIPELINE_SOURCE_STEP_ID = "source";

function base(context: PipelineRunContext): Pick<DataLineage, "runId" | "stepId" | "pointer"> & { flowId?: string } {
  return { pointer: "", runId: context.runId, ...(context.flowId === undefined ? {} : { flowId: context.flowId }), stepId: PIPELINE_SOURCE_STEP_ID };
}

function asObjects(value: JsonValue, what: string): JsonObject[] {
  if (!Array.isArray(value) || !value.every((item) => isJsonObject(item))) throw new PipelineError("pipeline.source_not_records", `${what} is not a list of records.`, PIPELINE_SOURCE_STEP_ID);
  return value as JsonObject[];
}

/** The part of a Flow call lineage that describes record `index`, moved so its pointers start at the record. */
function lineageOfRecord(lineage: readonly DataLineage[], index: number): DataLineage[] {
  const prefix = `/${index}`;
  return lineage
    .filter((entry) => entry.pointer === prefix || entry.pointer.startsWith(`${prefix}/`))
    .map((entry) => ({ ...entry, pointer: entry.pointer.slice(prefix.length) }));
}

/**
 * The first records of a pipeline, each with lineage naming where it came from:
 *
 * - `dataset`: a `read` of the stored row (`readId` is `<datasetId>:<row>`);
 * - `input`: an `input` of the pipeline at the record pointer in its inputs;
 * - `flow`: the Flow's own lineage for each record when it gave some, otherwise a `read` of the call.
 */
export async function loadPipelineSource(pipeline: DataPipeline, context: PipelineRunContext): Promise<PipelineRecord[]> {
  const load = () => materialize(pipeline, context);
  return context.ports.sourceSnapshot ? await context.ports.sourceSnapshot(load) : await load();
}

async function materialize(pipeline: DataPipeline, context: PipelineRunContext): Promise<PipelineRecord[]> {
  const source = pipeline.source;
  if (source.kind === "dataset") {
    if (context.ports.readDataset === undefined) throw new PipelineError("pipeline.no_readDataset", "The source is a dataset, and no dataset reader was given.", PIPELINE_SOURCE_STEP_ID);
    const rows = await context.ports.readDataset(source.dataset);
    return rows.map((data, index) => ({ data, lineage: [{ ...base(context), source: { kind: "read", readId: `${source.dataset.datasetId}:${index}` } }] }));
  }
  if (source.kind === "input") {
    const rows = asObjects(readField(context.inputs, source.field), "The input the source names");
    const steps = dataFieldPathSteps(source.field);
    return rows.map((data, index) => ({ data, lineage: [{ ...base(context), source: { kind: "input", pointer: formatJsonPointer([...steps, index]) } }] }));
  }
  if (context.ports.callFlow === undefined) throw new PipelineError("pipeline.no_callFlow", "The source calls a Flow, and no caller was given.", PIPELINE_SOURCE_STEP_ID);
  const inputs: JsonObject = {};
  for (const [name, expression] of Object.entries(source.inputs ?? {})) {
    Object.defineProperty(inputs, name, { value: evaluateExpression(expression, { record: null, inputs: context.inputs }), enumerable: true, writable: true, configurable: true });
  }
  const result = await context.ports.callFlow(source.target, inputs, context.signal, { stepId: PIPELINE_SOURCE_STEP_ID, invocationId: "source" });
  const rows = asObjects(result.outputs, "The outputs of the source Flow");
  return rows.map((data, index) => {
    const own = lineageOfRecord(result.lineage, index);
    const read: DataLineage = { ...base(context), source: { kind: "read", readId: `${context.runId}:${PIPELINE_SOURCE_STEP_ID}:${index}` } };
    return { data, lineage: own.length > 0 ? own : [read] };
  });
}
