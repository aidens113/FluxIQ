import { type DataPipeline, type DataPipelineInput, type DataStep } from "@fluxiq/contracts/fluxnode";
import type { ExecutableGraph } from "../../../../../flows/executable/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { readPipeline } from "../run/index.ts";
import { PIPELINE_JOIN_RIGHT_PORT, PIPELINE_NODE_TYPES, PIPELINE_SOURCE_NODE_ID } from "./node-types.ts";

type Node = ExecutableGraph["nodes"][number];
type Edge = ExecutableGraph["edges"][number];

/** A pipeline as an ordinary Flow graph, with the interface the pipeline declared. */
export type CompiledPipelineFlow = ExecutableGraph & { name: string; metadata: JsonObject };

function json(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function stepNode(step: DataStep): Node {
  if (step.kind === "map") {
    const { id, kind: _kind, input: _input, ...parameters } = step;
    return { id, definitionId: PIPELINE_NODE_TYPES.callFlow, label: `Call a Flow for each record (${id})`, parameterValues: json(parameters) };
  }
  const { id, input: _input, ...declaration } = step;
  return { id, definitionId: PIPELINE_NODE_TYPES.step, label: `${step.kind} (${id})`, parameterValues: json({ step: declaration }) };
}

/**
 * Compiles a pipeline into a Flow graph that runs in the engine like any other: one
 * node for the source, then one per step, in order, each wired to the step it reads.
 * A map becomes a Call Flow node of `CALL_FLOW_NODE_TYPE`. The flow id is
 * `pipeline.<name>`; the declared inputs and outputs go in `metadata.interface`.
 */
export function compilePipeline(definition: DataPipelineInput | DataPipeline): CompiledPipelineFlow {
  const pipeline = readPipeline(definition);
  const nodes: Node[] = [{ id: PIPELINE_SOURCE_NODE_ID, definitionId: PIPELINE_NODE_TYPES.source, label: "Load the records", parameterValues: json({ source: pipeline.source }) }];
  const edges: Edge[] = [];
  let previous = PIPELINE_SOURCE_NODE_ID;
  for (const step of pipeline.steps) {
    nodes.push(stepNode(step));
    const from = step.input ?? previous;
    edges.push({ id: `${from}->${step.id}`, sourceNodeId: from, targetNodeId: step.id });
    if (step.kind === "join" && "step" in step.with) {
      edges.push({ id: `${step.with.step}->${step.id}:${PIPELINE_JOIN_RIGHT_PORT}`, sourceNodeId: step.with.step, targetNodeId: step.id, targetPortId: PIPELINE_JOIN_RIGHT_PORT });
    }
    previous = step.id;
  }
  const declared = { ...(pipeline.inputs === undefined ? {} : { inputs: pipeline.inputs }), ...(pipeline.outputs === undefined ? {} : { outputs: pipeline.outputs }) };
  return { flowId: `pipeline.${pipeline.name}`, name: pipeline.name, nodes, edges, metadata: json({ kind: "pipeline", interface: declared }) };
}
