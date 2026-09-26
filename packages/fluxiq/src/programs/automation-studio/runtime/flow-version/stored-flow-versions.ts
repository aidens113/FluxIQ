import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY, type AutomationStudioFlowGraphVersion } from "./contracts.ts";

/**
 * The version set a session or a run detail is carrying, read back.
 *
 * Strict about what it accepts and silent about what it does not: an entry with
 * no `graphFlowId` names no graph and is dropped, and a `revision` that is not
 * a whole number of at least one reads as `null` rather than as itself. A run
 * recorded before this existed carries no key at all and reads as the empty
 * set, which is why nothing downstream may treat an empty set as a statement
 * that the run executed no graph.
 */
export function automationStudioFlowVersionsFromMetadata(metadata: JsonObject | undefined): AutomationStudioFlowGraphVersion[] {
  const stored = metadata?.[AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY];
  if (!Array.isArray(stored)) return [];
  const versions: AutomationStudioFlowGraphVersion[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const graphFlowId = typeof record.graphFlowId === "string" ? record.graphFlowId.trim() : "";
    if (!graphFlowId) continue;
    const raw = record.revision;
    const revision = typeof raw === "number" && Number.isFinite(raw) && Math.trunc(raw) >= 1 ? Math.trunc(raw) : null;
    const subflowId = typeof record.subflowId === "string" && record.subflowId.trim() ? record.subflowId.trim() : undefined;
    versions.push({ graphFlowId, revision, ...(subflowId ? { subflowId } : {}) });
  }
  return versions;
}
