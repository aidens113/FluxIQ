// Whether a stale target's source step may be re-run to find the item again
// (t786, design D1): only a step that states it reads, or reads records out. A search submit, a
// navigation, anything that acts is never re-run for this; its lineage stands
// and the re-acquire records `unavailable`.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, automationStudioNodeMutates } from "../defensive/index.ts";

/**
 * Whether `node` is read-only: it carries Core's neutral `effect: "observe"`
 * (on its metadata, or on its parameters where a domain puts it), or it
 * declares a record output (`recordOutput`, `recordsPath`) -- the rule
 * `../defensive/node-side-effect.ts` already applies to a read whose rows are
 * carried out, which reading again cannot press -- and nothing marks it as
 * acting on the world, and the step it was built from declared no lasting
 * consequence. A node that says nothing about itself is not read-only: Core
 * cannot tell a read from a press.
 */
export function automationStudioReacquireSourceReadOnly(node: AutomationStudioFlowNode): boolean {
  const observes = node.metadata?.effect === "observe" || node.parameterValues?.effect === "observe";
  const readsRecords = [node.parameterValues?.recordOutput, node.metadata?.recordOutput, node.metadata?.recordsPath].some((declared) => declared !== undefined && declared !== null);
  if (!(observes || readsRecords) || automationStudioNodeMutates(node)) return false;
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  return !(Array.isArray(declared) && declared.some((consequence) => typeof consequence === "string" && consequence.length > 0));
}
