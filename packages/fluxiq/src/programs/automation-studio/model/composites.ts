import type { AutomationStudioFlowArtifact } from "./flows.ts";
import { captureExecutableFlowSnapshot, type ExecutableFlowSnapshot } from "../../../flows/executable/composite/index.ts";

/** Publication/display metadata around independently executable snapshot content. */
export type AutomationStudioPublishedFlowSnapshot = ExecutableFlowSnapshot & {
  schemaVersion: "0.1";
  name: string;
  description?: string;
  publishedAt: number;
  publishedBy?: string;
  changelog?: string;
};

export type AutomationStudioFlowPublicationRecord = {
  schemaVersion: "0.1";
  publicationId: string;
  projectId: string;
  flowId: string;
  version: string;
  status: "published" | "deprecated";
  snapshot: AutomationStudioPublishedFlowSnapshot;
  createdAt: number;
  deprecatedAt?: number;
  deprecationReason?: string;
};

export type { AutomationStudioCallFlowTarget, AutomationStudioCallFlowBinding, AutomationStudioCallFlowConfiguration } from "../../../flows/executable/composite/index.ts";
export { getCallFlowConfiguration, compositeNodeDefinitionId, createCallFlowNode, validateFlowComposition } from "../../../flows/executable/composite/index.ts";
export { projectPublishedFlowSnapshotToNodeDefinition } from "../../../components/automation/composite/index.ts";

/** Adds only Studio publication/display metadata to the captured executable snapshot. */
export function createPublishedFlowSnapshot(flow: AutomationStudioFlowArtifact, version: string, publishedAt = Date.now(), metadata: { publishedBy?: string; changelog?: string; dependencyDigests?: Map<string, string>; requiredRuntimeCapabilities?: Iterable<string> } = {}): AutomationStudioPublishedFlowSnapshot {
  const snapshot = captureExecutableFlowSnapshot(flow, version, metadata);
  return { schemaVersion: "0.1", ...snapshot, name: flow.name, ...(flow.description ? { description: flow.description } : {}), publishedAt, ...(metadata.publishedBy ? { publishedBy: metadata.publishedBy } : {}), ...(metadata.changelog ? { changelog: metadata.changelog } : {}) };
}
