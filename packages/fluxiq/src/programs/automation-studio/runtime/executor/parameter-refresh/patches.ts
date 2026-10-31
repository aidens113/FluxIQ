import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioTargetRefresh } from "./refresh.ts";
import type { AutomationStudioTargetRefreshPatch } from "./patch.ts";
import { automationStudioRefreshSnapshot } from "./snapshot.ts";

/** Validates and applies an entire flat patch atomically, never accepting a host-nominated write-set. */
export function automationStudioRefreshPatches(refresh: AutomationStudioTargetRefresh, parameters: Readonly<Record<string, JsonValue>>, value: unknown): { kind: "applied"; parameters: Record<string, JsonValue>; patches: readonly AutomationStudioTargetRefreshPatch[] } | { kind: "rejected" } | { kind: "unreadable" } {
  const copied = automationStudioRefreshSnapshot(value);
  if (copied.kind !== "copied") return copied;
  if (!Array.isArray(copied.value) || !copied.value.length) return { kind: "rejected" };
  const selected = refresh.container === "output" ? parameters.parameters : parameters;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) return { kind: "rejected" };
  const target = { ...selected };
  const ids = new Set<string>();
  const patches: AutomationStudioTargetRefreshPatch[] = [];
  for (const patch of copied.value) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || typeof patch.parameterId !== "string" || !refresh.parameterIds.includes(patch.parameterId) || ["__proto__", "constructor", "prototype"].includes(patch.parameterId) || ids.has(patch.parameterId)) return { kind: "rejected" };
    ids.add(patch.parameterId);
    if (patch.operation === "set" && Object.hasOwn(patch, "value") && Object.keys(patch).every((key) => ["operation", "parameterId", "value"].includes(key))) {
      target[patch.parameterId] = patch.value!;
      patches.push({ operation: "set", parameterId: patch.parameterId, value: patch.value! });
    } else if (patch.operation === "remove" && Object.keys(patch).every((key) => ["operation", "parameterId"].includes(key)) && refresh.removableParameterIds.includes(patch.parameterId)) {
      delete target[patch.parameterId];
      patches.push({ operation: "remove", parameterId: patch.parameterId });
    } else return { kind: "rejected" };
  }
  return { kind: "applied", parameters: refresh.container === "output" ? { ...parameters, parameters: target } : target, patches };
}
