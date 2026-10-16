import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioArrivalPlanNode } from "../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";
import type { AutomationStudioProjectAssembled, AutomationStudioProjectAssemblyIssue, AutomationStudioProjectSupervisorPorts } from "../supervisor/index.ts";
// The value from its owner, not the supervisor's barrel, whose loop imports this module back (a module cycle).
import { automationStudioProjectAssembly } from "../supervisor/assembly.ts";
import { AutomationStudioProjectAssembledFrom, type AutomationStudioProjectAssembledProposal } from "./assembled-from.ts";
import { automationStudioProjectSingleSubflowPlan } from "./single-subflow-plan.ts";

// The one assembly a project build has (t679): each subflow's proposal read
// whole through the proposals port by the name it is given (a proposal that is
// not the one named counts as none), composed into one plan
// (`../supervisor/assembly.ts`), and submitted through the whole candidate's
// controller as a composed submission
// (`AutomationStudioFlowCandidateSubmissionController.submitComposed`). The
// Flow's router-run subflows open with the arrival at the build's start
// location (t593): the domain's arrival node, from the same submission
// surroundings the controller checks the Flow with.
//
// `project.assemble` calls it with each subflow's latest done proposal
// (`../supervisor/assemble-tool.ts`); a single-subflow brief's test calls it
// with the proposal under test, before any return of it is recorded
// (`./single-subflow-trial.ts`). One function, so the Flow a builder's test
// judges is exactly the Flow the supervisor completes on.
//
// **On a single-subflow plan, no second revision of the same Flow.** A whole
// revision assembled from exactly the proposals asked for is answered as it
// stands (`again`), with no new revision: a new one would need a new test. And
// a composed submission the controller refuses as unchanged -- the same Flow
// as the revision that still stands, its names aside -- is that standing
// revision, assembled from these proposals too. Every other plan is assembled
// and submitted as before.

export type AutomationStudioProjectAssembleLatestInput = {
  structure: AutomationStudioProjectStructurePlan;
  /** Each subflow's proposal to assemble, by the name a done return gives it, with what runs before it. */
  from: ReadonlyArray<AutomationStudioProjectAssembledProposal & { predecessors: readonly string[] }>;
  ports: Pick<AutomationStudioProjectSupervisorPorts, "proposals" | "submission">;
  /** The plan digest each proposal the plan in force kept from an earlier plan was made under (`../supervisor/state.ts`). */
  kept: ReadonlyMap<string, string>;
  controller: AutomationStudioFlowCandidateSubmissionController;
  gate: Pick<AutomationStudioFlowCandidateTrialGate, "standing" | "refuted">;
  /** The submission's summary; Core's own words when absent. */
  summary?: string | undefined;
  /** A proposal already in hand, as its brief's test holds it, read in place of the proposals port. */
  inHand?: Readonly<AutomationStudioSubflowProposal> | undefined;
};

export type AutomationStudioProjectAssembledLatest =
  | { ok: true; candidate: AutomationStudioFlowCandidate; again: boolean; from: AutomationStudioProjectAssembledProposal[]; assembled: AutomationStudioProjectAssembled | undefined }
  | { ok: false; kind: "assembly"; issues: AutomationStudioProjectAssemblyIssue[] }
  | { ok: false; kind: "composed"; code: string; feedback: JsonObject; issueCodes: string[] };

/** The code of a composed submission the controller refuses as the same Flow as the standing revision (`flow-bootstrap/candidate/unchanged-submission.ts`). */
const UNCHANGED = "candidate.unchanged_submission";

export async function automationStudioProjectAssembleLatest(input: AutomationStudioProjectAssembleLatestInput): Promise<AutomationStudioProjectAssembledLatest> {
  const { structure, ports, controller, gate } = input;
  const memory = AutomationStudioProjectAssembledFrom.of(controller);
  const single = automationStudioProjectSingleSubflowPlan(structure) !== undefined;
  const proposals = new Map<string, AutomationStudioSubflowProposal>();
  const predecessors = new Map<string, readonly string[]>();
  const from: AutomationStudioProjectAssembledProposal[] = [];
  for (const named of input.from) {
    const proposal = await read(input, named);
    if (!proposal || proposal.revision !== named.revision || proposal.digest !== named.digest || proposal.scope.briefId !== named.briefId) continue;
    proposals.set(named.subflowKey, proposal);
    predecessors.set(named.subflowKey, named.predecessors);
    from.push({ subflowKey: named.subflowKey, briefId: named.briefId, revision: named.revision, digest: named.digest });
  }
  const latest = controller.latest();
  // The revision these exact proposals already made stands (header).
  if (single && latest && memory.madeFrom(latest, from)) return { ok: true, candidate: latest, again: true, from, assembled: undefined };
  const assembled = automationStudioProjectAssembly({ structure, proposals, predecessors, kept: input.kept, arrival: arrivalOf(ports.submission) });
  if (!assembled.ok) return { ok: false, kind: "assembly", issues: assembled.issues };
  const summary = input.summary?.trim() || `A Flow of ${structure.plan.subflows.length} subflows, assembled from their builders' proposals.`;
  const submitted = await controller.submitComposed({ plan: assembled.assembled.plan, summary }, { trialOf: (candidate) => gate.standing(candidate), refuted: (digest) => gate.refuted(digest) });
  if (!submitted.ok) {
    const feedback = submitted.check.feedback;
    const code = typeof feedback.code === "string" ? feedback.code : (submitted.check.issueCodes[0] ?? "candidate.submission_refused");
    const standing = controller.latest();
    // The same Flow as the revision that still stands is that revision (header).
    if (single && code === UNCHANGED && standing && standing.revision === feedback.revision && standing.digest === feedback.digest) {
      memory.note(standing, from);
      return { ok: true, candidate: standing, again: true, from, assembled: assembled.assembled };
    }
    return { ok: false, kind: "composed", code, feedback, issueCodes: [...submitted.check.issueCodes] };
  }
  memory.note(submitted.candidate, from);
  return { ok: true, candidate: submitted.candidate, again: false, from, assembled: assembled.assembled };
}

/** The proposal `named` names: the one in hand when it is that one, else what the proposals port holds, else what a single-subflow test kept (`./assembled-from.ts`). */
async function read(input: AutomationStudioProjectAssembleLatestInput, named: AutomationStudioProjectAssembledProposal): Promise<AutomationStudioSubflowProposal | undefined> {
  const hand = input.inHand;
  if (hand && hand.scope.briefId === named.briefId && hand.scope.subflowKey === named.subflowKey && hand.revision === named.revision && hand.digest === named.digest) return structuredClone(hand) as AutomationStudioSubflowProposal;
  const ref = { briefId: named.briefId, subflowKey: named.subflowKey, revision: named.revision, digest: named.digest };
  return (await input.ports.proposals(ref)) ?? AutomationStudioProjectAssembledFrom.of(input.controller).proposal(ref);
}

/** The arrival step the assembled Flow opens with (header): none without a declared arrival node and a start location; null when the registry cannot give it. */
function arrivalOf(submission: AutomationStudioProjectAssembleLatestInput["ports"]["submission"]) {
  const declared = submission.binding?.runsNodes?.arrival;
  const location = submission.startLocation?.trim();
  return declared && location ? automationStudioArrivalPlanNode({ ...declared, location }, submission.registry, submission.resolution) : undefined;
}
