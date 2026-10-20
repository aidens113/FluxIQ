// A Flow creation's spend read back from storage.
import { AUTOMATION_STUDIO_FLOW_SPEND_PHASES } from "./phases.ts";
import type { AutomationStudioFlowBootstrapCreationSpend, AutomationStudioFlowSpendItem, AutomationStudioFlowSpendPhase } from "./record.ts";

/** An agent role as the step log writes `role`: an identifier, never free text. */
const ROLE = /^[a-z][a-z0-9_-]{0,63}$/u;

/**
 * The record, or `null` for anything that is not one written for this Flow.
 *
 * A damaged or edited record is refused whole. `null` is not an error: the
 * build opens its purse with nothing carried, as before the record existed.
 * An itemised record carries `calls` and `byPhase` together, every phase
 * present with a whole call count and a finite, non-negative charge. Its
 * `largestInputTokens` is a whole count or `null`, and `byRole` maps role
 * names to items of the same kind or is `null`; both read as `null` where the
 * record does not hold them (one written before they were kept), and neither
 * may be non-null on a record that is not itemised.
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
  const largestInputTokens = wholeCount(value.largestInputTokens) ? value.largestInputTokens : null;
  if (largestInputTokens === null && value.largestInputTokens !== undefined && value.largestInputTokens !== null) return null;
  const byRole = value.byRole === undefined || value.byRole === null ? null : parseByRole(value.byRole);
  if (byRole === undefined) return null;
  if (!byPhase && (largestInputTokens !== null || byRole !== null)) return null;
  return {
    kind: "flow_creation_spend",
    projectId: owner.projectId,
    flowId: owner.flowId,
    spentUsd: value.spentUsd,
    builds: value.builds as number,
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
    ...(byPhase ? { calls: value.calls as number, byPhase } : {}),
    largestInputTokens,
    byRole
  };
}

/** The role tallies, or `undefined` when any key is not a role name or any item is malformed. */
function parseByRole(value: unknown): Record<string, AutomationStudioFlowSpendItem> | undefined {
  if (!isRecord(value)) return undefined;
  const read: Record<string, AutomationStudioFlowSpendItem> = {};
  for (const [role, item] of Object.entries(value)) {
    if (!ROLE.test(role)) return undefined;
    const parsed = parseItem(item);
    if (!parsed) return undefined;
    read[role] = parsed;
  }
  return read;
}

function parseByPhase(value: unknown): Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem> | null {
  if (!isRecord(value)) return null;
  const read: Partial<Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>> = {};
  for (const phase of AUTOMATION_STUDIO_FLOW_SPEND_PHASES) {
    const item = parseItem(value[phase]);
    if (!item) return null;
    read[phase] = item;
  }
  return read as Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>;
}

function parseItem(item: unknown): AutomationStudioFlowSpendItem | null {
  if (!isRecord(item) || !wholeCount(item.calls) || typeof item.usd !== "number" || !Number.isFinite(item.usd) || item.usd < 0) return null;
  return { calls: item.calls, usd: item.usd };
}

function wholeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
