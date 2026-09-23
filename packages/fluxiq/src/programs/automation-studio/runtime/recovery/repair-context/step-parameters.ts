// The chain of steps the run actually took, each with what it ran with and
// what it produced.
//
// `recent_nodes` already lists the nodes that succeeded, and the packet's own
// `recentActions` lists the last twelve attempts -- both as identity alone:
// node id, definition id, order, status. That is enough to say *which* step
// went wrong and never enough to say *what about it* was wrong. A Flow that
// extracted the wrong column, filtered on the wrong control, or navigated to
// the wrong place looks, in those two lists, exactly like a Flow that did
// everything right.
//
// So this carries the same chain with two things added to each link: the
// parameters the step ran with, screened by `parameter-screen.ts`, and the
// result it produced -- its route, its comparison verdict, the rows it stored,
// how long it took. The result half is read off the persisted run record, which
// already holds every field here; nothing new is captured for it.
//
// The parameters are the Flow's authored ones, joined to the attempt by node
// id. `parameter-screen.ts` says why the run's resolved values are not used and
// could not be: they are not recorded anywhere.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type {
  AutomationStudioFlowDocument,
  AutomationStudioFlowRunActionAttemptRecord
} from "../../../model/index.ts";
import { automationStudioScreenedNodeParameters } from "./parameter-screen.ts";

/** How many steps the section carries, newest last. The same bound the packet's own recent-action list uses. */
export const AUTOMATION_STUDIO_REPAIR_CONTEXT_MAX_STEPS = 12;

const MAX_LABEL_LENGTH = 80;

/**
 * The step chain, or nothing when the run recorded no attempt.
 *
 * `deniedKeys` is the bound domain's declaration. It is required rather than
 * optional for the reason the packet builder refuses an undeclared evidence
 * slot: an absent declaration means nobody said what this medium's raw payload
 * is called, and a projection of a node's parameters is exactly where that
 * would matter. A caller with no declaration builds no section at all.
 */
export function automationStudioStepParametersSection(input: {
  attempts: readonly AutomationStudioFlowRunActionAttemptRecord[];
  flow?: AutomationStudioFlowDocument | undefined;
  deniedKeys: readonly string[];
}): JsonObject | undefined {
  if (!input.attempts.length) return undefined;
  const authored = new Map((input.flow?.nodes ?? []).map((node) => [node.id, node]));
  const carried = input.attempts.slice(-AUTOMATION_STUDIO_REPAIR_CONTEXT_MAX_STEPS);
  const steps = carried.map((attempt) => {
    const node = authored.get(attempt.nodeId);
    const screened = node?.parameterValues
      ? automationStudioScreenedNodeParameters(node.parameterValues, input.deniedKeys)
      : undefined;
    const recordCount = attempt.metadata?.recordCount;
    const failure = parseAutomationStudioFailureRecord(attempt.failure);
    return compact({
      order: attempt.order,
      nodeId: attempt.nodeId,
      definitionId: attempt.definitionId,
      ...(node?.label ? { label: node.label.slice(0, MAX_LABEL_LENGTH) } : {}),
      status: attempt.status,
      ...(attempt.route ? { route: attempt.route } : {}),
      ...(attempt.comparisonStatus ? { comparisonStatus: attempt.comparisonStatus } : {}),
      ...(typeof recordCount === "number" ? { recordCount } : {}),
      ...(typeof attempt.durationMs === "number" ? { durationMs: attempt.durationMs } : {}),
      ...(failure ? { failureCategory: failure.category, failureCode: failure.code } : {}),
      // What the step ran with. An authored node with no parameters at all
      // carries neither key: "this step takes none" and "this step's were
      // screened out" are different facts and the second is `parametersWithheld`.
      ...(screened && Object.keys(screened.values).length ? { parameters: screened.values } : {}),
      ...(screened?.withheld.length ? { parametersWithheld: screened.withheld } : {}),
      // Which output ports the step produced, and how many rows each list held.
      // Names and counts, never a value: `conversions.ts` builds it that way.
      // Screened here rather than there, because the port ids are a domain's
      // and only here is that domain's declaration in reach.
      ...(outputShape(attempt.metadata?.outputShape, input.deniedKeys) ?? {})
    });
  });
  return {
    steps,
    ...(input.attempts.length > steps.length ? { earlierStepCount: input.attempts.length - steps.length } : {}),
    // Said plainly rather than inferred from an absent key: a Flow that could
    // not be read and a Flow whose steps authored no parameters must not look
    // alike to a repair that is about to rewrite one of them.
    ...(input.flow ? {} : { flowUnavailable: true })
  };
}

/** The step's outputs, with any port id the domain denies removed. */
function outputShape(value: JsonValue | undefined, deniedKeys: readonly string[]): { outputShape: JsonObject } | undefined {
  if (!isJsonRecord(value)) return undefined;
  const screened = automationStudioScreenedNodeParameters(value, deniedKeys).values;
  return Object.keys(screened).length ? { outputShape: screened } : undefined;
}

function compact(fields: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as JsonObject;
}

function isJsonRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
