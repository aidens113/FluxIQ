/**
 * `restore-graph-snapshot`'s payload. A restore is saved as a new version and every version stays
 * in the history, so it is not destructive and needs no grant. `mutationId` makes a second press
 * of the same request restore once.
 */
export function restorePayload(flow: { projectId: string; flowId: string }, version: { revisionNumber: number; snapshotSha256: string }, mutationId: string): Record<string, unknown> {
  return {
    projectId: flow.projectId,
    flowId: flow.flowId,
    snapshotSha256: version.snapshotSha256,
    mutationId,
    message: `Restored version ${version.revisionNumber}`
  };
}
