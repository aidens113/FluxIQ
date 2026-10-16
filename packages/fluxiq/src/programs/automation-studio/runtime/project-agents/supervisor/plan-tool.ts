import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectPlanCard } from "../../activity/project/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../llm/repeat-guard/index.ts";
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
 *
 * **A subflow that only reshapes is refused once (A8 towels `run-mvac0nmw`,
 * t658).** t630 warned on a subflow that takes rows another reads, makes no
 * lasting act and hands on nothing another takes; the towels run was told so
 * at its first plan, dispatched it anyway, and lost most of its money to the
 * split, the second build to do so. A warning the model can pass over does not
 * hold, so a written or amended plan holding such a subflow is now refused,
 * with the warning's words and `resend: "accepted_once"` (t650), once for each
 * such subflow by its key and parts (`reshapeRefused`, `./state.ts`): the same
 * subflow sent again is taken, with the warning beside it, since only the
 * model can tell that its builder must open or read something for each row.
 * A refusal is a hint the model may override once, never a block.
 *
 * **A carried proposal is listed (t658).** An amendment that only added parts
 * to a subflow, or added or renamed its outputs, carries its done proposal
 * (`./state.ts`): the answer lists it under `proposalsCarried`, with the parts
 * and renames it was not built for, and says its next build brief starts from
 * it and is tested on every part.
 *
 * **A narrowing and a merge are listed with why (Lab `run-mvan7giv`, t671).**
 * A proposal carried because the amendment only removed outputs lists them
 * (`removedOutputs`); one carried onto the subflow it was merged into names the
 * subflow it was built for and those whose parts joined it (`absorbed`); each
 * carried one says in one sentence why (`because`). A proposal, carried or
 * dropped, whose own parts changed names each and what changed in it
 * (`changedParts`): on that run "its parts changed" was a part's lasting act
 * rewritten, which the reason alone did not say; such a proposal is now
 * carried, and its next trial judges the part as it now is.
 */
export async function automationStudioProjectSupervisorPlanTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject, mode: "write" | "amend"): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state } = context;
  if (mode === "write" && state.structure) return answer.refused("project.plan_exists", GUIDANCE.refusals.planExists);
  if (mode === "amend" && !state.structure) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (mode === "amend" && !reason) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: worded([{ code: "project.amend_reason_missing", path: "reason" }]) });
  // An amendment is read against the plan in force, whose words it may not drop (`./plan-input.ts`, t645).
  const read = automationStudioProjectSupervisorPlanInput(value, ports.sources, mode === "amend" ? state.taskSpec : undefined);
  if (!read.ok) return answer.refused("project.plan_refused", GUIDANCE.refusals.planRefused, { issues: worded(read.issues) });
  // A subflow that only reshapes what another reads is refused once; the same subflow sent again is taken, as a hint (header, t658).
  const reshaped = reshapeOnly(read, value).filter((found) => !state.reshapeRefused.has(found.key));
  if (reshaped.length) {
    for (const found of reshaped) state.reshapeRefused.add(found.key);
    return answer.refused("project.plan_refused", GUIDANCE.refusals.reshapeOnlyOnce, { issues: worded(reshaped.map((found) => found.issue)), diagnostics: { resend: RESEND_ACCEPTED_ONCE } });
  }
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
      // A dropped subflow whose own parts changed says which and how (header, t671).
      proposalsDropped: [...carried.dropped].map(([subflowKey, why]) => ({ subflowKey, why: [...why], ...(carried.changedParts.has(subflowKey) ? { changedParts: carried.changedParts.get(subflowKey)!.map((entry) => ({ ...entry })) } : {}) })),
      // Each proposal carried to its subflow's next build brief, which starts from it and is judged on every part (`./state.ts`, t658, t671).
      ...(carried.forward.size ? {
        proposalsCarried: [...carried.forward].map(([subflowKey, found]) => ({
          subflowKey, briefId: found.answered.brief.briefId, revision: found.answered.returned.proposal!.revision, why: [...found.why],
          ...(found.addedParts.length ? { addedParts: [...found.addedParts] } : {}),
          ...(found.renamedOutputs.length ? { renamedOutputs: found.renamedOutputs.map((pair) => ({ ...pair })) } : {}),
          ...(found.removedOutputs.length ? { removedOutputs: [...found.removedOutputs] } : {}),
          ...(found.changedParts.length ? { changedParts: found.changedParts.map((entry) => ({ ...entry })) } : {}),
          ...(found.absorbed ? { absorbed: { builtFor: found.absorbed.builtFor, partsFrom: [...found.absorbed.partsFrom], routerRun: found.absorbed.routerRun } } : {}),
          because: found.because,
          instruction: GUIDANCE.next.carried
        }))
      } : {})
    } : {}),
    ...(read.warnings.length ? { warnings: read.warnings.map(warned) } : {}),
    next: mode === "amend" ? (read.warnings.length ? GUIDANCE.next.afterAmendWarned : GUIDANCE.next.afterAmend) : read.warnings.length ? GUIDANCE.next.afterPlanWarned : GUIDANCE.next.afterPlan
  });
}

/** The mark that lets the identical call sent again run once (`../../llm/repeat-guard/resend-admission.ts`, t650). */
const RESEND_ACCEPTED_ONCE: AutomationStudioLlmEvidenceResendInvitation = "accepted_once";

/**
 * Each subflow the plan's reading warned only reshapes what another reads
 * (`./plan-input.ts`, t630), with its warning as an issue and a key -- its own
 * key and parts -- by which a refusal of it is remembered (header, t658).
 */
function reshapeOnly(read: { warnings: ReadonlyArray<{ code: string; path: string }>; structure: { partOf: Record<string, string[]> } }, value: JsonObject): Array<{ key: string; issue: { code: string; path: string } }> {
  const sent = Array.isArray(value.subflows) ? value.subflows : [];
  return read.warnings.flatMap((warning) => {
    const at = warning.code === RESHAPE_ONLY ? /^subflows\.(\d+)$/u.exec(warning.path) : null;
    const subflow = at ? sent[Number(at[1])] : undefined;
    const key = subflow && typeof subflow === "object" && !Array.isArray(subflow) && typeof subflow.key === "string" ? subflow.key : undefined;
    if (key === undefined) return [];
    return [{ key: JSON.stringify([key, [...(read.structure.partOf[key] ?? [])].sort()]), issue: { code: warning.code, path: warning.path } }];
  });
}

/** The warning on a subflow that only reshapes what another reads (`./plan-input.ts`, t630). */
const RESHAPE_ONLY = "project.plan_subflow_reshape_only";

/** Each issue with what it means in words where Core has words for its code (header), and a dropped part's id and words (t645). */
function worded(issues: ReadonlyArray<{ code: string; path: string; part?: string; dropped?: string }>): JsonObject[] {
  const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
  return issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    ...(issue.part !== undefined ? { part: issue.part } : {}),
    ...(issue.dropped !== undefined ? { dropped: issue.dropped } : {}),
    ...(Object.hasOwn(words, issue.code) ? { why: words[issue.code]! } : {})
  }));
}

/**
 * A written plan's warning with what to do, in its own code's words (`GUIDANCE.planIssues`, t630): every warning code
 * once fell back to the unused value's words, so a new one told the model to remove the Flow's answer.
 */
function warned(warning: { code: string; path: string }): JsonObject {
  const words: Readonly<Record<string, string>> = GUIDANCE.planIssues;
  return Object.hasOwn(words, warning.code) ? { code: warning.code, path: warning.path, instruction: words[warning.code]! } : { code: warning.code, path: warning.path };
}
