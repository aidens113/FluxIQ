// The gate the loop asks before it accepts a result: has this draft replayed?
//
// The rule and the verdict are in `../../flow-draft/dry-run.ts`; the replay
// itself is in `./replay-draft.ts`; this is the piece between them that the
// loop holds -- what has already replayed clean, what has already been put to
// the model, and what a refusal does to the evidence the next decision sees.
//
// It is a closure over the loop's own bookkeeping rather than a function the
// loop calls with everything, because three of those things are the loop's and
// must stay so: the evidence list, the byte allowance, and the epochs that
// decide whether a request has already been answered. What it takes instead is
// the four small doors onto them, so the loop's file keeps the loop.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftReplayable,
  automationStudioFlowDraftReplayOutcomeKey,
  automationStudioFlowDraftReplaySignature,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { replayAutomationStudioFlowDraft, type AutomationStudioFlowDraftReplayInput } from "./replay-draft.ts";

/**
 * What a gate answers.
 *
 * `undefined` is the only way past it: either the draft replayed clean, or it
 * is not a draft this gate applies to. The other three each end or interrupt
 * the completion the loop was about to accept.
 */
export type AutomationStudioFlowDraftDryRunRefusal = "cancelled" | "evidence_limit" | { issueCodes: readonly string[] };

export type AutomationStudioFlowDraftDryRunGateInput = {
  /** Off for a caller that turned the dry run off, or that accrues no draft. */
  enabled: boolean;
  /** The loop's own list, read as it stands and written back onto. */
  steps: AutomationStudioFlowDraftStep[];
  maxEvidenceBytes: number;
  executeTool: AutomationStudioFlowDraftReplayInput["executeTool"];
  /** Count a value against the loop's byte allowance; nothing when it does not fit. */
  reserveEvidence(value: JsonValue): number | undefined;
  /** Put an entry where the next decision's window will see it. */
  showEvidence(entry: { callId: string; toolId: string; value: JsonValue }): void;
  /**
   * Tell the loop the target moved.
   *
   * A replay acts on the world, so nothing the loop is holding is still the
   * newest look at it and no earlier request is still answered by what it has.
   */
  targetMoved(): void;
  signal?: AbortSignal;
};

/** The gate, as the loop's own `dryRun()`. */
export function automationStudioFlowDraftDryRunGate(
  input: AutomationStudioFlowDraftDryRunGateInput
): () => Promise<AutomationStudioFlowDraftDryRunRefusal | undefined> {
  let attempts = 0;
  // What a clean verdict was a verdict about. A draft edited since then has not
  // replayed clean, and a draft completed twice unchanged is not replayed twice.
  let cleanSignature: string | undefined;
  // Steps already put to the model as unreproducible. Asked once: a model told
  // that putting the target back could not undo a step's own effect, and that
  // finishes again with the step kept, has answered.
  const asked = new Set<string>();
  return async () => {
    if (!input.enabled || !automationStudioFlowDraftReplayable(input.steps)) return undefined;
    const signature = automationStudioFlowDraftReplaySignature(input.steps);
    if (signature === cleanSignature) return undefined;
    attempts += 1;
    let replay: Awaited<ReturnType<typeof replayAutomationStudioFlowDraft>>;
    try {
      replay = await replayAutomationStudioFlowDraft({
        steps: input.steps,
        attempt: attempts,
        asked,
        maxEvidenceBytes: input.maxEvidenceBytes,
        executeTool: input.executeTool,
        ...(input.signal ? { signal: input.signal } : {})
      });
    } catch {
      // Only a cancellation or a raised permission request reaches here, and
      // both end the run: the caller reads which it was from the signal.
      return "cancelled";
    }
    // The verdict goes onto the steps it is about, so the record of the draft
    // having been run as a Flow travels with the draft rather than living only
    // in a refusal the window may later evict.
    for (const outcome of replay.verdict.outcomes) {
      const step = input.steps.find((candidate) => candidate.position === outcome.step);
      if (step) step.replayed = { ...outcome };
      if (outcome.status === "unreproducible") asked.add(automationStudioFlowDraftReplayOutcomeKey(outcome));
    }
    input.targetMoved();
    if (replay.verdict.ok) {
      cleanSignature = signature;
      return undefined;
    }
    // The target as it was when the replay broke, which is what a correction
    // has to be made from, and then the verdict that says what to do about it.
    if (replay.evidence) {
      if (input.reserveEvidence(replay.evidence.value) === undefined) return "evidence_limit";
      input.showEvidence({ callId: replay.evidence.callId, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID, value: replay.evidence.value });
    }
    const feedback = automationStudioFlowDraftDryRunFeedback(replay.verdict);
    if (input.reserveEvidence(feedback) === undefined) return "evidence_limit";
    input.showEvidence({ callId: `${AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID}.${attempts}`, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, value: feedback });
    return { issueCodes: automationStudioFlowDraftDryRunIssueCodes(replay.verdict) };
  };
}
