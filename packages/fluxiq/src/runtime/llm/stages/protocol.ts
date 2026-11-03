// The loop's fixed order of work.
//
// The improvement loop does not let the model choose what kind of work to do
// next. It gathers information, then plans, then implements, then iterates,
// then verifies, and it is told so in that order. This file is the whole of
// that order: the vocabulary, the position of each stage in it, and the rule
// for moving between them.
//
// The order is Core's. A domain may change what happens inside a stage -- see
// ./registry.ts -- and may change nothing about the sequence itself. That is
// not a convention here. The tuple is frozen, the only way to name a stage is
// to be in it, and every move between stages passes through one function that
// returns a named refusal rather than a boolean, so a caller that gets the
// order wrong is told which rule it broke.
//
// Nothing here names a page, a selector, a tab or a browser. Gathering,
// planning, implementing, iterating and verifying are what the work is, in any
// domain.

/**
 * The stages, in the only order they may be worked in. Frozen because a
 * consumer holding this array is holding Core's ordering authority; sorting or
 * splicing it in place would rewrite the protocol for everyone in the process.
 */
export const AUTOMATION_STUDIO_LOOP_STAGES = Object.freeze([
  "gather",
  "plan",
  "implement",
  "iterate",
  "verify"
] as const);

export type AutomationStudioLoopStage = (typeof AUTOMATION_STUDIO_LOOP_STAGES)[number];

/**
 * Why a move between stages was refused. Each one names a distinct way of
 * getting the order wrong, so a refusal is actionable and so a test can assert
 * the specific rule rather than "it threw".
 */
export type AutomationStudioLoopStageRefusalCode =
  | "loop_stage.unknown_stage"
  | "loop_stage.must_start_at_first_stage"
  | "loop_stage.skipped_stage"
  | "loop_stage.out_of_order";

export type AutomationStudioLoopStageTransition =
  | { ok: true; stage: AutomationStudioLoopStage }
  | { ok: false; code: AutomationStudioLoopStageRefusalCode; message: string };

export function isAutomationStudioLoopStage(value: unknown): value is AutomationStudioLoopStage {
  return typeof value === "string" && (AUTOMATION_STUDIO_LOOP_STAGES as readonly string[]).includes(value);
}

/** Position in the fixed order, counting from zero. */
export function automationStudioLoopStageIndex(stage: AutomationStudioLoopStage): number {
  return AUTOMATION_STUDIO_LOOP_STAGES.indexOf(stage);
}

/**
 * Whether the loop may move from `from` to `to`, and why not when it may not.
 *
 * Four rules, and between them they are the order:
 *
 * - a run starts at the first stage, never in the middle of the protocol;
 * - a stage may take as many calls as it needs, so staying put is allowed;
 * - work advances one stage at a time, so nothing may be skipped -- you cannot
 *   implement without having planned, or verify without having implemented;
 * - the only way back to earlier work is `iterate`, which is what that stage
 *   is for. From anywhere else, going back is a refusal.
 *
 * The last rule is the one worth stating plainly: iteration is part of the
 * fixed order rather than an escape from it. A loop that could re-enter an
 * earlier stage from anywhere would have no order left to speak of.
 */
export function automationStudioLoopStageTransition(
  from: AutomationStudioLoopStage | undefined,
  to: unknown
): AutomationStudioLoopStageTransition {
  if (!isAutomationStudioLoopStage(to)) {
    return { ok: false, code: "loop_stage.unknown_stage", message: `"${String(to)}" is not a stage of the Automation Studio loop. The stages are ${AUTOMATION_STUDIO_LOOP_STAGES.join(", ")}, and the set is Core's.` };
  }
  const first = AUTOMATION_STUDIO_LOOP_STAGES[0];
  if (from === undefined) {
    return to === first
      ? { ok: true, stage: to }
      : { ok: false, code: "loop_stage.must_start_at_first_stage", message: `The loop starts at "${first}" and reached "${to}" instead. The stage order is fixed by Core and a run may not begin part-way through it.` };
  }
  const fromIndex = automationStudioLoopStageIndex(from);
  const toIndex = automationStudioLoopStageIndex(to);
  if (toIndex === fromIndex || toIndex === fromIndex + 1) return { ok: true, stage: to };
  if (toIndex > fromIndex) {
    return { ok: false, code: "loop_stage.skipped_stage", message: `The loop moved from "${from}" to "${to}", skipping ${AUTOMATION_STUDIO_LOOP_STAGES.slice(fromIndex + 1, toIndex).join(", ")}. Work advances one stage at a time.` };
  }
  if (from === "iterate") return { ok: true, stage: to };
  return { ok: false, code: "loop_stage.out_of_order", message: `The loop moved back from "${from}" to "${to}". Earlier work is re-entered through the "iterate" stage, never directly.` };
}
