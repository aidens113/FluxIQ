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
 * logged as a re-plan. Briefs made under an earlier plan stop counting by
 * their plan digest; a done proposal made under one counts on only where the
 * new plan leaves its subflow as it was (`./state.ts`, t590). An amendment's
 * answer lists the proposals it kept and those it dropped, each dropped one
 * with what changed, and the dispatcher's port is told which it kept, so a
 * dependent builder's entry runs them (`ports.kept`). The plan goes to the
 * chat as its card. A written plan's answer carries the warnings its reading
 * found -- a value no other subflow takes, a subflow that neither acts nor
 * hands anything on, one that only reshapes what another reads -- each with
 * what to do in its own code's words, and its next step says to amend the
 * plan if one applies.
 *
 * **What the answer invites (bigbox debug, t595).** Bigbox
 * `run-mv8c7unr-42a8456d` copied Core's own router-run subflow, listed in
 * the written plan's answer with `parts: []`, into its `project.amend_plan`,
 * and was refused `project.plan_subflow_no_parts` with a code and a path and
 * nothing to say why. So the answer lists only the subflows the model wrote,
 * says under `routerAddedByCore` that the one under `routerRuns` is Core's,
 * and each refusal's issue carries what it means in words (`why`, from
 * `GUIDANCE.planIssues`) where Core has words for its code. A kept proposal
 * whose parts the amendment only reworded is listed with them (`reworded`).
 */
export async function automationStudioProjectSupervisorPlanTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject, mode: "write" | "amend"): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state } = context;
  if (mode === "write" && state.structure) return answer.refused("project.plan_exists", GUIDANCE.refusals.planExists);
  if (mode === "amend" && !state.structure) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (mode === "amend" && !reason) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: worded([{ code: "project.amend_reason_missing", path: "reason" }]) });
  const read = automationStudioProjectSupervisorPlanInput(value, ports.sources);
  if (!read.ok) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: worded(read.issues) });
  try {
    if (state.taskSpec?.digest !== read.taskSpec.digest) await ports.record.recordTaskSpec(ports.build, read.taskSpec, ports.sources);
    await ports.record.recordPlan(ports.build, read.structure);
    if (mode === "amend") await ports.record.recordDecision(ports.build, { kind: "re_plan", reason: reason.slice(0, 2000), briefIds: [], planDigest: read.structure.digest });
  } catch (error) {
    if (!(error instanceof AutomationStudioProjectRecordRefusal)) throw error;
    return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: worded([{ code: error.code, path: error.path }]) });
  }
  const carried = state.adopt({ taskSpec: read.taskSpec, structure: read.structure, purposes: read.purposes, after: read.after });
  ports.kept?.({ planDigest: read.structure.digest, madeUnder: state.keptFromEarlierPlans() });
  const reserveUsd = ports.purse?.keptBackUsd();
  emitAutomationStudioProjectPlanCard({ taskSpec: read.taskSpec, structurePlan: read.structure, purposes: read.purposes, ...(reserveUsd ? { reserveUsd } : {}) });
  const routerRuns = read.structure.plan.router.fallback.kind === "subflow" ? read.structure.plan.router.fallback.targetSubflowKey : null;
  // Core's own router-run subflow carries no part; one the model wrote always does (header).
  const added = routerRuns !== null && !(read.structure.partOf[routerRuns] ?? []).length ? routerRuns : undefined;
  return answer.answered({
    ok: true,
    written: mode === "write" ? "plan" : "plan_revision",
    parts: read.taskSpec.parts.map((part) => part.id),
    // The router runs the one subflow the plan's router falls back to; the reset brief names it.
    routerRuns,
    ...(added ? { routerAddedByCore: GUIDANCE.router.addedByCore } : {}),
    subflows: read.structure.plan.subflows.filter((subflow) => subflow.key !== added).map((subflow) => ({
      key: subflow.key,
      callable: subflow.interface !== undefined,
      ...(subflow.interface ? { inputs: subflow.interface.inputs.map((port) => port.id), outputs: subflow.interface.outputs.map((port) => port.id) } : {}),
      parts: [...(read.structure.partOf[subflow.key] ?? [])],
      ...(read.after[subflow.key]?.length ? { after: [...read.after[subflow.key]!] } : {})
    })),
    // What the plan was written with but may not mean (`./plan-input.ts`, bigbox debug fix 7): each by its path, with what to do.
    // What the amendment did with the done proposals made under earlier plans (`./state.ts`, t590).
    ...(mode === "amend" ? {
      proposalsKept: [...carried.kept].map(([subflowKey, { brief }]) => ({ subflowKey, briefId: brief.briefId, ...(carried.reworded.has(subflowKey) ? { reworded: [...carried.reworded.get(subflowKey)!] } : {}) })),
      proposalsDropped: [...carried.dropped].map(([subflowKey, why]) => ({ subflowKey, why: [...why] }))
    } : {}),
    ...(read.warnings.length ? { warnings: read.warnings.map(warned) } : {}),
    next: mode === "amend" ? (read.warnings.length ? GUIDANCE.next.afterAmendWarned : GUIDANCE.next.afterAmend) : read.warnings.length ? GUIDANCE.next.afterPlanWarned : GUIDANCE.next.afterPlan
  });
}

/** Each issue with what it means in words where Core has words for its code (header). */
function worded(issues: ReadonlyArray<{ code: string; path: string }>): JsonObject[] {
  const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
  return issues.map((issue) => (Object.hasOwn(words, issue.code) ? { code: issue.code, path: issue.path, why: words[issue.code]! } : { code: issue.code, path: issue.path }));
}

/**
 * A written plan's warning with what to do, in its own code's words (`GUIDANCE.planIssues`, t630): every warning code
 * once fell back to the unused value's words, so a new one told the model to remove the Flow's answer.
 */
function warned(warning: { code: string; path: string }): JsonObject {
  const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
  return Object.hasOwn(words, warning.code) ? { code: warning.code, path: warning.path, instruction: words[warning.code]! } : { code: warning.code, path: warning.path };
}
