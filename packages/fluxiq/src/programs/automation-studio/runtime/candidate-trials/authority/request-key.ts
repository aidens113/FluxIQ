import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";

export function candidateTrialRequestKey(candidateId: string, candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest" | "baseDependencyDigest">, value: JsonObject): string {
  return JSON.stringify([candidateId, candidate.revision, candidate.digest, candidate.baseDependencyDigest, value.cannotUndo === undefined ? null : value.cannotUndo]);
}
