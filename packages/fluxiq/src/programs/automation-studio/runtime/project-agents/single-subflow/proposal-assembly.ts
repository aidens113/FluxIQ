import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectAssembleLatest, type AutomationStudioProjectAssembledLatest, type AutomationStudioProjectAssembleLatestInput } from "./assemble-latest.ts";

// A single-subflow plan's whole Flow assembled from one proposal of its one
// subflow (t679; trace plan P5): the proposal in hand, named as its brief made
// it, joined behind the arrival step by the one assembly `project.assemble`
// uses (`./assemble-latest.ts`) and submitted through the whole candidate's
// controller, under the summary a builder's test gives it. A builder's
// single-subflow test (`./single-subflow-trial.ts`) and a rebuild of a
// submitted script (`./rebuild.ts`) both call this, so the Flow a rebuild
// reproduces is the Flow the test judged.

/** What the single-subflow assembly works with: the supervisor's plan, ports, controller and gate, and the proposal under test with its brief's scope. */
export type AutomationStudioProjectSingleSubflowAssembleInput = Omit<AutomationStudioProjectAssembleLatestInput, "from" | "inHand" | "summary"> & {
  /** The brief's scope the proposal was made under: its subflow, brief and what runs before it. */
  scope: Pick<AutomationStudioSubflowScope, "subflowKey" | "briefId" | "predecessors">;
  /** The proposal under test, read in place of the proposals port. */
  proposal: Readonly<AutomationStudioSubflowProposal>;
};

/**
 * Assembles the single-subflow plan's whole Flow from `proposal` and submits it
 * through `controller`, exactly as a builder's single-subflow test does; the
 * answer is `automationStudioProjectAssembleLatest`'s.
 */
export async function automationStudioProjectSingleSubflowAssemble(input: AutomationStudioProjectSingleSubflowAssembleInput): Promise<AutomationStudioProjectAssembledLatest> {
  const { scope, proposal, ...assembly } = input;
  return await automationStudioProjectAssembleLatest({
    ...assembly,
    inHand: proposal,
    from: [{ subflowKey: scope.subflowKey, briefId: scope.briefId, revision: proposal.revision, digest: proposal.digest, predecessors: scope.predecessors }],
    summary: `A Flow of one subflow, ${scope.subflowKey}, assembled from its builder's proposal under test.`
  });
}
