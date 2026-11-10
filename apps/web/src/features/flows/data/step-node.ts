import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, textOf } from "../../home/model";

/** One step's node as stored: what it is and what it is given. */
export type StepNode = { definitionId: string; parameterValues: Record<string, unknown> };

/**
 * The node a step is about, read on its own (the canvas endpoint pins it whatever the view).
 * The outline says what a step does, not what values it holds, so the values panel reads them
 * here. Throws when the node cannot be read.
 */
export async function loadStepNode(studio: ProgramCommandTransport, flow: { projectId: string; flowId: string }, nodeId: string, signal: AbortSignal): Promise<StepNode> {
  const answer = await studio.post("get-graph-viewport", { ...flow, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, limit: 1, pinnedNodeIds: [nodeId] }, { signal });
  const nodes = answer.ok ? asRecord(asRecord(answer.payload)?.page)?.nodes : undefined;
  const node = Array.isArray(nodes) ? nodes.map(asRecord).find((row) => row?.nodeId === nodeId) : undefined;
  const definitionId = textOf(node?.definitionId);
  const parameterValues = asRecord(node?.parameterValues);
  if (!definitionId || !parameterValues) throw new Error(answer.error ?? "This step's values could not be read.");
  return { definitionId, parameterValues };
}
