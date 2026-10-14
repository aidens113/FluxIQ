import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectReceiptCard } from "../../activity/project/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/**
 * `core.test_candidate` for the supervisor: the whole candidate's trial gate
 * (`../../flow-bootstrap/candidate/trial-gate.ts`), run under the supervisor's
 * purse run frame so its judge spends the reserve no builder could be given.
 *
 * **The site is put back first (user, 2026-10-12).** A whole trial runs only
 * once every lasting act of this build is undone: while the project ledger
 * holds an act still in place, or the last whole trial left acts and no reset
 * brief has come back done since, it is refused `project.trial_reset_required`,
 * naming `project.dispatch` with a reset brief. The refusal is no trial and
 * says to try again (`retry_allowed`), so the test after the reset reaches the
 * gate rather than the loop's memory.
 *
 * Each trial that ran is recorded in the build record as a receipt reference
 * and shown in the chat as its receipt card.
 */
export async function automationStudioProjectSupervisorWholeTrial(context: AutomationStudioProjectSupervisorContext, value: JsonObject, callSignal: AbortSignal | undefined): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state, gate, controller } = context;
  const inPlace = ports.projectLedger.snapshot().acts.filter((act) => act.inPlace);
  if (inPlace.length || state.wholeTrialLeftActs) {
    return answer.refused("project.trial_reset_required", GUIDANCE.refusals.resetRequired, {
      actsInPlace: inPlace.map((act) => ({ act: act.act, did: act.did, brief: act.owner })),
      ...(state.wholeTrialLeftActs ? { lastWholeTrialLeftActs: true } : {})
    }, { retry: true });
  }
  const ran = await gate.test(value, callSignal ?? context.signal);
  const evidence = ran.evidence as JsonObject;
  if (typeof evidence.verdict !== "string" || typeof evidence.revision !== "number" || typeof evidence.digest !== "string") return ran;
  const verdict = evidence.verdict;
  const receiptId = typeof evidence.trialRunId === "string" && evidence.trialRunId ? evidence.trialRunId : `whole-trial-${evidence.revision}-${Date.now()}`;
  await ports.record.recordReceipt(ports.build, { receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest } });
  emitAutomationStudioProjectReceiptCard({ receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest }, verdict: verdict === "yes" ? "passed" : verdict === "no" ? "failed" : "unconfirmed" });
  if (verdict !== "yes") state.wholeTrialFailed = true;
  if (gate.standing(controller.latest())?.acts?.length) state.wholeTrialLeftActs = true;
  return ran;
}
