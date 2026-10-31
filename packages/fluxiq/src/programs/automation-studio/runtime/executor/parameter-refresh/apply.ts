import { isDeepStrictEqual } from "node:util";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioParameterRefreshOverlay } from "./overlay.ts";
import { automationStudioRefreshPatches } from "./patches.ts";
import { automationStudioRefreshSnapshot } from "./snapshot.ts";

/** A later lifecycle binding change invalidates the old identity overlay, never the new binding. */
export function automationStudioApplyParameterRefresh(node: AutomationStudioFlowNode, parameters: Record<string, JsonValue>, overlay: AutomationStudioParameterRefreshOverlay): { kind: "applied"; parameters: Record<string, JsonValue> } | { kind: "rejected"; reason: "binding_changed" } | { kind: "unreadable"; reason: "parameters_unreadable" } {
  if (!overlay.active || node.id !== overlay.nodeId || node.definitionId !== overlay.definitionId || node.definitionVersion !== overlay.definitionVersion) return { kind: "rejected", reason: "binding_changed" };
  const current = automationStudioRefreshSnapshot(parameters);
  if (current.kind !== "copied") {
    overlay.active = false;
    return { kind: "unreadable", reason: "parameters_unreadable" };
  }
  const saved = overlay.baseline;
  const record = current.value as Record<string, JsonValue>;
  const source = overlay.refresh.container === "output" ? record.parameters : record;
  const baseline = overlay.refresh.container === "output" ? saved.parameters : saved;
  if (!source || typeof source !== "object" || Array.isArray(source) || !baseline || typeof baseline !== "object" || Array.isArray(baseline) || (overlay.refresh.container === "output" && !isDeepStrictEqual(record.outputId, saved.outputId)) || overlay.refresh.parameterIds.some((id) => Object.hasOwn(source, id) !== Object.hasOwn(baseline, id) || !isDeepStrictEqual(source[id], baseline[id]))) {
    overlay.active = false;
    return { kind: "rejected", reason: "binding_changed" };
  }
  const applied = automationStudioRefreshPatches(overlay.refresh, record, overlay.patches);
  if (applied.kind === "applied") return { kind: "applied", parameters: applied.parameters };
  overlay.active = false;
  return applied.kind === "unreadable" ? { kind: "unreadable", reason: "parameters_unreadable" } : { kind: "rejected", reason: "binding_changed" };
}
