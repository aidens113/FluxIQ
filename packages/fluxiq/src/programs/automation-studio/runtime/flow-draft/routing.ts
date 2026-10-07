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
// (`./amendment/`).

import { automationStudioFlowDraftStepAnsweredInterruption } from "./interruption.ts";
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
  | { kind: "repeat"; through: string; over: string; while?: never; most?: never }
  /**
   * This step through `through` run, then run again while the span's last
   * step -- `while`, always the same step as `through` -- succeeds, at most
   * `most` passes (the Repeat node's default when absent). The span runs at
   * least once, and the last step's `ended` answer leaves the loop: the shape
   * of "read the list, press Next, repeat while Next is there", which no
   * repeat over an earlier step can state, since its check would have to run
   * before the read (read-list design, section 4).
   */
  | { kind: "repeat"; through: string; while: string; most?: number; over?: never };

/** A repeat over a list or a check before the span. */
export type AutomationStudioFlowDraftRepeatOverRouting = Extract<AutomationStudioFlowDraftStepRouting, { over: string }>;

/** A repeat that runs its span, then again while the span's last step succeeds. */
export type AutomationStudioFlowDraftRepeatWhileRouting = Extract<AutomationStudioFlowDraftStepRouting, { while: string }>;

/** Whether a repeat runs while its own last step succeeds, rather than over an earlier step. */
export function automationStudioFlowDraftRepeatIsWhile(routing: AutomationStudioFlowDraftStepRouting | undefined): routing is AutomationStudioFlowDraftRepeatWhileRouting {
  return routing?.kind === "repeat" && typeof routing.while === "string";
}

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
  if (automationStudioFlowDraftRepeatIsWhile(routing)) return [routing.through, routing.while];
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
 * Six kinds of step are in it: one the model marked `optional`, one it made
 * conditional with `only_if`, the check that guards such a step (the check
 * failing is how the skip happens), a step some other step falls back to,
 * which by construction runs only when that step failed, every step of a
 * span that repeats, and one the host says answered an interruption
 * (`./interruption.ts`), which the Flow is written with as optional. A
 * repeated step runs once per row, or while a check holds -- zero times or
 * many, never "once, on a fresh start" -- and the row the
 * build acted on is already done on a site that remembers it: the Confirm it
 * pressed is gone. Replayed as an unconditional step it fails or is
 * unreproducible every time, and in live run `run-munq51ik-a7ebd077` that
 * refused nine of ten completions of a correct loop (lane t195). In live run
 * `run-murwdp4f-35f976d2` an interruption step judged mandatory refused the
 * Flow twice on that step alone, while every later step replayed: the Flow it
 * was written into would have skipped it.
 */
export function automationStudioFlowDraftConditionalStepIds(
  steps: readonly AutomationStudioFlowDraftStep[]
): ReadonlySet<string> {
  return new Set(automationStudioFlowDraftConditionalStepReasons(steps).keys());
}

/**
 * Why the Flow would not always run a step, one word per kind above:
 * `interruption` (the host says it answered one), `optional`, `only_if`,
 * `check` (the step an `only_if` runs on), `fallback` (the step an
 * `on_failed` falls back to) and `repeat` (a member of a repeating span).
 */
export type AutomationStudioFlowDraftConditionalReason = "interruption" | "optional" | "only_if" | "check" | "fallback" | "repeat";

/**
 * The steps a Flow built from this draft would not always run, each with why:
 * the same steps as `automationStudioFlowDraftConditionalStepIds`, which is
 * read from this, so the two can never disagree. A step with more than one
 * reason keeps the first found, in draft order. The reason is what a test that
 * passed over such a step says of it (`./excused.ts`): "failed", with nothing
 * more, was read by the judge as a step to fix or remove (t193 1002-M,
 * `run-murzln6g-11debe1d`, C6).
 */
export function automationStudioFlowDraftConditionalStepReasons(
  steps: readonly AutomationStudioFlowDraftStep[]
): ReadonlyMap<string, AutomationStudioFlowDraftConditionalReason> {
  const reasons = new Map<string, AutomationStudioFlowDraftConditionalReason>();
  const add = (id: string, reason: AutomationStudioFlowDraftConditionalReason): void => {
    if (!reasons.has(id)) reasons.set(id, reason);
  };
  for (const step of steps) {
    if (automationStudioFlowDraftStepAnsweredInterruption(step)) add(automationStudioFlowDraftStepId(step), "interruption");
    const routing = step.routing;
    if (!routing) continue;
    if (routing.kind === "optional") add(automationStudioFlowDraftStepId(step), "optional");
    if (routing.kind === "only_if") {
      add(automationStudioFlowDraftStepId(step), "only_if");
      add(routing.check, "check");
    }
    if (routing.kind === "on_failed") add(routing.to, "fallback");
    // A span that runs again while its last step succeeds always runs once,
    // so a failure of one of its steps is a failure of the Flow (read-list
    // design, S2): its members are not excused.
    if (routing.kind === "repeat" && !automationStudioFlowDraftRepeatIsWhile(routing)) for (const member of repeatedSpan(steps, step, routing.through)) add(member, "repeat");
  }
  return reasons;
}

/** The ids of a repeating span: this step through `through`, in draft order; just this step when `through` is not after it. */
function repeatedSpan(steps: readonly AutomationStudioFlowDraftStep[], first: AutomationStudioFlowDraftStep, through: string): string[] {
  const start = steps.indexOf(first);
  const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
  if (start < 0 || end < start) return [automationStudioFlowDraftStepId(first)];
  return steps.slice(start, end + 1).filter(automationStudioFlowDraftStepIsProposed).map(automationStudioFlowDraftStepId);
}

/**
 * Why a repeat cannot run where its steps now stand, or nothing when it can:
 * `over_after`, the step it repeats over is not before it; `span_broken`, the
 * step its span runs through is before it. A name that names no step is the
 * assembler's to report (header), not this.
 *
 * A statement names steps by id, so a reorder never changes which steps a
 * repeat names -- but it can leave the listing after the step that repeats
 * over it. Live run `run-musr9pv3-f4bf6256` carried such a repeat from decision
 * 0056 on; a decision that moves a step now checks every repeat with this and
 * takes off the ones that cannot run (`./amendment/repeat-revalidation.ts`).
 *
 * A repeat that runs again while its last step succeeds repeats over no
 * earlier step, so it is never `over_after`; its `while` is its `through`, and
 * a `while` before its step is `span_broken`.
 */
export function automationStudioFlowDraftRepeatOrderProblem(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  routing: Extract<AutomationStudioFlowDraftStepRouting, { kind: "repeat" }>
): "over_after" | "span_broken" | undefined {
  const start = steps.indexOf(step);
  const indexOf = (id: string): number => steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === id);
  const through = indexOf(routing.through);
  if (automationStudioFlowDraftRepeatIsWhile(routing)) {
    if (start < 0 || through < 0) return undefined;
    return through < start ? "span_broken" : undefined;
  }
  const over = indexOf(routing.over);
  if (start < 0 || over < 0 || through < 0) return undefined;
  if (over >= start) return "over_after";
  if (through < start) return "span_broken";
  return undefined;
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
