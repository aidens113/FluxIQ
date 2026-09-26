import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY, type AutomationStudioFlowGraphVersion } from "./contracts.ts";

/**
 * Metadata with the run's version set written onto it, for the runtime session
 * and, through the session projection, for the run detail a reader gets back.
 *
 * An empty set writes nothing. A run with no canonical Flow executed no graph
 * Flow at all -- a bare document handed straight to the executor -- and writing
 * an empty array there would claim a version set was computed and found empty,
 * which is not the same as there being no graph to version.
 */
export function automationStudioMetadataWithFlowVersions(
  metadata: JsonObject | undefined,
  versions: readonly AutomationStudioFlowGraphVersion[]
): JsonObject {
  if (!versions.length) return { ...(metadata ?? {}) };
  const written: JsonValue = versions.map((version) => ({
    graphFlowId: version.graphFlowId,
    revision: version.revision,
    ...(version.subflowId ? { subflowId: version.subflowId } : {})
  }));
  return { ...(metadata ?? {}), [AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY]: written };
}
