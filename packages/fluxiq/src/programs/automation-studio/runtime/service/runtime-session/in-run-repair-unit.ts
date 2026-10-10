// Which changes an in-run repair may make (state-aware recovery plan, C12
// "Unit repair, in the run first"): a repair names one unit, the incident's,
// and Core refuses a change to any other.
//
// The executor names the incident's unit (`../../executor/lifecycle-run/`):
// the node that failed, the handler whose body failed, or the part whose
// contract it broke. What each may be changed by:
//
// - a node: its own target override, its own wait-retry, or its replacement
//   (`replace_unit`); or a new handler (`add_handler`) whose scope names that
//   node alone, or the part it runs in (`scope: subflow`). A reroute or a step
//   inserted ahead of it does not change how the node itself acts, so neither
//   can make its re-attempt pass, and neither is overlaid;
// - a handler or a part: a change whose changed unit is that unit. A new
//   handler is a unit of its own, so it is not a change to either.
//
// The patch is read twice. Before anything is asked or overlaid, what it says
// of itself: its kind, the node it targets, the unit it replaces, the scope it
// declares. After the overlay, the unit the overlay says it changed
// (`../../live-patch/overlay.ts`), which is what places a node inside a
// handler's body. The first comes before the permission gate is asked; both
// come before anything is recorded and before the executor's re-attempt, the
// fix's trial, so a refused patch never runs.

import type { AutomationStudioRepairUnit } from "../../executor/lifecycle-run/index.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimePatchUnit } from "../../llm/index.ts";

/** Why a patch is not overlaid for the incident's unit: the code a reader matches and the sentence a person reads. */
export type AutomationStudioInRunRepairUnitRefusal = { code: "other_unit" | "patch_refused"; reason: string };

/**
 * Why `patch` may not be overlaid for the `requested` unit, or undefined when
 * it may. Without `changedUnit` it reads only the patch; with it, also the unit
 * the overlay changed.
 */
export function automationStudioInRunRepairUnitRefusal(input: {
  requested: AutomationStudioRepairUnit;
  patch: AutomationStudioRuntimePatch;
  changedUnit?: AutomationStudioRuntimePatchUnit | undefined;
}): AutomationStudioInRunRepairUnitRefusal | undefined {
  const { requested, patch } = input;
  if (patch.kind === "add_handler") return handlerRefusal(requested, patch);
  if (patch.kind === "replace_unit" && !sameUnit(repairUnit(patch.unit), requested)) return OTHER_UNIT_REPLACED;
  if (requested.kind === "node") {
    const target = nodeTarget(patch);
    if (target === null) return { code: "patch_refused", reason: `The fix (${describeKind(patch.kind)}) does not change how the failing step acts, so it was not used.` };
    if (target !== undefined && target !== requested.nodeId) return OTHER_UNIT_CHANGED;
  }
  if (input.changedUnit && !sameUnit(repairUnit(input.changedUnit), requested)) return OTHER_UNIT_CHANGED;
  return undefined;
}

const OTHER_UNIT_REPLACED: AutomationStudioInRunRepairUnitRefusal = { code: "other_unit", reason: "The fix replaced a unit other than the one that failed." };
const OTHER_UNIT_CHANGED: AutomationStudioInRunRepairUnitRefusal = { code: "other_unit", reason: "The fix changed a unit other than the one that failed." };

/** A new handler serves a failing node only, scoped to that node alone or to the part it runs in. */
function handlerRefusal(requested: AutomationStudioRepairUnit, patch: Extract<AutomationStudioRuntimePatch, { kind: "add_handler" }>): AutomationStudioInRunRepairUnitRefusal | undefined {
  if (requested.kind !== "node") return { code: "other_unit", reason: "The fix added a new handler, which is a unit other than the one that failed." };
  if (patch.scope.kind === "subflow") return undefined;
  if (patch.scope.nodeIds.length && patch.scope.nodeIds.every((nodeId) => nodeId === requested.nodeId)) return undefined;
  return { code: "other_unit", reason: "The fix added a handler for steps other than the one that failed." };
}

/**
 * The node a node-level fix changes: its id for a target override, a wait-retry
 * or a node's replacement; undefined for a replaced handler or part, which the
 * unit comparison reads; null for a kind that leaves the node's own act as it was.
 */
function nodeTarget(patch: Exclude<AutomationStudioRuntimePatch, { kind: "add_handler" }>): string | null | undefined {
  if (patch.kind === "temporary_target_override" || patch.kind === "temporary_wait_retry") return patch.targetNodeId;
  if (patch.kind === "replace_unit") return patch.unit.kind === "node" ? patch.unit.nodeId : undefined;
  return null;
}

function repairUnit(unit: AutomationStudioRuntimePatchUnit): AutomationStudioRepairUnit {
  if (unit.kind === "handler") return { kind: "handler", handlerNodeId: unit.nodeId };
  return unit;
}

function sameUnit(left: AutomationStudioRepairUnit, right: AutomationStudioRepairUnit): boolean {
  if (left.kind === "node" && right.kind === "node") return left.nodeId === right.nodeId;
  if (left.kind === "handler" && right.kind === "handler") return left.handlerNodeId === right.handlerNodeId;
  return left.kind === "part" && right.kind === "part" && left.subflowId === right.subflowId;
}

function describeKind(kind: string): string {
  return kind.replace(/^temporary_/u, "").replace(/_/gu, " ");
}
