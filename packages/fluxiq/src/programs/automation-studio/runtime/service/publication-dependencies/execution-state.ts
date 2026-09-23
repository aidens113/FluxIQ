import type { JsonObject } from "../../../../../core/index.ts";
import { getCallFlowConfiguration, validateFlowComposition, type AutomationStudioFlowArtifact, type AutomationStudioFlowPublicationRecord, type AutomationStudioPublishedFlowSnapshot } from "../../../model/index.ts";

// The publication dependency state an execution reports: which published Flows
// the roots reach, which targets are missing, and whether each document still
// composes.

export function executionPublicationDependencyState(
  roots: AutomationStudioFlowArtifact[],
  records: AutomationStudioFlowPublicationRecord[]
): JsonObject {
  const byTarget = new Map(records.map((record) => [`${record.flowId}@${record.version}`, record]));
  const pending = roots.flatMap((root) => root.nodes.flatMap((node) => {
    const call = getCallFlowConfiguration(node);
    return call ? [`${call.target.flowId}@${call.target.version}`] : [];
  }));
  const visited = new Set<string>();
  const missingTargets = new Set<string>();
  const reachable: AutomationStudioFlowPublicationRecord[] = [];
  while (pending.length) {
    const target = pending.pop()!;
    if (visited.has(target)) continue;
    visited.add(target);
    const record = byTarget.get(target);
    if (!record) {
      missingTargets.add(target);
      continue;
    }
    reachable.push(record);
    for (const node of record.snapshot.nodes) {
      const call = getCallFlowConfiguration(node);
      if (call) pending.push(`${call.target.flowId}@${call.target.version}`);
    }
  }
  reachable.sort((left, right) => left.publicationId.localeCompare(right.publicationId));
  const allSnapshots = records.map((record) => record.snapshot);
  const deprecatedPublicationIds = records
    .filter((record) => record.status === "deprecated")
    .map((record) => `${record.flowId}@${record.version}`)
    .sort();
  const validationDocuments: Array<AutomationStudioFlowArtifact | AutomationStudioPublishedFlowSnapshot> = [
    ...roots,
    ...reachable.map((record) => record.snapshot)
  ];
  const compositionValidity = validationDocuments
    .map((document) => {
      const result = validateFlowComposition({
        flow: document as AutomationStudioFlowArtifact,
        publishedSnapshots: allSnapshots,
        deprecatedPublicationIds,
        authorizedDomainIds: []
      });
      return {
        documentId: "version" in document ? `${document.flowId}@${document.version}` : `${document.flowId}@draft`,
        ok: result.ok,
        issues: result.issues.map((issue) => ({ severity: issue.severity, code: issue.code, path: issue.path }))
      };
    })
    .sort((left, right) => left.documentId.localeCompare(right.documentId));
  return {
    reachablePublications: reachable.map((record) => ({
      publicationId: record.publicationId,
      projectId: record.projectId,
      flowId: record.flowId,
      version: record.version,
      status: record.status,
      snapshot: record.snapshot as unknown as JsonObject
    })),
    missingTargets: [...missingTargets].sort(),
    compositionValidity
  } as unknown as JsonObject;
}
