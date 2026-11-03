import type { AutomationStudioProjectSupervisorContext } from "../context.ts";
import { automationStudioProjectSupervisorLeftOnTarget, type AutomationStudioProjectSupervisorLeftOnTarget } from "../left-on-target.ts";

// What a `project.dispatch` is answered against, as comparable keys.
//
// **Every refusal of a dispatch is about the build, not the page.** The repeat
// guard (`../../../llm/repeat-guard/outcomes.ts`) keys a call on its input and the
// page it found. The supervisor's own tools report no page, and a builder moves
// the target without the supervisor's loop seeing it, so after one look the page
// in the key stands still. `project.brief_repeated`, `project.repair_unchanged`
// and `project.reset_repeated` each tell the model what to do first; it did that,
// sent the identical call, and was refused unrun on the page it had looked at,
// though Core's own check would now have sent it. So a dispatch is keyed on what
// those checks read as well (`dispatch`, handed to the loop as the tool's
// `requestContextKey`, `../supervisor-loop.ts`): a fact of the build, never a
// word of an answer. Nothing is exempt: with none of it changed the identical
// call is refused unrun, as before, and counts in the same run of refusals.
//
// **An assemble refused is the same (t849).** `project.assemble` is refused until
// the briefs it needs came back, and a refused look is a failed call on its page,
// so it stayed refused however many came back. It is keyed on what it assembles
// (`assemble`), which it does not change itself, so the same assemble with nothing
// new is still answered from memory.
export const automationStudioProjectSupervisorRequestKeys = Object.freeze({
  /** The latest assembled Flow, its latest whole test and whether it may be tested again, as one comparable key (`../dispatch-tool.ts`). */
  standing(context: AutomationStudioProjectSupervisorContext): string {
    const latest = context.controller.latest();
    const standing = latest ? context.gate.standing(latest) : undefined;
    return JSON.stringify([latest?.revision ?? null, latest?.digest ?? null, standing?.trialRunId ?? null, standing?.verdict ?? null, context.gate.retestable()]);
  },

  /** What is left on the target, as one comparable key. */
  left(left: AutomationStudioProjectSupervisorLeftOnTarget): string {
    return JSON.stringify({ acts: left.acts.map((act) => [act.act, act.undoable]).sort() });
  },

  /** What an assemble reads (header): the plan in force and the returns heard under it. */
  assemble(context: AutomationStudioProjectSupervisorContext): string {
    const { state } = context;
    return JSON.stringify({ plan: state.structure?.digest ?? null, returns: state.answeredUnderPlan().map((answered) => answered.brief.briefId) });
  },

  /**
   * Everything a dispatch's own refusals read (header): the plan in force, the
   * returns heard under it, what stands, what is left on the target, and whether
   * a reset is the last thing that came back. A dispatch that failed with no
   * builder started adds none of them, so sending it again is the same call; one
   * that started any is recorded on the key it left, so that call is the same too.
   */
  dispatch(context: AutomationStudioProjectSupervisorContext): string {
    const { state, ports } = context;
    return JSON.stringify({
      builtFrom: this.assemble(context),
      standing: this.standing(context),
      left: this.left(automationStudioProjectSupervisorLeftOnTarget(ports)),
      resetLast: state.resetCameBackLast()
    });
  }
});
