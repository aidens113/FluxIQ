import { dataPipelineSourceSchema, dataStepSchema, validateJsonValue, type DataPipeline, type DataStep, type JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import { isJsonObject } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import { PipelineRejectedError } from "../rejected-error.ts";
import { executeDataStep, loadPipelineSource, type PipelineRunOutcome } from "../run/index.ts";
import type { DatasetRef } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import type { CompiledPipelineFlow } from "./compile-pipeline.ts";
import { PIPELINE_JOIN_RIGHT_PORT, PIPELINE_NODE_TYPES, PIPELINE_SOURCE_NODE_ID } from "./node-types.ts";

type Node = CompiledPipelineFlow["nodes"][number];

/** Reads the step a compiled node carries back into its declaration, and checks it again. */
export function stepOfNode(node: Node, input: string | undefined): DataStep {
  const values = node.parameterValues ?? {};
  const draft: unknown = node.definitionId === PIPELINE_NODE_TYPES.callFlow ? { ...values, id: node.id, kind: "map" } : { ...(isJsonObject(values["step"]) ? values["step"] : {}), id: node.id };
  const parsed = dataStepSchema.safeParse(input === undefined ? draft : { ...(draft as JsonObject), input });
  if (!parsed.success) throw new PipelineError("pipeline.bad_node", `Node "${node.id}" does not carry a valid step: ${parsed.error.issues[0]?.message ?? ""}`, node.id);
  return parsed.data;
}

/**
 * Runs a compiled pipeline Flow node by node, in the order the compiler wrote them.
 * This is what the engine does with the graph: the source node loads the records,
 * each later node runs the step it carries on the records of the node wired to it
 * (a join takes its right side from the node on its `right` port). It uses the same
 * step executors as `runPipeline`, so both give the same records on the same input.
 */
export async function runCompiledPipelineFlow(flow: CompiledPipelineFlow, context: PipelineRunContext): Promise<PipelineRunOutcome> {
  const source = flow.nodes.find((node) => node.id === PIPELINE_SOURCE_NODE_ID);
  if (source === undefined || source.definitionId !== PIPELINE_NODE_TYPES.source) throw new PipelineError("pipeline.bad_flow", "The Flow has no pipeline source node.");
  const parsedSource = dataPipelineSourceSchema.safeParse(source.parameterValues?.["source"]);
  if (!parsedSource.success) throw new PipelineError("pipeline.bad_node", `The source node is not valid: ${parsedSource.error.issues[0]?.message ?? ""}`, source.id);
  const declared = isJsonObject(flow.metadata["interface"]) ? flow.metadata["interface"] : {};
  const inputs = declared["inputs"] as JsonTypeSchema | undefined;
  const outputs = declared["outputs"] as JsonTypeSchema | undefined;
  if (inputs !== undefined) {
    const errors = validateJsonValue(inputs, context.inputs);
    if (errors.length > 0) throw new PipelineError("pipeline.bad_inputs", `The inputs do not fit the pipeline at "${errors[0]?.path}": ${errors[0]?.message}`);
  }
  const loaded = await loadPipelineSource({ source: parsedSource.data } as DataPipeline, context);
  const produced = new Map<string, PipelineRecord[]>([[PIPELINE_SOURCE_NODE_ID, loaded]]);
  const datasets: DatasetRef[] = [];
  const counts: Record<string, number> = {};
  let last = loaded;
  for (const node of flow.nodes) {
    if (node.id === PIPELINE_SOURCE_NODE_ID) continue;
    const incoming = flow.edges.filter((edge) => edge.targetNodeId === node.id);
    const main = incoming.find((edge) => edge.targetPortId === undefined);
    const input = main === undefined ? undefined : produced.get(main.sourceNodeId);
    if (main === undefined || input === undefined) throw new PipelineError("pipeline.bad_flow", `Node "${node.id}" reads a node that has not run.`, node.id);
    const right = incoming.find((edge) => edge.targetPortId === PIPELINE_JOIN_RIGHT_PORT);
    const step = stepOfNode(node, undefined);
    const withStep = step.kind === "join" && right !== undefined ? { ...step, with: { step: right.sourceNodeId } } : step;
    const outcome = await executeDataStep(withStep, input, produced, context);
    produced.set(node.id, outcome.records);
    counts[node.id] = outcome.records.length;
    last = outcome.records;
    if (outcome.dataset !== undefined) datasets.push(outcome.dataset);
  }
  if (outputs !== undefined) {
    const problems = last.flatMap((record, index) => validateJsonValue(outputs, record.data).map((error) => ({ index, path: error.path, message: error.message })));
    if (problems.length > 0) throw new PipelineRejectedError("outputs", problems);
  }
  return { records: last, datasets, counts };
}
