import type { AutomationStudioLlmEvidencePlanningStep, AutomationStudioLlmEvidencePlanningTools } from "../../llm/evidence-progress/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_LOOK_BUDGET } from "./look-budget.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "./tool-ids.ts";

/**
 * What the supervisor's loop is told it plans with (`planning`,
 * `../../llm/evidence-progress/planning-tools.ts`; t569): its own tools, which
 * looks are never withdrawn from; its look budget
 * (`./look-budget.ts`); and its next planning step, read from where the build
 * stands each time a note asks -- no plan yet: write it; a subflow that carries
 * parts and has no done proposal: brief it; nothing assembled since: assemble;
 * the latest assembly untested: test it; judged other than yes: change a
 * subflow or the plan; judged yes: complete.
 */
export function automationStudioProjectSupervisorPlanning(context: AutomationStudioProjectSupervisorContext): AutomationStudioLlmEvidencePlanningTools {
  return {
    toolIds: [IDS.writePlan, IDS.amendPlan, IDS.dispatch, IDS.assemble, IDS.testCandidate],
    lookBudget: AUTOMATION_STUDIO_PROJECT_SUPERVISOR_LOOK_BUDGET,
    next: () => next(context)
  };
}

function next(context: AutomationStudioProjectSupervisorContext): AutomationStudioLlmEvidencePlanningStep {
  const { state, controller, gate } = context;
  const structure = state.structure;
  if (!structure) return { toolId: IDS.writePlan, instruction: GUIDANCE.forward.writePlan };
  const done = state.latestDone();
  const unbuilt = structure.plan.subflows.some((subflow) => (structure.partOf[subflow.key] ?? []).length > 0 && !done.has(subflow.key));
  if (unbuilt) return { toolId: IDS.dispatch, instruction: GUIDANCE.forward.dispatch };
  const latest = controller.latest();
  if (!latest) return { toolId: IDS.assemble, instruction: GUIDANCE.forward.assemble };
  const verdict = gate.standing(latest)?.verdict;
  if (verdict === undefined) return { toolId: IDS.testCandidate, instruction: GUIDANCE.forward.test };
  if (verdict !== "yes") return { toolId: IDS.dispatch, instruction: GUIDANCE.forward.changeAfterNo };
  return { instruction: GUIDANCE.forward.complete };
}
