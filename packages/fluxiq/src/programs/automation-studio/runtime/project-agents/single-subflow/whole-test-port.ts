import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectDispatchWholeTrial, AutomationStudioProjectDispatchWholeTrialAnswer } from "../dispatch/index.ts";

// The port a single-subflow brief's gate is given in place of its subflow
// trial port (t679, `../dispatch/run-brief.ts`): each test is the plan's
// judged whole run (`./single-subflow-trial.ts`).
//
// - **What the dispatcher keeps of a trial is unchanged.** A trial that ran is
//   handed through the dispatcher's own wrapper (`listed`,
//   `../dispatch/trial-port.ts`), so its receipt is listed, remembered for a
//   later repair, kept as the brief's last trial heard, and told the gate's
//   verdict. The scoped port is never asked, so it is never told one either.
// - **The start hook still runs first.** The scoped port's `prepareStart` is
//   kept, so the brief's gate runs the deployment's start hook ahead of its
//   own site reset, as before (user, 2026-10-12).
// - **A test that did not run is no verdict.** The brief's gate has one answer
//   that counts nothing and keeps nothing: a trial the money could not judge,
//   by its code (`subflow.trial_unaffordable`, which the scoped trial port
//   writes too). A refused whole test is handed to the gate as that, and the
//   gate's answer to the builder is then replaced, in the loop the dispatcher
//   watches (`observe`), with the refusal in the builder's own terms. No trial
//   is listed, counted, weighed or recorded for it.

/** The code the brief's gate takes as a trial that did not run (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`, t661). */
const NOT_RUN = "subflow.trial_unaffordable";
/** The reason a refusal the same test may pass again carries, so the loop's repeat guard lets it through. */
const RETRY = "retry_allowed";

type Refusal = Extract<AutomationStudioProjectDispatchWholeTrialAnswer, { refused: unknown }>["refused"];

export class AutomationStudioProjectWholeTestPort {
  /** The port the brief's gate asks (header). */
  readonly port: AutomationStudioSubflowTrialPreparingPort;
  /** The refusal of the test in flight, until the gate has answered it. */
  private refusal: Refusal | undefined;

  /**
   * `whole`, the plan's whole test; `scoped`, the brief's own subflow trial
   * port, whose start hook is kept; `listed`, the dispatcher's wrapper that
   * lists, remembers and weighs each trial (`../dispatch/trial-port.ts`).
   */
  constructor(whole: AutomationStudioProjectDispatchWholeTrial, scoped: AutomationStudioSubflowTrialPreparingPort | undefined, listed: (port: AutomationStudioSubflowTrialPreparingPort) => AutomationStudioSubflowTrialPreparingPort) {
    let ran: AutomationStudioSubflowTrialResult | undefined;
    // What the wrapper lists is the whole test's answer, handed through as it came.
    const answered: AutomationStudioSubflowTrialPreparingPort = async () => ran!;
    if (scoped?.prepareStart) answered.prepareStart = scoped.prepareStart;
    const kept = listed(answered);
    const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
      this.refusal = undefined;
      const answer = await whole(request);
      if ("refused" in answer) {
        this.refusal = structuredClone(answer.refused);
        return notRun(request, answer.refused.code);
      }
      ran = answer.trial;
      return await kept(request);
    };
    if (kept.prepareStart) port.prepareStart = kept.prepareStart;
    if (kept.standingNos) port.standingNos = kept.standingNos;
    if (kept.weighed) port.weighed = kept.weighed;
    this.port = port;
  }

  /** `loop`, its builder's test answered with the refusal itself where the whole test did not run (header). */
  observe(loop: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput {
    const inner = loop.executeTool;
    const executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async (call) => {
      if (call.toolId !== AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID) return await inner(call);
      this.refusal = undefined;
      const answered = await inner(call);
      const refusal = this.refusal;
      this.refusal = undefined;
      return refusal && notRunAnswer(answered) ? refusedAnswer(refusal) : answered;
    };
    return { ...loop, executeTool };
  }
}

/** The gate's not-run answer for `request` (header): nothing ran, nothing is kept. */
function notRun(request: AutomationStudioSubflowTrialRequest, code: string): AutomationStudioSubflowTrialResult {
  const { scope, proposal } = request;
  return {
    partial: true, scope: "subflow", identity: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey },
    revision: proposal.revision, digest: proposal.digest, verdict: "not_judged", feedback: { code: NOT_RUN, notRun: { code } }, entryPrepared: false
  };
}

/** Whether the gate answered a test as one that did not run. */
function notRunAnswer(answered: unknown): boolean {
  if (!answered || typeof answered !== "object" || Array.isArray(answered)) return false;
  const evidence = (answered as { evidence?: unknown }).evidence;
  return Boolean(evidence) && typeof evidence === "object" && (evidence as JsonObject).code === NOT_RUN;
}

/** The refusal as the builder's test tool answers it. */
function refusedAnswer(refusal: Refusal): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: false, code: refusal.code, instruction: refusal.instruction, ...structuredClone(refusal.detail) },
    effectApplied: false,
    targetsUnchanged: true,
    resultCode: refusal.code,
    ...(refusal.retry ? { resultReason: RETRY } : {})
  };
}
