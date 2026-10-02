// A Flow creation's spend read back from storage.
import type { AutomationStudioFlowBootstrapCreationSpend } from "./record.ts";

/**
 * The record, or `null` for anything that is not one written for this Flow.
 *
 * A damaged or edited record is refused whole. `null` is not an error: the
 * build opens its purse with nothing carried, as before the record existed.
 */
export function parseAutomationStudioFlowBootstrapCreationSpend(
  value: unknown,
  owner: { projectId: string; flowId: string }
): AutomationStudioFlowBootstrapCreationSpend | null {
  if (!isRecord(value) || value.kind !== "flow_creation_spend") return null;
  if (value.projectId !== owner.projectId || value.flowId !== owner.flowId) return null;
  if (typeof value.spentUsd !== "number" || !Number.isFinite(value.spentUsd) || value.spentUsd < 0) return null;
  if (!Number.isSafeInteger(value.builds) || (value.builds as number) < 1) return null;
  if (!Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt)) return null;
  return {
    kind: "flow_creation_spend",
    projectId: owner.projectId,
    flowId: owner.flowId,
    spentUsd: value.spentUsd,
    builds: value.builds as number,
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
