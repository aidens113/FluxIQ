// A decision to finish: accepted, refused back to the model with every reason
// together, or the end of the loop.
//
// Each attempt is recorded in the decision history with what the check and the
// dry run said. A result the model already sent over this same draft, and was
// refused for, is still checked and replayed -- the check may have been waiting
// on the page -- but its feedback now says it is the same result sent again
// (`sameAsIteration`, `timesSent`): crossborder decision 13 was shown refusal
// 12 in full and sent the identical completion, and nothing told it so.
// Numbers alone were not read: run 37's repair (t193, bigbox) completed six
// times over one draft, rewording only its summary, so the feedback also says
// in words that the draft, not the result, is what has to change (`sentAgain`).
//
// Those words are a draft's. A loop with no draft -- a subflow builder, whose
// completion is a receipt its trial gate answers -- gives its own: its check's
// refusal carries them under `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY`,
// which is taken off before the model sees the refusal and said, after the
// same first sentence in a completion's terms, only when the same refusal comes
// again (A8 bigbox run, t581: builders were told to "run the step that is
// missing, or amend the steps they name", which no builder can). A refusal
// without it reads exactly as before.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID } from "../../flow-draft/index.ts";
import {
  automationStudioLlmDecisionContextSignature,
  automationStudioLlmDecisionContextSupersede,
  type AutomationStudioLlmDecisionContextDryRun
} from "../decision-context/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID,
  automationStudioLlmEvidenceCompletionAttempt,
  automationStudioLlmEvidenceLoopFailure as failure,
  type AutomationStudioLlmEvidenceLoopDecision
} from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext, AutomationStudioLlmEvidenceDecisionNext } from "./types.ts";

/**
 * The key a completion check's refusal may carry its own sent-again words
 * under (header): a string, said instead of the draft's when the refusal comes
 * again, and never shown as it is.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY = "sentAgainInstead";

/** Answers one `complete` decision. Throws where the loop propagates decision errors. */
export async function automationStudioLlmEvidenceHandleCompletion(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "complete" }>
): Promise<Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }>> {
  const { input, limits, trace, accounting, draftSteps, counters, evidence } = context;
  const end = (code: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, code, trace, accounting) });
  counters.completionAttempts += 1;
  context.repeats.acted(); // Not a look: a run of looks is over (`../repeat-guard/searching.ts`).
  if (accounting.toolCalls - counters.failedToolCalls < limits.minToolCalls) return end("llm_evidence_loop.invalid_decision");
  // Every earlier answer to finishing -- the check's refusal, a dry run's
  // refusal and page -- is about the draft as it stood then. This attempt asks
  // both again and shows fresh ones for whatever still refuses it, so a check
  // that now passes does not leave its old refusal in front of the model beside
  // a dry run that still refuses.
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID);
  context.dryRunSeen = { ran: false, reused: false };
  // The caller's check and the draft's dry run, both asked and answered
  // together (`../evidence-loop/completion-attempt.ts` says why both).
  // The check is told how many decisions remain after this one (t743), so a rule asking for more work holds only where there is room.
  const attempt = await automationStudioLlmEvidenceCompletionAttempt({ result: decision.result, steps: draftSteps, checkCompletion: input.checkCompletion, dryRun: context.dryRun, signal: input.signal, turnsLeft: Math.max(0, limits.maxIterations - iteration - 1) });
  if (attempt.kind === "threw") {
    if (input.propagateDecisionErrors) throw attempt.error;
    return end("llm_evidence_loop.invalid_decision");
  }
  if (attempt.kind === "ended") return end(attempt.code);
  const { said: refusal, own } = ownSentAgain(attempt.kind === "refused" ? attempt.feedback : undefined);
  const repeat = context.history.record(iteration, {
    kind: "completion",
    signature: automationStudioLlmDecisionContextSignature(decision),
    draftRevision: context.draftRevision(),
    accepted: attempt.kind === "accepted",
    issueCodes: attempt.kind === "refused" ? attempt.issueCodes : [],
    ...(refusal ? { feedback: refusal } : {}),
    dryRun: dryRunSaid(context.dryRunSeen)
  });
  const answered = attempt.answerability ? { answerability: attempt.answerability } : {};
  const usage = { ...(decision.usage ? { usage: decision.usage } : {}), ...(attempt.restoredStep ? { restoredStep: attempt.restoredStep } : {}) };
  if (attempt.kind === "accepted") {
    context.recordRow({ iteration, decision: "complete", ...usage }, answered);
    return { kind: "end", result: { ok: true, result: decision.result, trace, steps: draftSteps, accounting } };
  }
  if (!input.unusableDecisions) return end("llm_evidence_loop.invalid_decision");
  // The model is told why before it is asked again; the dry run showed its own.
  if (refusal) {
    const feedback: JsonObject = repeat && repeat.times >= 2 ? sentAgain(refusal, repeat.iterations[0]!, repeat.times, own) : refusal;
    context.accountEvidence(feedback);
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: feedback });
  }
  const resultCode = attempt.issueCodes[0];
  const stalled = context.unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...usage }, attempt.issueCodes, answered);
  if (!stalled) return { kind: "continue" };
  if (input.propagateDecisionErrors) throw stalled.error;
  return end("llm_evidence_loop.invalid_decision");
}

/** The feedback of a result sent again over the same draft, marked so; a key the check already wrote is left as it wrote it. */
function sentAgain(feedback: JsonObject, sameAsIteration: number, timesSent: number, own: string | undefined): JsonObject {
  return {
    ...feedback,
    ...("sameAsIteration" in feedback ? {} : { sameAsIteration }),
    ...("timesSent" in feedback ? {} : { timesSent }),
    ...("sentAgain" in feedback ? {} : { sentAgain: own === undefined ? SENT_AGAIN(sameAsIteration, timesSent) : `${OWN_SENT_AGAIN(sameAsIteration, timesSent)}${own}` })
  };
}

/** A refusal as the model is shown it, with the check's own sent-again words taken off (header). */
function ownSentAgain(feedback: JsonObject | undefined): { said: JsonObject | undefined; own: string | undefined } {
  if (!feedback || !(AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY in feedback)) return { said: feedback, own: undefined };
  const { [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_SENT_AGAIN_KEY]: own, ...said } = feedback;
  return { said, own: typeof own === "string" && own.trim() ? own.trim() : undefined };
}

/** The first sentence of a refusal sent again, in a completion's terms rather than a draft's (header). */
const OWN_SENT_AGAIN = (sameAsIteration: number, timesSent: number): string =>
  `This completion was refused for these same reasons at decision ${sameAsIteration}, and this is attempt ${timesSent}. `;

/** Says why a result over an unchanged draft is refused again, and what would change the answer. */
const SENT_AGAIN = (sameAsIteration: number, timesSent: number): string =>
  `This draft was refused for these same reasons at decision ${sameAsIteration}, and this is attempt ${timesSent} over it unchanged. `
  + "The check reads the draft's steps, not the result's words, so completing again gives the same answer until the draft changes: "
  + "first do what the reasons ask -- run the step that is missing, or amend the steps they name -- then complete.";

/**
 * The words a shown step passed the dry run under: run again, or checked and
 * not run because its effect lasts (`../../flow-draft/verify-only.ts`).
 */
const PASSED: ReadonlySet<string> = new Set(["replayed", "verified", "present"]);

/**
 * What the dry run said during the attempt: the steps its verdict refused, as
 * the `core.dry_run` entry the gate showed lists them; `clean` when it
 * replayed and showed nothing; `reused_clean` when the gate answered from an
 * earlier clean replay of the same draft; `not_run` when no replay applied.
 * Run 18's completion 48 was accepted on a reused verdict and recorded
 * `not_run`, which hid that the acceptance rested on dry run 5.
 */
function dryRunSaid(seen: { ran: boolean; reused?: boolean; verdict?: JsonValue }): AutomationStudioLlmDecisionContextDryRun {
  if (seen.verdict !== undefined) {
    const steps = isObject(seen.verdict) && Array.isArray(seen.verdict.steps) ? seen.verdict.steps : [];
    return steps.flatMap((step) => isObject(step) && typeof step.step === "number" && typeof step.replayed === "string" && !PASSED.has(step.replayed)
      ? [{ step: step.step, status: step.replayed }]
      : []);
  }
  if (seen.ran) return "clean";
  return seen.reused ? "reused_clean" : "not_run";
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
