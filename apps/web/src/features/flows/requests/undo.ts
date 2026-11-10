import type { GraphOperation } from "../wire";

/**
 * `undo-flow-edit`'s payload: the undo edits a saved change returned, made against the version
 * that change was saved as. If the Flow moved on since, the answer is a conflict, not a blind undo.
 */
export function undoPayload(flow: { projectId: string; flowId: string }, saved: { revision: number; inverseOperations: readonly GraphOperation[] }): Record<string, unknown> {
  return {
    projectId: flow.projectId,
    flowId: flow.flowId,
    baseRevision: saved.revision,
    inverseOperations: [...saved.inverseOperations],
    message: `Undid the change saved as version ${saved.revision}`
  };
}
