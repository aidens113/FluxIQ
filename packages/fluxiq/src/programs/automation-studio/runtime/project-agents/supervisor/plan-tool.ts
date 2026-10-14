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
 * new revision with its reason). The task spec and the planning format are
 * checked whole, and the structure plan compiled from them, before anything is
 * written (`./plan-input.ts`), then written
 * to the build record -- a spec only when it changed -- and an amendment
 * logged as a re-plan. Briefs and proposals made under an earlier plan stop
 * counting by their plan digest (`./state.ts`). The plan goes to the chat as
 * its card. A written plan's answer carries the warnings its reading found --
 * a value no other subflow takes, a subflow that neither acts nor hands
 * anything on -- each with what to do, and its next step says to amend the
 * plan if one applies.
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
  state.after = read.after;
  const reserveUsd = ports.purse?.keptBackUsd();
  emitAutomationStudioProjectPlanCard({ taskSpec: read.taskSpec, structurePlan: read.structure, purposes: read.purposes, ...(reserveUsd ? { reserveUsd } : {}) });
  return answer.answered({
    ok: true,
    written: mode === "write" ? "plan" : "plan_revision",
    parts: read.taskSpec.parts.map((part) => part.id),
    // The router runs the one subflow the plan's router falls back to; the reset brief names it.
    routerRuns: read.structure.plan.router.fallback.kind === "subflow" ? read.structure.plan.router.fallback.targetSubflowKey : null,
    subflows: read.structure.plan.subflows.map((subflow) => ({
      key: subflow.key,
      callable: subflow.interface !== undefined,
      ...(subflow.interface ? { inputs: subflow.interface.inputs.map((port) => port.id), outputs: subflow.interface.outputs.map((port) => port.id) } : {}),
      parts: [...(read.structure.partOf[subflow.key] ?? [])],
      ...(read.after[subflow.key]?.length ? { after: [...read.after[subflow.key]!] } : {})
    })),
    // What the plan was written with but may not mean (`./plan-input.ts`, bigbox debug fix 7): each by its path, with what to do.
    ...(read.warnings.length ? { warnings: read.warnings.map((warning) => ({ ...warning, instruction: warningText(warning.code) })) } : {}),
    next: read.warnings.length ? GUIDANCE.next.afterPlanWarned : GUIDANCE.next.afterPlan
  });
}

function warningText(code: string): string {
  return code === "project.plan_subflow_constraint" ? GUIDANCE.warnings.constraintSubflow : GUIDANCE.warnings.valueUnused;
}
