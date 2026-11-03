import type { AutomationStudioFlowGraphVersion, AutomationStudioVersionedFlowDocument } from "./contracts.ts";

/**
 * The version of one graph Flow a run was handed, read off the document the
 * executor actually received.
 *
 * `materializeCanonicalGraphFlow` stamps `metadata.graphRevision` on every
 * document it materializes from the graph chain, so the number is already in
 * hand at the moment the executor is given a graph and nothing new is read
 * here. That is deliberate: a second read could answer differently from the one
 * the run used, and a version set that names a revision the run did not execute
 * is worse than none.
 *
 * A document with no `graphRevision` has no chain yet, and is recorded with
 * `revision: null`. Zero is never written: revision numbers start at 1, so a
 * zero would be a number claiming to be a version.
 */
export function automationStudioFlowGraphVersion(
  input: { flow: AutomationStudioVersionedFlowDocument; subflowId?: string | undefined }
): AutomationStudioFlowGraphVersion {
  const raw = input.flow.metadata?.graphRevision;
  const revision = typeof raw === "number" && Number.isFinite(raw) && Math.trunc(raw) >= 1 ? Math.trunc(raw) : null;
  return { graphFlowId: input.flow.flowId, revision, ...(input.subflowId ? { subflowId: input.subflowId } : {}) };
}
