// How a draft step says it is not simply the next thing that happens.
//
// **The failure this closes.** A draft could express one shape: a straight
// line. Every step it kept ran, in order, unconditionally -- so a build that
// dismissed a consent banner produced a Flow that *always* dismisses a consent
// banner, and the first run on a page that showed none failed at a step that
// had nothing to press. The dry run (`./dry-run.ts`) found this and could only
// ask the model about it once, because the honest answer -- "do this only when
// it is there" -- was not sayable. This module is that answer.
//
// **Four statements, and each is one word the model writes about one step.**
//
//   optional   -- this step may fail; the Flow carries on without it.
//   only_if    -- run this step only when the step before it succeeded.
//   on_failed  -- when this step fails, run that step instead, then carry on.
//   repeat     -- do this step, through that one, once for each row a step
//                 produced, or for as long as a check keeps holding.
//
// **Nothing here is a graph.** A routing statement names other *steps*, by the
// same numbers the draft already shows the model, and says what they are to
// each other. Which node joins the paths back, which port carries which edge,
// where the loop closes and what bounds it are Core's to derive
// (`flow-bootstrap/authoring/assemble-draft.ts`) from the node definitions --
// exactly as the keys, the edges and the router already are. A grammar in which
// the model wired ports itself is a grammar it would get wrong, and a wrong
// edge is a Flow that does the wrong thing quietly.
//
// **A statement names steps by id, never by position.** The model reads and
// writes positions, because that is what it is shown; positions are renumbered
// the moment a step is reordered or dropped, so what is *kept* is the step's
// own id and the translation happens once, where the amendment is applied
// (`./amendment.ts`).

import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsProposed } from "./step.ts";

/** Every statement a step may carry about when it runs. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_ROUTING_KINDS = ["optional", "only_if", "on_failed", "repeat"] as const;

export type AutomationStudioFlowDraftStepRoutingKind = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_ROUTING_KINDS)[number];

/**
 * What one step says about when it runs, and what runs with it.
 *
 * Each id names another step of the same draft. An id that names no proposed
 * step makes the statement unusable, which the assembler reports rather than
 * silently ignoring: a Flow that quietly lost its recovery edge looks exactly
 * like a Flow that never had one.
 */
export type AutomationStudioFlowDraftStepRouting =
  /** The Flow carries on when this step fails. */
  | { kind: "optional" }
  /** This step runs only when the step `check` succeeded; otherwise it is skipped. */
  | { kind: "only_if"; check: string }
  /** When this step fails, the step `to` runs instead, and the Flow carries on after both. */
  | { kind: "on_failed"; to: string }
  /**
   * This step through `through` repeat: once for each row the step `over`
   * produced, or for as long as `over` keeps succeeding. Which of the two is
   * read off `over`'s own node definition, because a node that declares a list
   * output is a list and one that does not is a check.
   */
  | { kind: "repeat"; through: string; over: string };

/**
 * A step's stable name.
 *
 * The loop assigns `id` when it appends the step and never changes it, so a
 * routing statement survives a reorder. A step built without one -- a test, an
 * older record -- falls back to its position, which is the best name there is
 * for a step nothing will renumber.
 */
export function automationStudioFlowDraftStepId(step: AutomationStudioFlowDraftStep): string {
  return step.id ?? `p${step.position}`;
}

/** The proposed step with this id, or nothing when the draft has none. */
export function automationStudioFlowDraftStepById(
  steps: readonly AutomationStudioFlowDraftStep[],
  id: string
): AutomationStudioFlowDraftStep | undefined {
  return steps.find((step) => automationStudioFlowDraftStepId(step) === id);
}

/** Every step one statement names, including the step carrying it. */
export function automationStudioFlowDraftRoutingReferences(routing: AutomationStudioFlowDraftStepRouting): string[] {
  if (routing.kind === "only_if") return [routing.check];
  if (routing.kind === "on_failed") return [routing.to];
  if (routing.kind === "repeat") return [routing.through, routing.over];
  return [];
}

/**
 * The steps a Flow built from this draft would not always run.
 *
 * Used by the dry run, and it is the whole reason the dry run can stop asking
 * the same question. A replay runs every proposed step once, in order; a step
 * the Flow only runs in some situations may legitimately not run in the one the
 * replay is in, and failing the proposal for that would refuse the very Flow
 * the model was asked to write. So a step named here answers for itself and
 * never blocks -- and a step *not* named here still does, because an
 * unconditional step that does not replay is a Flow that does not run.
 *
 * Four kinds of step are in it: one the model marked `optional`, one it made
 * conditional with `only_if`, the check that guards such a step (the check
 * failing is how the skip happens), and a step some other step falls back to,
 * which by construction runs only when that step failed.
 */
export function automationStudioFlowDraftConditionalStepIds(
  steps: readonly AutomationStudioFlowDraftStep[]
): ReadonlySet<string> {
  const conditional = new Set<string>();
  for (const step of steps) {
    const routing = step.routing;
    if (!routing) continue;
    if (routing.kind === "optional") conditional.add(automationStudioFlowDraftStepId(step));
    if (routing.kind === "only_if") {
      conditional.add(automationStudioFlowDraftStepId(step));
      conditional.add(routing.check);
    }
    if (routing.kind === "on_failed") conditional.add(routing.to);
  }
  return conditional;
}

/**
 * The step a statement that names none defaults to: the proposed step written
 * immediately before this one.
 *
 * Both defaults this serves are the same observation. A check is run right
 * before the step it guards, because that is the only order in which running it
 * tells you anything; and the list a span repeats over is the step that
 * produced it, which is the step before the span. Deriving them is the standing
 * rule that Core fills in whatever it can rather than asking the model for a
 * field it would have to count out.
 */
export function automationStudioFlowDraftPrecedingProposedStep(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep
): AutomationStudioFlowDraftStep | undefined {
  const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
  const index = proposed.findIndex((candidate) => candidate === step);
  return index > 0 ? proposed[index - 1] : undefined;
}
