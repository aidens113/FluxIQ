import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { getAutomationNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioOutputReads } from "../defensive/index.ts";
import { automationStudioStateRouteOnward, automationStudioStateRouteSpan } from "./route-path.ts";

/** A value a forward route would leave unset: the skipped step that sets it, the step that reads it, and the run value path it reads. */
export type AutomationStudioUnboundSkippedValue = { producerNodeId: string; readerNodeId: string; path: string };

/**
 * The first value a forward route from `fromNodeId` (the step that cannot run)
 * to `toNodeId` would leave unset, or nothing when it leaves none (C6, "Safe
 * state routing", the first guard).
 *
 * The steps passed over are the failing step and every step on some edge path
 * from it to the route's target, the target left out. The steps that read are
 * the target and everything the run could reach from it. A read is the same
 * one a node that failed for good is judged by (`../defensive/output-reads.ts`):
 * a data edge or a state binding onto the skipped step's values. It is unset
 * when nothing in the run so far bound it: no run input, and no attempt's
 * outputs, under `${nodeId}.${outputId}` or the bare output id, as the executor
 * keys them. A value an earlier pass of the same step bound is set.
 *
 * A step with no registered definition cannot list its outputs, so only reads
 * that name it by id count for it; that is every data edge and every
 * `${nodeId}.…` binding, and only a bare output id goes unseen.
 */
export function automationStudioUnboundSkippedValue(input: {
  flow: AutomationStudioFlowDocument;
  fromNodeId: string;
  toNodeId: string;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  inputs: Readonly<Record<string, JsonValue>> | undefined;
}): AutomationStudioUnboundSkippedValue | undefined {
  const { flow, fromNodeId, toNodeId } = input;
  const passedOver = automationStudioStateRouteSpan(flow, fromNodeId, toNodeId);
  passedOver.add(fromNodeId);
  passedOver.delete(toNodeId);
  const readers = automationStudioStateRouteOnward(flow, toNodeId);
  const bound = boundPaths(input.attempts, input.inputs);
  for (const producer of flow.nodes) {
    if (!passedOver.has(producer.id)) continue;
    const outputIds = getAutomationNodeDefinition(producer.definitionId)?.outputs.map((port) => port.id) ?? [];
    const read = automationStudioOutputReads(flow, producer, outputIds, readers).find((candidate) => !isBound(candidate.path, bound));
    if (read) return { producerNodeId: producer.id, readerNodeId: read.readerNodeId, path: read.path };
  }
  return undefined;
}

/** Every run value key bound so far, as the executor writes them: run inputs, then each attempt's outputs under `${nodeId}.${key}` and `key`. */
function boundPaths(attempts: readonly AutomationStudioNodeAttemptTrace[], inputs: Readonly<Record<string, JsonValue>> | undefined): Set<string> {
  const bound = new Set(Object.keys(inputs ?? {}));
  for (const attempt of attempts) {
    for (const key of Object.keys(attempt.outputs ?? {})) {
      bound.add(`${attempt.nodeId}.${key}`);
      bound.add(key);
    }
  }
  return bound;
}

/** Whether a read path names a bound value, a part of one, or a node or value some of whose parts are bound. */
function isBound(path: string, bound: ReadonlySet<string>): boolean {
  if (bound.has(path)) return true;
  for (const key of bound) {
    if (path.startsWith(`${key}.`) || key.startsWith(`${path}.`)) return true;
  }
  return false;
}
