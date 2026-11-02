import type { ExecutableChangeProposalKind } from "../proposal/index.ts";
import { EXECUTABLE_ADAPTATION_PATCH_GATES } from "./classification.ts";

export function executableAdaptationRequiresChangeProposal(adaptation: { patch: ReadonlyArray<{ kind: ExecutableChangeProposalKind }> }): boolean {
  return adaptation.patch.some((patch) => EXECUTABLE_ADAPTATION_PATCH_GATES[patch.kind]?.requiresProposal !== false);
}
