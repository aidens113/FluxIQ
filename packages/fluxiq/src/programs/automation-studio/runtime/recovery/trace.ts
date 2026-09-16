// What the loop did, stage by stage, in the order the stages are allowed to
// happen.
//
// A run that failed and was worked on used to leave four unrelated traces: an
// intervention list, a `llmGate` object, a `runtimePatchAttempts` array and an
// `adaptiveRetry` record, each written by a different part of the service and
// none of them saying what the loop was *trying to do* at the time. The web UI
// reassembled them into stages named "LLM", "Patch Test", "Adaptation" and
// "Retry" — four names for the mechanics, and none for the work.
//
// This is the work: diagnosis, recovery plan, exploration, resolution. A closed
// vocabulary, in a fixed order, written additively onto the run. It is the
// failure entry point's reading of Core's five-stage loop protocol, and each
// event says which protocol stage it drove, so the two orders cannot be
// reconciled by guesswork later.
//
// Three properties are deliberate.
//
// **Content-free.** An event carries a stage, a status, a Core-authored reason
// and counts. It never carries a model's prose, a page's contents or a repair
// target. Everything here is safe to read a week later, in a Lab assertion, by
// somebody who must not see the page.
//
// **Out of order is refused, not reordered.** An `exploration` event with no
// earlier `recovery_plan` is dropped and the drop is recorded. Sorting it into
// place would invent a plan that never happened, which is exactly the failure
// mode the stages exist to prevent.
//
// **Nothing here says "succeeded".** A resolution event names what was
// produced — an adaptation, a proposal, a deterministic action to run, nothing
// at all — and never that the recovery worked. Whether it worked is a verdict
// from observed evidence, which is Phase 2.4's, and a trace that claimed it
// early would be the same defect this plan's Phase D was written to remove:
// success recorded from the absence of contradicting evidence.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLoopStage } from "../llm/index.ts";

/** The loop's stages at the failure entry point, in the only order they may occur. */
export const AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES = Object.freeze([
  "diagnosis",
  "recovery_plan",
  "exploration",
  "resolution"
] as const);

export type AutomationStudioRecoveryTraceStage = (typeof AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES)[number];

/**
 * How a stage ended.
 *
 * `completed` means the stage ran and produced its answer, not that the answer
 * was good news. `skipped` means it did not need to run; `refused` means
 * something declined to let it; `failed` means it ran and did not produce an
 * answer.
 */
export type AutomationStudioRecoveryTraceStatus = "completed" | "skipped" | "refused" | "failed";

export type AutomationStudioRecoveryTraceEvent = {
  stage: AutomationStudioRecoveryTraceStage;
  status: AutomationStudioRecoveryTraceStatus;
  /** Core's own sentence for what happened. Never a model's. */
  reason: string;
  /** The protocol stage this drove, when it drove one. */
  loopStage?: AutomationStudioLoopStage;
  /** Whether a provider was called for this stage. The deterministic-first receipt. */
  providerCalled: boolean;
  /** Counts and verdicts only. */
  detail?: JsonObject;
};

export type AutomationStudioRecoveryTraceRefusal = {
  stage: AutomationStudioRecoveryTraceStage;
  code:
    | "recovery_trace.stage_out_of_order"
    | "recovery_trace.stage_repeated"
    | "recovery_trace.missing_prerequisite"
    | "recovery_trace.unknown_stage";
  message: string;
};

/**
 * What must already have happened before a stage may be recorded.
 *
 * Exploration and resolution both require a plan, and that is the rule worth
 * stating: exploring without a plan is the loop acting on its own initiative,
 * and resolving without one is a result attributed to work nobody asked for.
 * Exploration is *not* a prerequisite for resolution, because a plan that asked
 * for no exploration still resolves.
 */
const AUTOMATION_STUDIO_RECOVERY_TRACE_PREREQUISITES: Readonly<Record<AutomationStudioRecoveryTraceStage, readonly AutomationStudioRecoveryTraceStage[]>> = Object.freeze({
  diagnosis: [],
  recovery_plan: ["diagnosis"],
  exploration: ["diagnosis", "recovery_plan"],
  resolution: ["diagnosis", "recovery_plan"]
});

export type AutomationStudioRecoveryTrace = {
  schemaVersion: "automation-studio.recovery-trace.v1";
  stages: AutomationStudioRecoveryTraceEvent[];
  /** Every event that was not admitted, and why. Empty on every ordered trace. */
  refused: AutomationStudioRecoveryTraceRefusal[];
};

/**
 * The trace, from events offered in the order they happened.
 *
 * An event that breaks the order is dropped rather than admitted or sorted, and
 * the drop is recorded in `refused`. This returns a value rather than throwing
 * because it is called while annotating a finished run: a run that already
 * failed must not be lost a second time to a bookkeeping error, and a silent
 * drop would be worse than either.
 */
export function buildAutomationStudioRecoveryTrace(events: readonly AutomationStudioRecoveryTraceEvent[]): AutomationStudioRecoveryTrace {
  const stages: AutomationStudioRecoveryTraceEvent[] = [];
  const refused: AutomationStudioRecoveryTraceRefusal[] = [];
  const seen = new Set<AutomationStudioRecoveryTraceStage>();
  let highest = -1;
  for (const event of events) {
    const index = AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES.indexOf(event.stage);
    if (index < 0) {
      refused.push({ stage: event.stage, code: "recovery_trace.unknown_stage", message: `"${String(event.stage)}" is not a recovery stage. The stages are ${AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES.join(", ")}.` });
      continue;
    }
    if (seen.has(event.stage)) {
      refused.push({ stage: event.stage, code: "recovery_trace.stage_repeated", message: `The "${event.stage}" stage was recorded twice in one recovery. Each stage happens once.` });
      continue;
    }
    if (index <= highest) {
      refused.push({ stage: event.stage, code: "recovery_trace.stage_out_of_order", message: `"${event.stage}" was recorded after "${AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES[highest]}". Recovery stages happen in the order ${AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES.join(" then ")}.` });
      continue;
    }
    const missing = AUTOMATION_STUDIO_RECOVERY_TRACE_PREREQUISITES[event.stage].filter((prerequisite) => !seen.has(prerequisite));
    if (missing.length) {
      refused.push({ stage: event.stage, code: "recovery_trace.missing_prerequisite", message: `"${event.stage}" was recorded without ${missing.join(" or ")}. A stage that never happened cannot be inferred from a later one.` });
      continue;
    }
    seen.add(event.stage);
    highest = index;
    stages.push(event);
  }
  return { schemaVersion: "automation-studio.recovery-trace.v1", stages, refused };
}
