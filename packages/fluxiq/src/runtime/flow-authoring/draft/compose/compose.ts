// The framework drafts the Flow from the calls that worked (D16).
//
// **The failure this closes.** Authoring the draft by hand cost the model most of its decisions: the
// audit counted 44 `amend_draft` decisions in one round, 28 of them refused `draft_unchanged`, and a
// step that worked was in the Flow only if the model remembered to add it. User, 2026-11-25: "Drafting
// the flow automatically will help in many situations, as long as the model is able and encouraged to
// edit it for more efficient flows." So every step that worked is in, in run order, and the model edits
// what the framework got wrong.
//
// **The rules,** in this order, each on the facts the host stated on the call (`../step.ts`):
//
//   1. `replaced` (a rerun took its place), `look` (it only looked), `did_not_work` (it failed or
//      changed nothing);
//   2. reads that are not the result's -- `not_the_result` (`./result-reads.ts`);
//   3. `undone`: a press a later press of the same control undid (`./undone.ts`);
//   4. `dead_end`: a detour that came back to where it started with nothing lasting (`./dead-end.ts`),
//      and a press after the result's last read that nothing lasting follows (`./after-result.ts`);
//   5. `repeat`: a step that copies one already in the Flow (`../second-copy.ts`). Of two presses that
//      copy each other the first stays and the second goes. Of two reads of one list with nothing
//      changed between them the later stays: it is the model's latest word on that list, and the offline
//      replay of run `run-mwveg5ls-0266dfe0` (t1037) kept a read with the wrong fields and dropped the
//      corrected read after it while the first copy won. This follows `dead_end`, so a press made again
//      after a detour came back keeps the second, the one that stayed.
//
// **The model has the last word.** A step is the framework's while it carries `drafted`, or is `taken`
// with none (just appended). Every other step is the model's ruling and is copied as it is; when it is
// `kept` it counts as in the Flow for the rules above. A step that comes back in has its stale reason,
// and the `cancels` an `undone` step carried, cleared.
//
// Pure and idempotent: a copy in the same order with the same positions, the input untouched, and the
// same answer if run again on its own output, so it can run after every append and every edit, and a
// later, better read moves the result while the earlier pick goes back out.
import { automationStudioFlowDraftSecondCopy } from "../second-copy.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftMarkAfterResult } from "./after-result.ts";
import { automationStudioFlowDraftMarkDeadEnds } from "./dead-end.ts";
import { automationStudioFlowDraftIsFrameworkStep } from "./framework-step.ts";
import { automationStudioFlowDraftMark } from "./mark.ts";
import { automationStudioFlowDraftResultReads } from "./result-reads.ts";
import { automationStudioFlowDraftComposeUndone } from "./undone.ts";

type Step = AutomationStudioFlowDraftStep;

/** The draft's steps with the framework's word on each, in the same order. */
export function automationStudioFlowDraftCompose(input: {
  steps: readonly Step[];
  /** Whether a read reads the table the person asked for; absent, or accepting none, the last read is the result. */
  isAskedTable?: (step: Step) => boolean;
}): Step[] {
  const working = input.steps.map((step) => ({ ...step }));
  const framework = new Set(working.filter(automationStudioFlowDraftIsFrameworkStep));
  const ordered = [...working].sort((a, b) => a.position - b.position);
  for (const step of framework) {
    // A step that comes back in is not left holding the pairing an `undone` step carried.
    if (step.drafted === "undone") delete step.cancels;
    const reason = leftOutBeforeReads(step);
    automationStudioFlowDraftMark(step, reason ?? "in");
  }
  const resultReads = markReads(ordered, framework, input.isAskedTable);
  automationStudioFlowDraftComposeUndone(ordered, framework);
  automationStudioFlowDraftMarkDeadEnds(ordered, framework, resultReads);
  automationStudioFlowDraftMarkAfterResult(ordered, framework, resultReads);
  markRepeats(ordered, framework);
  return working;
}

/** Rule 1: why a step is out whatever else is true of it. */
function leftOutBeforeReads(step: Step): "replaced" | "look" | "did_not_work" | undefined {
  if (step.replacedBy !== undefined) return "replaced";
  if (!automationStudioFlowDraftStepIsAction(step)) return "look";
  if (!automationStudioFlowDraftStepIsProposable(step)) return "did_not_work";
  return undefined;
}

/** Rule 2: marks the framework's reads that are not the result's, and returns the reads that are. */
function markReads(ordered: readonly Step[], framework: ReadonlySet<Step>, isAskedTable: ((step: Step) => boolean) | undefined): Set<Step> {
  const reads = ordered.filter((step) => framework.has(step) && step.disposition === "kept" && step.effect === "observe");
  // The model's own pick, even on a step it ruled on, outranks the framework's choice.
  const named = ordered.filter((step) => !framework.has(step) && step.result === true && step.disposition === "kept");
  const results = new Set(named.length > 0 ? reads.filter((step) => step.result === true) : automationStudioFlowDraftResultReads(reads, isAskedTable));
  for (const step of named) results.add(step);
  for (const step of reads) {
    if (!results.has(step)) automationStudioFlowDraftMark(step, "not_the_result");
  }
  return results;
}

/**
 * Rule 5: a copy of a step in the Flow is out. A press is compared with those before it, so the second
 * goes; a read is compared from the last back, so each earlier copy of it goes and the latest read of a
 * list stays. A copy that is the model's word stays, and the framework's step copying it goes instead.
 */
function markRepeats(ordered: readonly Step[], framework: ReadonlySet<Step>): void {
  ordered.forEach((step, index) => {
    if (step.effect === "observe" || !framework.has(step) || step.disposition !== "kept") return;
    if (automationStudioFlowDraftSecondCopy(ordered.slice(0, index), step) !== undefined) automationStudioFlowDraftMark(step, "repeat");
  });
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const later = ordered[index]!;
    if (later.effect !== "observe" || later.disposition !== "kept") continue;
    let copy = automationStudioFlowDraftSecondCopy(ordered.slice(0, index), later);
    while (copy !== undefined && framework.has(copy)) {
      automationStudioFlowDraftMark(copy, "repeat");
      copy = automationStudioFlowDraftSecondCopy(ordered.slice(0, index), later);
    }
    if (copy !== undefined && framework.has(later)) automationStudioFlowDraftMark(later, "repeat");
  }
}
