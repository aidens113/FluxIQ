// A decision to finish: accepted, refused back to the model with every reason
// together, or the end of the loop.
//
// Each attempt is recorded in the decision history with what the check and the
// dry run said. A result the model already sent over this same draft, and was
// refused for, is still checked and replayed -- the check may have been waiting
// on the page -- but its feedback now says it is the same result sent again
// (`sameAsIteration`, `timesSent`): crossborder decision 13 was shown refusal
// 12 in full and sent the identical completion, and nothing told it so.
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

/** Answers one `complete` decision. Throws where the loop propagates decision errors. */
export async function automationStudioLlmEvidenceHandleCompletion(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "complete" }>
): Promise<Exclude<AutomationStudioLlmEvidenceDecisionNext, { kind: "rerun" }>> {
  const { input, limits, trace, accounting, draftSteps, counters, evidence } = context;
  const end = (code: Parameters<typeof failure>[1]): { kind: "end"; result: ReturnType<typeof failure> } => ({ kind: "end", result: failure(draftSteps, code, trace, accounting) });
  counters.completionAttempts += 1;
  if (accounting.toolCalls - counters.failedToolCalls < limits.minToolCalls) return end("llm_evidence_loop.invalid_decision");
  // Every earlier answer to finishing -- the check's refusal, a dry run's
  // refusal and page -- is about the draft as it stood then. This attempt asks
  // both again and shows fresh ones for whatever still refuses it, so a check
  // that now passes does not leave its old refusal in front of the model beside
  // a dry run that still refuses.
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID);
  context.dryRunSeen = { ran: false };
  // The caller's check and the draft's dry run, both asked and answered
  // together (`../evidence-loop/completion-attempt.ts` says why both).
  const attempt = await automationStudioLlmEvidenceCompletionAttempt({ result: decision.result, steps: draftSteps, checkCompletion: input.checkCompletion, dryRun: context.dryRun, signal: input.signal });
  if (attempt.kind === "threw") {
    if (input.propagateDecisionErrors) throw attempt.error;
    return end("llm_evidence_loop.invalid_decision");
  }
  if (attempt.kind === "ended") return end(attempt.code);
  const repeat = context.history.record(iteration, {
    kind: "completion",
    signature: automationStudioLlmDecisionContextSignature(decision),
    draftRevision: context.draftRevision(),
    accepted: attempt.kind === "accepted",
    issueCodes: attempt.kind === "refused" ? attempt.issueCodes : [],
    ...(attempt.kind === "refused" && attempt.feedback ? { feedback: attempt.feedback } : {}),
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
  if (attempt.feedback) {
    const feedback: JsonObject = repeat && repeat.times >= 2 ? sentAgain(attempt.feedback, repeat.iterations[0]!, repeat.times) : attempt.feedback;
    if (context.reserveEvidence(feedback) === undefined) return end("llm_evidence_loop.evidence_limit");
    evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: feedback });
  }
  const resultCode = attempt.issueCodes[0];
  const stalled = context.unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...usage }, attempt.issueCodes, answered);
  if (!stalled) return { kind: "continue" };
  if (input.propagateDecisionErrors) throw stalled.error;
  return end("llm_evidence_loop.invalid_decision");
}

/** The feedback of a result sent again over the same draft, marked so; a key the check already wrote is left as it wrote it. */
function sentAgain(feedback: JsonObject, sameAsIteration: number, timesSent: number): JsonObject {
  return {
    ...feedback,
    ...("sameAsIteration" in feedback ? {} : { sameAsIteration }),
    ...("timesSent" in feedback ? {} : { timesSent })
  };
}

/**
 * What the dry run said during the attempt: the steps its verdict refused, as
 * the `core.dry_run` entry the gate showed lists them; `clean` when it
 * replayed and showed nothing; `not_run` when the gate did not replay.
 */
function dryRunSaid(seen: { ran: boolean; verdict?: JsonValue }): AutomationStudioLlmDecisionContextDryRun {
  if (seen.verdict !== undefined) {
    const steps = isObject(seen.verdict) && Array.isArray(seen.verdict.steps) ? seen.verdict.steps : [];
    return steps.flatMap((step) => isObject(step) && typeof step.step === "number" && typeof step.replayed === "string" && step.replayed !== "replayed"
      ? [{ step: step.step, status: step.replayed }]
      : []);
  }
  return seen.ran ? "clean" : "not_run";
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
