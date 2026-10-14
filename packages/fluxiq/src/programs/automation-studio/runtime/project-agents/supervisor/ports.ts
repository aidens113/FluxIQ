import type { AutomationStudioCandidateTrialPort, AutomationStudioFlowCandidateSubmissionController } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseJudging } from "../../llm/build-purse/index.ts";
import type { AutomationStudioProjectInstructionSource } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchPort } from "../dispatch/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectBuildRef } from "../record/index.ts";

/** Which proposal a done return names: the brief it answered and the receipt it completed with. */
export type AutomationStudioProjectProposalRef = { briefId: string; subflowKey: string; revision: number; digest: string };

/**
 * Everything the project supervisor reaches outside itself, for the unit that
 * wires it into a build (A5c) to build: the supervisor makes no store, no
 * dispatcher, no trial runner and no purse of its own.
 *
 * - `build`, `record`, `instructionDigest`, `sources`: the build record it
 *   writes as it goes (`../record/`), created here when the build has none;
 *   the active instructions a task spec's parts are copied from; and the
 *   instructions' digest the record is created with.
 * - `dispatch`: the dispatcher (`../dispatch/port.ts`, A5b). The supervisor
 *   records each brief before it hands it over and reads each return it hands
 *   back; the dispatcher records the returns, allowances and receipts.
 * - `proposals`: a done return names its proposal by revision and digest; this
 *   answers the proposal itself (its subflows), as the builder's loop accepted
 *   it. Undefined when it holds none by that name.
 * - `projectLedger`: the build's lasting-act ledger (t538); an act still in
 *   place refuses the whole trial until a reset brief has undone it.
 * - `submission`: what the whole candidate's submission controller is made
 *   with, exactly as the candidate authoring loop's.
 * - `trial`: the whole candidate's trial runner and judge. Absent, the
 *   assembled Flow can only complete as an unverified draft, as there.
 * - `purse`, `reserve`: the build's purse, under which the supervisor's
 *   decisions and the whole trial's judge run in a run frame of their own; and
 *   the judging it keeps back from every builder's allowance, for the judged
 *   whole run and one repair round.
 * - `signal`: the build's cancellation; the supervisor's loop runs under it.
 *
 * On a yes the supervisor writes no ending: the caller promotes the candidate
 * and then ends the record `promoted`. Every other ending it writes itself.
 */
export type AutomationStudioProjectSupervisorPorts = {
  build: AutomationStudioProjectBuildRef;
  record: AutomationStudioProjectBuildRecordStore;
  instructionDigest: string;
  sources: readonly AutomationStudioProjectInstructionSource[];
  dispatch: AutomationStudioProjectDispatchPort;
  proposals: (ref: AutomationStudioProjectProposalRef) => AutomationStudioSubflowProposal | undefined | Promise<AutomationStudioSubflowProposal | undefined>;
  projectLedger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot">;
  submission: ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];
  trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort } | undefined;
  purse?: AutomationStudioLlmBuildPurse | undefined;
  reserve?: AutomationStudioLlmBuildPurseJudging | undefined;
  signal?: AbortSignal | undefined;
};
