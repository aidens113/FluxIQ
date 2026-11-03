import type { AutomationStudioFlowArtifact } from "../flow/index.ts";
import type { AutomationStudioPublishedFlowSnapshot } from "./index.ts";
import { captureExecutableFlowSnapshot } from "../../executable/composite/index.ts";

/** Adds only Studio publication/display metadata to the captured executable snapshot. */
export function createPublishedFlowSnapshot(flow: AutomationStudioFlowArtifact, version: string, publishedAt = Date.now(), metadata: { publishedBy?: string; changelog?: string; dependencyDigests?: Map<string, string>; requiredRuntimeCapabilities?: Iterable<string> } = {}): AutomationStudioPublishedFlowSnapshot {
  const snapshot = captureExecutableFlowSnapshot(flow, version, metadata);
  return { schemaVersion: "0.1", ...snapshot, name: flow.name, ...(flow.description ? { description: flow.description } : {}), publishedAt, ...(metadata.publishedBy ? { publishedBy: metadata.publishedBy } : {}), ...(metadata.changelog ? { changelog: metadata.changelog } : {}) };
}
