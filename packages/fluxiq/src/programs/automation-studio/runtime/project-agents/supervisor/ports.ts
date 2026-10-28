import type { AutomationStudioCandidateTrialPort, AutomationStudioFlowCandidateSubmissionController } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetChecks, AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseJudging } from "../../llm/build-purse/index.ts";
import type { AutomationStudioProjectInstructionSource } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchPort } from "../dispatch/index.ts";
import type { AutomationStudioProjectBuildRecordStore, AutomationStudioProjectBuildRef } from "../record/index.ts";

/** Which proposal a done return names: the brief it answered and the receipt it completed with. */
export type AutomationStudioProjectProposalRef = { briefId: string; subflowKey: string; revision: number; digest: string };

/** What a plan in force keeps of earlier plans' done proposals (t590): its digest, and the plan digest each kept proposal was made under, by subflow key. */
export type AutomationStudioProjectSupervisorKept = { planDigest: string; madeUnder: ReadonlyMap<string, string> };

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
 * - `projectLedger`: the build's lasting-act ledger (t538), asked per brief
 *   (`forBrief`) as well as whole: before each whole trial the deployment's
 *   start hook puts the site back where there is one; otherwise the trial runs
 *   with this build's acts on the site, its judge told them, and is judged by
 *   what it changed (`./whole-trial.ts`, t775). Every ending names what it
 *   holds still on the target (`./left-on-target.ts`).
 * - `look`: Core's own look at a place, under the signal of the whole trial
 *   being prepared (`service/project-build/phase-start.ts`, t775 D5): the
 *   whole trial's witnesses are read through it just before the trial and
 *   again after it, and each read reaches every ledger holding an act. Absent,
 *   Core never looks and the whole trial gets no readings.
 * - `kept`: told, each time a plan comes into force, which done proposals made
 *   under an earlier plan it keeps, by subflow key with the plan digest each
 *   was made under (`./state.ts`, t590), so a dependent builder's entry may
 *   run them although their plan digest is not the brief's
 *   (`service/project-build/entry-preparation.ts`).
 * - `leftAtEnding`: told, as an ending's reason is made, Core's own line of
 *   what this build still has on the target, or none (`./left-on-target.ts`,
 *   t590): what a failed build's chat message says, never the model's words.
 *   `note` is the ledger's words, for the record; `told` the same in a
 *   person's words, which the chat says (t567 lane 4).
 * - `submission`: what the whole candidate's submission controller is made
 *   with, exactly as the candidate authoring loop's.
 * - `trial`: the whole candidate's trial runner and judge. Absent, the
 *   assembled Flow can only complete as an unverified draft, as there.
 * - `purse`, `reserve`: the build's purse, under which the supervisor's
 *   decisions and the whole trial's judge run in a run frame of their own; and
 *   the judging it keeps back from every builder's allowance, for the judged
 *   whole run and one repair round.
 * - `finishing`: the calls kept back from every builder's allowance for the
 *   build's own finishing (t570): the supervisor's last decisions (assembly,
 *   the reset's dispatch, the test, the completion) and a reset brief's own,
 *   which only a reset brief may be given (`./brief-sizing.ts`).
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
  projectLedger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">;
  look?: ((signal: AbortSignal | undefined) => NonNullable<AutomationStudioSiteResetChecks["lookAt"]>) | undefined;
  kept?: ((kept: AutomationStudioProjectSupervisorKept) => void) | undefined;
  leftAtEnding?: ((left: { note: string | undefined; told?: string }) => void) | undefined;
  submission: ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0];
  trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort } | undefined;
  purse?: AutomationStudioLlmBuildPurse | undefined;
  reserve?: AutomationStudioLlmBuildPurseJudging | undefined;
  finishing?: { supervisorCalls: number; resetCalls: number } | undefined;
  signal?: AbortSignal | undefined;
};
