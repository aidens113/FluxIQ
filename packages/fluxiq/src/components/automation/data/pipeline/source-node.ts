import { dataPipelineSourceSchema, type DataPipeline } from "@fluxiq/contracts/fluxnode";
import { PipelineError, loadPipelineSource } from "../../../../framework/automation-service/service/pipelines/index.ts";
import { defineBuiltinNode, emptyResult, failedResult } from "../../shared/index.ts";
import { pipelineNodeContext } from "./node-context.ts";

/** The first records of a compiled data pipeline (`PIPELINE_NODE_TYPES.source`): its source, read as the direct runner reads it. */
export const pipelineSourceNode = defineBuiltinNode({
  id: "builtin.data.pipeline-source",
  label: "Load Records",
  description: "The first records of a data pipeline: a dataset, an input list, or the records a Flow gives.",
  class: "data",
  scope: "both",
  inputs: [],
  outputs: [{ id: "records", label: "Records", valueType: "array", role: "data" }],
  parameters: [{ id: "source", label: "Source", description: "Where the records come from, as the pipeline declared it.", valueType: "json", required: true, allowStateBinding: false }],
  icon: "database",
  tags: ["pipeline"],
  execute: async (context) => {
    const source = dataPipelineSourceSchema.safeParse(context.parameters.source);
    if (!source.success) return { ...failedResult(), message: `The pipeline source is not valid: ${source.error.issues[0]?.message ?? ""}` };
    try {
      const records = await loadPipelineSource({ source: source.data } as DataPipeline, pipelineNodeContext(context.inputs));
      return emptyResult({ records });
    } catch (error) {
      if (error instanceof PipelineError) return { ...failedResult(), message: error.message };
      throw error;
    }
  }
});
