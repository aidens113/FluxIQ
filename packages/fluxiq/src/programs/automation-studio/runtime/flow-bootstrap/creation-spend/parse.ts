// A Flow creation's spend read back from storage.
import { AUTOMATION_STUDIO_FLOW_SPEND_PHASES } from "./phases.ts";
import type { AutomationStudioFlowBootstrapCreationSpend, AutomationStudioFlowSpendItem, AutomationStudioFlowSpendPhase } from "./record.ts";

/**
 * The record, or `null` for anything that is not one written for this Flow.
 *
 * A damaged or edited record is refused whole. `null` is not an error: the
 * build opens its purse with nothing carried, as before the record existed.
 * An itemised record carries `calls` and `byPhase` together, every phase
 * present with a whole call count and a finite, non-negative charge.
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
  if ((value.calls === undefined) !== (value.byPhase === undefined)) return null;
  if (value.calls !== undefined && !wholeCount(value.calls)) return null;
  const byPhase = value.byPhase === undefined ? undefined : parseByPhase(value.byPhase);
  if (byPhase === null) return null;
  return {
    kind: "flow_creation_spend",
    projectId: owner.projectId,
    flowId: owner.flowId,
    spentUsd: value.spentUsd,
    builds: value.builds as number,
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
    ...(byPhase ? { calls: value.calls as number, byPhase } : {})
  };
}

function parseByPhase(value: unknown): Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem> | null {
  if (!isRecord(value)) return null;
  const read: Partial<Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>> = {};
  for (const phase of AUTOMATION_STUDIO_FLOW_SPEND_PHASES) {
    const item = value[phase];
    if (!isRecord(item) || !wholeCount(item.calls) || typeof item.usd !== "number" || !Number.isFinite(item.usd) || item.usd < 0) return null;
    read[phase] = { calls: item.calls, usd: item.usd };
  }
  return read as Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>;
}

function wholeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
