// Where a `route` disposition leads (state-aware recovery plan, C2, C5).
//
// This module owns finding a checkpoint by id in the frame executing now or a
// frame that called it, nearest first. A Route never leads into a frame that
// is not active, and only a declared checkpoint is a legal target.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFrameStack } from "../frames/index.ts";
import { type AutomationStudioSubflowCheckpoint, automationStudioSubflowContract } from "../lifecycle/index.ts";
import type { AutomationStudioLifecycleRouteTarget } from "./dispatch-contracts.ts";
import type { AutomationStudioRegisteredLifecycleGraph } from "./run-state.ts";

/**
 * The checkpoint `checkpointId` names, searched from the last frame of
 * `stack` outward through the graphs the registry holds for them, with its
 * `when` conditions and whether every `requires` name is bound -- in the
 * target frame's inputs or in that frame's values: `values` for the frame
 * executing now, `valuesOf` for a frame that called it. Nothing when no active
 * frame's graph declares it.
 */
export function automationStudioLifecycleRouteTarget(input: {
  stack: AutomationStudioFrameStack;
  graphs: ReadonlyMap<string, AutomationStudioRegisteredLifecycleGraph>;
  checkpointId: string;
  values: Readonly<Record<string, JsonValue>>;
  valuesOf?: (invocationId: string) => Readonly<Record<string, JsonValue>> | undefined;
}): { target: AutomationStudioLifecycleRouteTarget; checkpoint: AutomationStudioSubflowCheckpoint; requiresBound: boolean } | undefined {
  if (!input.checkpointId) return undefined;
  for (let depth = input.stack.length - 1; depth >= 0; depth -= 1) {
    const frame = input.stack[depth]!;
    const graph = input.graphs.get(frame.graphFlowId);
    if (!graph) continue;
    const checkpoint = automationStudioSubflowContract(graph.graph).checkpoints.find((declared) => declared.id === input.checkpointId);
    if (!checkpoint) continue;
    const values = depth === input.stack.length - 1 ? input.values : input.valuesOf?.(frame.invocationId) ?? {};
    const requiresBound = checkpoint.requires.every((name) => frame.inputs[name] !== undefined || values[name] !== undefined);
    return {
      target: { checkpointId: checkpoint.id, invocationId: frame.invocationId, graphFlowId: frame.graphFlowId, nodeId: checkpoint.nodeId },
      checkpoint,
      requiresBound
    };
  }
  return undefined;
}
