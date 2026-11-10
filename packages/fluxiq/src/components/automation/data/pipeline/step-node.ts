import { dataStepSchema } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import { PipelineError, executeDataStep, type PipelineRecord } from "../../../../framework/automation-service/service/pipelines/index.ts";
import { defineBuiltinNode, emptyResult, failedResult } from "../../shared/index.ts";
import { pipelineNodeContext } from "./node-context.ts";
import { pipelineNodeRecords } from "./node-records.ts";

/** The id a step runs under when the node runs alone: the compiled node's own id is not part of its context. */
const NODE_STEP_ID = "pipeline-step";

/** One data step of a compiled pipeline (`PIPELINE_NODE_TYPES.step`): the declared step, run on the records wired in. */
export const pipelineStepNode = defineBuiltinNode({
  id: "builtin.data.pipeline-step",
  label: "Data Step",
  description: "One step of a data pipeline (filter, transform, dedupe, join, sort, limit, aggregate, validate or sink) on the records before it.",
  class: "data",
  scope: "both",
  inputs: [
    { id: "records", label: "Records", valueType: "array", required: true },
    // The records a join step joins with, when it joins an earlier step.
    { id: "right", label: "Right side", valueType: "array", required: false }
  ],
  outputs: [{ id: "records", label: "Records", valueType: "array", role: "data" }],
  parameters: [{ id: "step", label: "Step", description: "The step as the pipeline declared it, without its id.", valueType: "json", required: true, allowStateBinding: false }],
  icon: "list-filter",
  tags: ["pipeline"],
  execute: async (context) => {
    const parsed = dataStepSchema.safeParse({ ...((context.parameters.step ?? {}) as JsonObject), id: NODE_STEP_ID });
    if (!parsed.success) return { ...failedResult(), message: `The pipeline step is not valid: ${parsed.error.issues[0]?.message ?? ""}` };
    const input = pipelineNodeRecords(context.inputs.records);
    if (input === undefined) return { ...failedResult(), message: "The pipeline step needs the records before it as a list of records with their lineage." };
    const step = parsed.data;
    const earlier = new Map<string, PipelineRecord[]>();
    if (step.kind === "join" && "step" in step.with) {
      const right = pipelineNodeRecords(context.inputs.right);
      if (right === undefined) return { ...failedResult(), message: "The join needs the records of the step it joins on its Right side." };
      earlier.set(step.with.step, right);
    }
    try {
      const outcome = await executeDataStep(step, input, earlier, pipelineNodeContext(context.inputs));
      return emptyResult({ records: outcome.records });
    } catch (error) {
      if (error instanceof PipelineError) return { ...failedResult(), message: error.message };
      throw error;
    }
  }
});
