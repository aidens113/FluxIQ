// One attempt to finish: the caller's completion check, then -- only when the
// check accepted -- the test of the Flow, and one answer made of them.
//
// **The build's lifecycle (user, 2026-09-30).** A build explores live and
// writes its draft as it goes, and nothing in that phase runs the draft again
// from its first step. When the model says the Flow is ready, and the check
// agrees it is a Flow that assembles and does what was asked, the Flow is
// tested: the one full run, from where it starts (`../node-tools/dry-run-gate.ts`).
// A test that fails sends the model back to live work on the failing part, from
// where the test left the page, and the next time it says the Flow is ready it
// is tested again.
//
// **So the test no longer runs on every attempt.** From 2026-09-2x until now it
// did, so that a replay failure was known as early as a check failure
// (`run-mulxsbyy-d4d4c7a1` learned at decision 27 what was true at 24). The
// price was a replay from the start on every refused completion -- the model
// explored a step, finished too early, and the whole draft ran again, over and
// over, which is the defect the user saw in live builds. A completion the check
// refuses is answered from the check alone, and the page stays where the
// model's live work left it. A draft that cannot be replayed is not tested,
// exactly as before.
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
  const answerability = { ...(check.answerability ? { answerability: check.answerability } : {}), ...(check.restoredStep ? { restoredStep: check.restoredStep } : {}) };
  // The Flow is tested only once the check has accepted it: a completion the
  // check refuses is still live work, and a test then would replay the draft
  // from its first step in the middle of it (see the header).
  if (!check.ok) return { kind: "refused", issueCodes: [...new Set(check.issueCodes)], feedback: check.feedback, ...answerability };
  const replay = await input.dryRun();
  if (replay === "cancelled") return { kind: "ended", code: "llm_evidence_loop.cancelled" };
  if (replay === "evidence_limit") return { kind: "ended", code: "llm_evidence_loop.evidence_limit" };
  if (!replay) return { kind: "accepted", ...answerability };
  return { kind: "refused", issueCodes: [...new Set(replay.issueCodes)], ...answerability };
}
