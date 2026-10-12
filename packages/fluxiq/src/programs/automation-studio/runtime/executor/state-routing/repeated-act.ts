import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { automationStudioNodeRouteSignatures, automationStudioRouteEffectHolds } from "../../route-state/passive/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeActLasts } from "../defensive/index.ts";
import { automationStudioStateRouteSpan } from "./route-path.ts";

/**
 * A completed lasting act a backward route would repeat, and what the page
 * says of it: `on_page` when the host finds the act's recorded effect on the
 * page now, `unknown` otherwise.
 */
export type AutomationStudioRepeatedLastingAct = { nodeId: string; effect: "on_page" | "unknown" };

/**
 * The first completed lasting act a backward route from `fromNodeId` (the step
 * that cannot run) to `toNodeId` would run again, or nothing when it would
 * repeat none (C6, "Safe state routing", the second guard).
 *
 * The walk is the target and every step on some edge path from it back to the
 * failing step, the failing step left out; a target not connected to it is a
 * walk of one. A step on the walk repeats a completed lasting act when it acted
 * in this run (an attempt that succeeded and was not skipped) and its act lasts
 * (`../defensive/lasting-act.ts`), which a node that says repeating it is safe
 * never does.
 *
 * Such a route is allowed only on positive evidence that the act did not take
 * effect, and absent or unknown evidence refuses it. The host's effect check
 * (`routeEffectHolds`) is true only on positive evidence the effect is on the
 * page and says nothing when it is false, so today no answer it gives allows
 * the route: the check only says which of the two it is. A completed act
 * whose effect is on the page would be done twice; one whose effect is not
 * shown may still have landed (a cart keeps its item after the page moves on).
 */
export function automationStudioRepeatedLastingAct(input: {
  flow: AutomationStudioFlowDocument;
  fromNodeId: string;
  toNodeId: string;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  hostRuntime: AutomationStudioGraphExecutionOptions["hostRuntime"];
  observed: JsonObject;
}): AutomationStudioRepeatedLastingAct | undefined {
  const { flow, fromNodeId, toNodeId } = input;
  const walk = automationStudioStateRouteSpan(flow, toNodeId, fromNodeId);
  walk.add(toNodeId);
  walk.delete(fromNodeId);
  const completed = new Set(input.attempts.filter((attempt) => attempt.status === "succeeded" && !attempt.skipped).map((attempt) => attempt.nodeId));
  for (const node of flow.nodes) {
    if (!walk.has(node.id) || !completed.has(node.id) || !automationStudioNodeActLasts(node)) continue;
    const effect = automationStudioNodeRouteSignatures(node).effect;
    const onPage = effect !== undefined && automationStudioRouteEffectHolds(input.hostRuntime, effect, input.observed).holds;
    return { nodeId: node.id, effect: onPage ? "on_page" : "unknown" };
  }
  return undefined;
}
