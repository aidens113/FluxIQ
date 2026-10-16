import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectAssembleLatest } from "../single-subflow/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/**
 * `project.assemble`: each subflow's latest done proposal under the plan in
 * force, or the one it kept from an earlier plan (`./state.ts`, t590, which
 * assembly is told, `kept`), assembled and submitted by the one assembly a
 * project build has (`../single-subflow/assemble-latest.ts`, t679): read whole
 * through the proposals port by the revision and digest its return named (a
 * proposal that is not the one named counts as none), composed into one plan
 * (`./assembly.ts`), its router-run subflows opening with the arrival at the
 * build's start location (t593), and submitted through the whole candidate's
 * controller as a composed submission. The answer carries the `complete`
 * object the model tests and completes with.
 *
 * **After a single-subflow brief's whole test, no new revision (t679).** On a
 * plan of one subflow the router runs, the builder's own test assembled its
 * proposal and was the judged whole run (`../single-subflow/single-subflow-trial.ts`).
 * Assembling the same done proposal again answers with that revision and its
 * `complete` object as they stand (`sameRevision`), and makes no new
 * revision, which would need a test of its own.
 */
export async function automationStudioProjectSupervisorAssembleTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state, controller, gate } = context;
  const structure = state.structure;
  if (!structure) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const from = [...state.latestDone()].map(([subflowKey, { brief, returned }]) => ({ subflowKey, briefId: brief.briefId, revision: returned.proposal!.revision, digest: returned.proposal!.digest, predecessors: brief.entry.predecessors }));
  const assembled = await automationStudioProjectAssembleLatest({
    structure, from, ports, kept: state.keptFromEarlierPlans(), controller, gate,
    summary: typeof value.summary === "string" ? value.summary : undefined
  });
  if (!assembled.ok && assembled.kind === "assembly") return answer.refused("project.assemble_refused", GUIDANCE.refusals.assembleRefused, { issues: assembled.issues });
  if (!assembled.ok) return answer.refused(assembled.code, GUIDANCE.refusals.composedRefused, { refusal: assembled.feedback, issueCodes: assembled.issueCodes });
  const { candidate } = assembled;
  const made = assembled.assembled;
  const tested = assembled.again ? gate.standing(candidate) : undefined;
  return answer.answered({
    ok: true,
    status: "draft",
    revision: candidate.revision,
    digest: candidate.digest,
    complete: { revision: candidate.revision, digest: candidate.digest },
    changedPaths: [...candidate.changedPaths],
    assembledFrom: assembled.from.map((entry) => ({ subflowKey: entry.subflowKey, briefId: entry.briefId, revision: entry.revision })),
    ...(made?.composed ? { calls: { subflowKey: made.composed.subflowKey, inOrder: made.composed.calls } } : {}),
    ...(made?.flowInputs.length ? { flowInputs: made.flowInputs.map((entry) => ({ subflowKey: entry.subflowKey, input: entry.input })) } : {}),
    // The revision these proposals already made, and its test, as they stand (header, t679).
    ...(assembled.again ? { sameRevision: true, ...(tested ? { latestTest: { verdict: tested.verdict } } : {}) } : {}),
    verification: "not_performed",
    promotionAllowed: false,
    next: assembled.again && tested?.verdict === "yes" ? GUIDANCE.next.afterAssembleTested : GUIDANCE.next.afterAssemble
  });
}
