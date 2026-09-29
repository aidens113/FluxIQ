// One attempt to finish: the caller's completion check and the draft's dry run,
// both asked, and one answer made of them.
//
// **Both run on every attempt.** The dry run used to run only once the check
// had passed, on the reasoning that a plan which does not assemble should not
// be replayed. That made the two a queue: `run-mulxsbyy-d4d4c7a1` was refused by
// the check at decision 24, answered it, and only then, at decision 27, learned
// the draft did not replay clean -- a fact that was already true at 24. The
// replay needs the draft, not an accepted plan, so it is asked whenever the
// draft can be replayed and its refusal joins the check's. A draft that cannot
// be replayed is not gated, exactly as before (`../node-tools/dry-run-gate.ts`).
//
// What comes back is one of four things, and the loop decides what each costs
// it: accepted, refused with every issue together, an ending (cancelled, the
// evidence backstop, a check that answered nothing readable), or a check that
// threw, which the loop treats as the decision error it always was.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseCompletionCheck } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceLoopAnswerability } from "./answerability.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck, AutomationStudioLlmEvidenceRestoredStep } from "./completion-check.ts";

export type AutomationStudioLlmEvidenceCompletionAttempt =
  | { kind: "accepted"; answerability?: AutomationStudioLlmEvidenceLoopAnswerability; restoredStep?: AutomationStudioLlmEvidenceRestoredStep }
  | {
    kind: "refused";
    /** The check's issues first, then the dry run's. */
    issueCodes: readonly string[];
    /** The check's feedback, when the check refused. The dry run shows its own. */
    feedback?: JsonObject;
    answerability?: AutomationStudioLlmEvidenceLoopAnswerability;
    restoredStep?: AutomationStudioLlmEvidenceRestoredStep;
  }
  | { kind: "ended"; code: "llm_evidence_loop.cancelled" | "llm_evidence_loop.evidence_limit" | "llm_evidence_loop.invalid_decision" }
  | { kind: "threw"; error: unknown };

/** Asks the check and the dry run about one completed result. */
export async function automationStudioLlmEvidenceCompletionAttempt(input: {
  result: JsonObject;
  steps: readonly AutomationStudioFlowDraftStep[];
  checkCompletion?: ((result: JsonObject, context: { steps: readonly AutomationStudioFlowDraftStep[] }) => AutomationStudioLlmEvidenceCompletionCheck | Promise<AutomationStudioLlmEvidenceCompletionCheck>) | undefined;
  /** The loop's dry-run gate: nothing when the draft replayed clean or is not gated. */
  dryRun(): Promise<"cancelled" | "evidence_limit" | { issueCodes: readonly string[] } | undefined>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioLlmEvidenceCompletionAttempt> {
  let check: AutomationStudioLlmEvidenceCompletionCheck | undefined = { ok: true };
  if (input.checkCompletion) {
    try {
      check = automationStudioLlmEvidenceParseCompletionCheck(await input.checkCompletion(structuredClone(input.result), { steps: input.steps.map((step) => ({ ...step })) }));
    } catch (error) {
      if (input.signal?.aborted) return { kind: "ended", code: "llm_evidence_loop.cancelled" };
      return { kind: "threw", error };
    }
  }
  if (!check) return { kind: "ended", code: "llm_evidence_loop.invalid_decision" };
  // A check that raised a permission request ends the build from here; nothing
  // is replayed under a signal that has already been given.
  if (input.signal?.aborted) return { kind: "ended", code: "llm_evidence_loop.cancelled" };
  // Last in cost, because it is the only part that takes seconds and touches the
  // world -- but asked whatever the check said.
  const replay = await input.dryRun();
  if (replay === "cancelled") return { kind: "ended", code: "llm_evidence_loop.cancelled" };
  if (replay === "evidence_limit") return { kind: "ended", code: "llm_evidence_loop.evidence_limit" };
  const answerability = { ...(check.answerability ? { answerability: check.answerability } : {}), ...(check.restoredStep ? { restoredStep: check.restoredStep } : {}) };
  if (check.ok && !replay) return { kind: "accepted", ...answerability };
  return {
    kind: "refused",
    issueCodes: [...new Set([...(check.ok ? [] : check.issueCodes), ...(replay ? replay.issueCodes : [])])],
    ...(check.ok ? {} : { feedback: check.feedback }),
    ...answerability
  };
}
