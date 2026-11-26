// How a round stops where its caller ends it on loop detection's signal (`loopSignal` answering `end`, `./ladder-top.ts`)
// or the model asked the person (`./model-decision.ts`): the one way a run of refusals still ends a round. No count
// reaches here on its own (t1056): a loop with no caller to end it goes on, steered, until its result or its purse.

import { automationStudioFlowDraftStepCopy } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure } from "../evidence-loop/result.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceStallRecovery } from "./stall-recovery.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";
import type { AutomationStudioLlmEvidenceRefusedRepeatNext } from "./refused-repeat.ts";

/**
 * How the round stops: the error its caller built for a stall, the call its
 * caller recovers the stall with (`./stall-recovery.ts`), or the loop's own
 * ending where it built neither.
 */
export function automationStudioLlmEvidenceRepeatStall(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  issueCode: string = AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE,
  recoverAt?: number
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> {
  const { input, trace, accounting, draftSteps } = context;
  if (input.unusableDecisions) {
    const stall = recoverAt === undefined ? { kind: "stall" as const, issueCodes: [issueCode] } : automationStudioLlmEvidenceStallRecovery(context, recoverAt, [issueCode]);
    if (stall.kind === "recover") return stall;
    // The caller is asked to recover with the guard's codes alone; the stall it ends under also names the refusal the repeats followed (t748).
    return { kind: "stalled", error: input.unusableDecisions.stalled({ issueCodes: [...stall.issueCodes, ...lastRefusal(context)], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => automationStudioFlowDraftStepCopy(step)) }) };
  }
  return { kind: "end", result: failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting) };
}

/**
 * The prefix a stall carries the last refusal before its repeats under, as
 * `<prefix><code>` (t748). A run of refused repeats is a symptom: in live run
 * `run-mvgw7320-de416190` a reset brief's press was refused by Core, and the
 * builder asked one look again until a guard ended the brief, whose stall
 * then named only the guard. The supervisor's brief return
 * (`../../project-agents/dispatch/ending.ts`) and the debug read the stall's
 * codes; this one says which answer stranded the builder. Nothing more is refused.
 */
const LAST_REFUSAL = "llm_evidence_loop.last_refusal:";
/** The digest of its issues a submission refusal's code ends in (`../../flow-authoring/bootstrap/candidate/submission/`). */
const ISSUES_DIGEST = /:[0-9a-f]{8}$/u;

/** The newest call or look the history records as refused under a code of its own (not a refused repeat), as one code, or none. */
function lastRefusal(context: AutomationStudioLlmEvidenceDecisionHandlerContext): string[] {
  const records = context.history.records();
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const decision = records[index]!.decision;
    if ((decision.kind !== "call" && decision.kind !== "look") || decision.refused !== true) continue;
    const code = decision.resultCode;
    // Named by its family: a refusal code's digest of its issues (`family:1a2b3c4d`) is Core's key, never words a return may
    // carry (t630). Since t1056 a refused repeat reaches this stall at the top of loop detection's ladder, so it is said here.
    if (code && code !== "ok" && code !== AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) return [`${LAST_REFUSAL}${code.replace(ISSUES_DIGEST, "")}`];
  }
  return [];
}
