// How an attempt went at its task, once it has ended (design, "Path"), for the row and for the
// chat's "Used what I saved".
//
//   no run went out                                                     explore
//   a whole run, judged yes, no rounds                                  run_flow
//   not achieved, and no round decided anything after the run           run_flow
//   rounds, all in the first round, a yes, something repaired (the run
//   stopped at a step, a forward run went over the Flow, or the Flow
//   changed), and every step of the Flow as it ends ran in this attempt run_flow_then_repair
//   anything else after a run                                           run_flow_then_explore
//
// **Every step of the Flow ran in this attempt** (the contract: "a failing step was repaired live from
// the page it left"). A step ran when the saved Flow's own run passed it (or passed over it), when a
// forward run passed it, or when this attempt made it and ran it live: a step done by hand from the
// page the run left is that step repaired live, as much as a rewritten one a forward run then passed.
// So a hand fix after a broken run, in the broken step's place (`../flow-run/stand-in.ts`), is a repair, and so
// is a forward run from the repaired step to the end. A step written and never run, a saved step the
// run never reached and no forward run passed, or the broken step still standing in the Flow, makes it
// an exploration: the Flow as it ends was not run from where it broke to its end.
//
// An attempt that ran out, or was stopped, before any round made a decision worked nothing out, so
// it does not say it did. A carried-on attempt keeps its history: once a run has gone out it never
// reads `explore` again, and a press is a fresh start, so it is no longer a repair.

import type { AutomationStudioTaskAttemptPath } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

type PathRun = Pick<AutomationStudioAnswerFirstAttemptRun, "flowRun" | "prior" | "decidedAfterRun" | "path" | "steps" | "startedWith" | "forwardPassed">;

export function automationStudioAnswerFirstPathAtEnding(run: PathRun, ending: AutomationStudioAnswerFirstRoundsEnding): AutomationStudioTaskAttemptPath {
  const ran = run.flowRun?.wentOut === true || (run.prior !== undefined && run.prior.path !== "explore");
  if (!ran) return "explore";
  if (ending !== "achieved") return run.decidedAfterRun ? "run_flow_then_explore" : "run_flow";
  if (run.flowRun?.judged === "yes") return "run_flow";
  return run.path === "run_flow_then_repair" && somethingRepaired(run) && everyStepRan(run) ? "run_flow_then_repair" : "run_flow_then_explore";
}

/** The run stopped at a failing step, a forward run went over the Flow again, or the Flow as it ends is not the one saved: a whole run whose judge said no, or never answered, and nothing done to the Flow after it, repaired nothing. */
function somethingRepaired(run: PathRun): boolean {
  const outcome = run.flowRun?.wentOut ? run.flowRun.outcome : undefined;
  if ((outcome?.kind === "ran" && !outcome.reachedEnd) || run.forwardPassed.size > 0) return true;
  const flowOf = (steps: readonly AutomationStudioFlowDraftStep[]) => steps.filter(automationStudioFlowDraftStepIsProposed).map(automationStudioFlowDraftStepId).join(" ");
  return flowOf(run.startedWith) !== flowOf(run.steps);
}

/** Every step the Flow proposes as the attempt ends ran in this attempt (header). A Flow of no steps repaired nothing. */
function everyStepRan(run: PathRun): boolean {
  const proposed = run.steps.filter(automationStudioFlowDraftStepIsProposed);
  if (proposed.length === 0) return false;
  const saved = new Set(run.startedWith.map(automationStudioFlowDraftStepId));
  const byTheRun = passedByTheRun(run);
  return proposed.every((step) => {
    const id = automationStudioFlowDraftStepId(step);
    if (run.forwardPassed.has(id)) return true;
    if (saved.has(id)) return byTheRun.has(id);
    return step.written !== true;
  });
}

/** The saved steps the saved Flow's own run got through, by id: passed, or passed over by its own rules. */
function passedByTheRun(run: PathRun): Set<string> {
  const outcome = run.flowRun?.wentOut ? run.flowRun.outcome : undefined;
  if (outcome?.kind !== "ran") return new Set();
  const idAt = new Map(run.startedWith.map((step) => [step.position, automationStudioFlowDraftStepId(step)] as const));
  return new Set(outcome.steps.flatMap((step) => {
    const id = idAt.get(step.position);
    return id !== undefined && (step.ran === "passed" || step.ran === "skipped") ? [id] : [];
  }));
}
