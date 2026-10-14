import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectProposalRef } from "../../project-agents/index.ts";

// The subflow proposals a project build's builders had tried (unit A5c), read
// off the subflow trial port as each trial ran. A done return names its
// proposal by brief, revision and digest -- always one its trial answered yes
// for -- and the supervisor's assembly asks for it by that name; a subflow's
// partial trial runs its predecessors' latest passing proposals to reach its
// entry, and so does a dependent builder before its first look
// (`./entry-preparation.ts`, t580).

const key = (briefId: string, revision: number, digest: string): string => JSON.stringify([briefId, revision, digest]);

export class AutomationStudioProjectBuildProposals {
  private readonly tried = new Map<string, AutomationStudioSubflowProposal>();
  /** The latest proposal of each subflow whose trial answered yes, by subflow key. */
  private readonly passed = new Map<string, AutomationStudioSubflowProposal>();

  /** A trial of `proposal` under `scope` answered `verdict`. */
  trialled(scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>, verdict: AutomationStudioCandidateTrialVerdict): void {
    const kept = structuredClone(proposal) as AutomationStudioSubflowProposal;
    this.tried.set(key(scope.briefId, proposal.revision, proposal.digest), kept);
    if (verdict === "yes") this.passed.set(scope.subflowKey, kept);
  }

  /** The proposal a return names, or undefined when no trial ran it. */
  byRef(ref: AutomationStudioProjectProposalRef): AutomationStudioSubflowProposal | undefined {
    const found = this.tried.get(key(ref.briefId, ref.revision, ref.digest));
    return found ? structuredClone(found) : undefined;
  }

  /** The latest passing proposal of each predecessor `scope` names, in its order; one that has none is left out, and the trial says the entry was not prepared. */
  predecessors(scope: AutomationStudioSubflowScope): AutomationStudioSubflowProposal[] {
    return scope.predecessors.flatMap((subflowKey) => {
      const found = this.passed.get(subflowKey);
      return found ? [structuredClone(found)] : [];
    });
  }
}
