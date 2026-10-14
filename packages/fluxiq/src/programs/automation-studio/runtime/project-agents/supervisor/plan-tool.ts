import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectPlanCard } from "../../activity/project/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { AutomationStudioProjectRecordRefusal } from "../record/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorPlanInput } from "./plan-input.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/**
 * `project.write_plan` (`write`, once) and `project.amend_plan` (`amend`, a
 * new revision with its reason). The task spec and the structure plan are
 * checked whole before anything is written (`./plan-input.ts`), then written
 * to the build record -- a spec only when it changed -- and an amendment
 * logged as a re-plan. Briefs and proposals made under an earlier plan stop
 * counting by their plan digest (`./state.ts`). The plan goes to the chat as
 * its card.
 */
export async function automationStudioProjectSupervisorPlanTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject, mode: "write" | "amend"): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state } = context;
  if (mode === "write" && state.structure) return answer.refused("project.plan_exists", GUIDANCE.refusals.planExists);
  if (mode === "amend" && !state.structure) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (mode === "amend" && !reason) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: [{ code: "project.amend_reason_missing", path: "reason" }] });
  const read = automationStudioProjectSupervisorPlanInput(value, ports.sources);
  if (!read.ok) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: read.issues });
  try {
    if (state.taskSpec?.digest !== read.taskSpec.digest) await ports.record.recordTaskSpec(ports.build, read.taskSpec, ports.sources);
    await ports.record.recordPlan(ports.build, read.structure);
    if (mode === "amend") await ports.record.recordDecision(ports.build, { kind: "re_plan", reason: reason.slice(0, 2000), briefIds: [], planDigest: read.structure.digest });
  } catch (error) {
    if (!(error instanceof AutomationStudioProjectRecordRefusal)) throw error;
    return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: [{ code: error.code, path: error.path }] });
  }
  state.taskSpec = read.taskSpec;
  state.structure = read.structure;
  state.purposes = read.purposes;
  const reserveUsd = ports.purse?.keptBackUsd();
  emitAutomationStudioProjectPlanCard({ taskSpec: read.taskSpec, structurePlan: read.structure, purposes: read.purposes, ...(reserveUsd ? { reserveUsd } : {}) });
  return answer.answered({
    ok: true,
    written: mode === "write" ? "plan" : "plan_revision",
    parts: read.taskSpec.parts.map((part) => part.id),
    subflows: read.structure.plan.subflows.map((subflow) => ({
      key: subflow.key,
      callable: subflow.interface !== undefined,
      ...(subflow.interface ? { inputs: subflow.interface.inputs.map((port) => port.id), outputs: subflow.interface.outputs.map((port) => port.id) } : {}),
      parts: [...(read.structure.partOf[subflow.key] ?? [])]
    })),
    next: GUIDANCE.next.afterPlan
  });
}
