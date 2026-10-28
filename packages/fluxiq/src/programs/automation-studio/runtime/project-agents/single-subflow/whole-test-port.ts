import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowTrialNotRun, AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult, AutomationStudioSubflowTrialRowCheck } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectDispatchWholeTrial } from "../dispatch/index.ts";

// The port a single-subflow brief's gate is given in place of its subflow
// trial port (t679, `../dispatch/run-brief.ts`): each test is the plan's
// judged whole run (`./single-subflow-trial.ts`).
//
// - **What the dispatcher keeps of a trial is unchanged.** A trial that ran is
//   handed through the dispatcher's own wrapper (`listed`,
//   `../dispatch/trial-port.ts`), so its receipt is listed, remembered for a
//   later repair, kept as the brief's last trial heard, and told the gate's
//   verdict. The scoped port is never asked, so it is never told one either.
// - **The build's proposals learn it (`tried`).** The build's proposals store
//   learns a proposal from the scoped port's `weighed` only, which this path
//   never asks; so each trial's proposal is told to `tried` with the gate's
//   verdict (`service/project-build/run.ts`, `trialled`), as the scoped port
//   tells it, and a time limit's words, an amendment and a dependent's entry
//   read it as they read any subflow trial.
// - **The start hook still runs first.** The scoped port's `prepareStart` is
//   kept, so the brief's gate runs the deployment's start hook ahead of its
//   own site reset, as before (user, 2026-10-12). It does so even for a test
//   the whole gate then answers from the recording (P6, D48), which it cannot
//   know beforehand; the answer's `checkedAgainst` is handed through unchanged.
// - **A test that did not run is no verdict.** A refused whole test is handed
//   to the gate as a trial its port did not run (`notRun`,
//   `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`), which the gate
//   answers as that refusal: nothing is listed, counted, weighed or recorded.
// - **A yes over a read Core flagged is answered from the converse (t692).**
//   The whole test's trial carries its row check (`rowCheck`,
//   `./single-subflow-trial.ts`): whether its yes was confirmed by the judge's
//   converse question. The port keeps it by the trial's run id, hands the
//   trial on without it, and answers the gate's `checkRows` with it.

/** Told each trial's proposal with the verdict its gate kept (header). */
export type AutomationStudioProjectWholeTestTried = (scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>, verdict: AutomationStudioCandidateTrialVerdict) => void;

export class AutomationStudioProjectWholeTestPort {
  /** The port the brief's gate asks (header). */
  readonly port: AutomationStudioSubflowTrialPreparingPort;

  /**
   * `whole`, the plan's whole test; `scoped`, the brief's own subflow trial
   * port, whose start hook is kept; `listed`, the dispatcher's wrapper that
   * lists, remembers and weighs each trial (`../dispatch/trial-port.ts`);
   * `tried`, the build's proposals (header).
   */
  constructor(whole: AutomationStudioProjectDispatchWholeTrial, scoped: AutomationStudioSubflowTrialPreparingPort | undefined, listed: (port: AutomationStudioSubflowTrialPreparingPort) => AutomationStudioSubflowTrialPreparingPort, tried?: AutomationStudioProjectWholeTestTried) {
    let ran: AutomationStudioSubflowTrialResult | undefined;
    /** The request of the trial in flight, until its gate tells the verdict it kept. */
    let asked: AutomationStudioSubflowTrialRequest | undefined;
    /** Each whole test's row check, by its run id (header, t692). */
    const converse = new Map<string, AutomationStudioSubflowTrialRowCheck>();
    // What the wrapper lists is the whole test's answer, handed through as it came.
    const answered: AutomationStudioSubflowTrialPreparingPort = async () => ran!;
    if (scoped?.prepareStart) answered.prepareStart = scoped.prepareStart;
    const kept = listed(answered);
    const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
      asked = undefined;
      const answer = await whole(request);
      if ("refused" in answer) return notRun(request, answer.refused);
      const { rowCheck, ...trial } = answer.trial as AutomationStudioSubflowTrialResult & { rowCheck?: AutomationStudioSubflowTrialRowCheck };
      if (rowCheck && trial.trialRunId) converse.set(trial.trialRunId, { ...rowCheck });
      ran = trial;
      asked = request;
      return await kept(request);
    };
    if (kept.prepareStart) port.prepareStart = kept.prepareStart;
    if (kept.standingNos) port.standingNos = kept.standingNos;
    // The gate's row check, from the whole test's own converse (header, t692).
    port.checkRows = async ({ trialRunId }) => (trialRunId ? converse.get(trialRunId) : undefined);
    port.weighed = (trial) => {
      kept.weighed?.(trial);
      const request = asked;
      asked = undefined;
      const { answer } = trial;
      // The gate's verdict of the trial this port answered is the one the build's proposals keep (header).
      if (request && request.scope.briefId === answer.identity.briefId && request.proposal.revision === answer.revision && request.proposal.digest === answer.digest) tried?.(request.scope, request.proposal, answer.verdict);
    };
    this.port = port;
  }
}

/** The gate's answer for a whole test that did not run (header): its refusal, beside a result whose verdict is never read. */
function notRun(request: AutomationStudioSubflowTrialRequest, refused: AutomationStudioSubflowTrialNotRun["notRun"]): AutomationStudioSubflowTrialResult & AutomationStudioSubflowTrialNotRun {
  const { scope, proposal } = request;
  return {
    partial: true, scope: "subflow", identity: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey },
    revision: proposal.revision, digest: proposal.digest, verdict: "not_judged", feedback: { code: refused.code }, entryPrepared: false,
    notRun: { code: refused.code, instruction: refused.instruction, ...(refused.detail ? { detail: structuredClone(refused.detail) } : {}), ...(refused.retry ? { retry: true } : {}) }
  };
}
