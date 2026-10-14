import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectAssembly } from "./assembly.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/**
 * `project.assemble`: each subflow's latest done proposal under the plan in
 * force, read whole through the proposals port by the revision and digest
 * its return named (a proposal that is not the one named counts as none),
 * composed into one plan (`./assembly.ts`), and submitted through the whole
 * candidate's controller as a composed submission
 * (`AutomationStudioFlowCandidateSubmissionController.submitComposed`). The
 * answer carries the `complete` object the model tests and completes with.
 */
export async function automationStudioProjectSupervisorAssembleTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state, controller, gate } = context;
  const structure = state.structure;
  if (!structure) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const proposals = new Map<string, AutomationStudioSubflowProposal>();
  const predecessors = new Map<string, readonly string[]>();
  const from: JsonObject[] = [];
  for (const [subflowKey, { brief, returned }] of state.latestDone()) {
    const named = returned.proposal!;
    const proposal = await ports.proposals({ briefId: brief.briefId, subflowKey, revision: named.revision, digest: named.digest });
    if (!proposal || proposal.revision !== named.revision || proposal.digest !== named.digest || proposal.scope.briefId !== brief.briefId) continue;
    proposals.set(subflowKey, proposal);
    predecessors.set(subflowKey, brief.entry.predecessors);
    from.push({ subflowKey, briefId: brief.briefId, revision: named.revision });
  }
  const assembled = automationStudioProjectAssembly({ structure, proposals, predecessors });
  if (!assembled.ok) return answer.refused("project.assemble_refused", GUIDANCE.refusals.assembleRefused, { issues: assembled.issues });
  const summary = typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : `A Flow of ${structure.plan.subflows.length} subflows, assembled from their builders' proposals.`;
  const submitted = await controller.submitComposed({ plan: assembled.assembled.plan, summary }, { trialOf: (candidate) => gate.standing(candidate), refuted: (digest) => gate.refuted(digest) });
  if (!submitted.ok) {
    const code = typeof submitted.check.feedback.code === "string" ? submitted.check.feedback.code : (submitted.check.issueCodes[0] ?? "candidate.submission_refused");
    return answer.refused(code, GUIDANCE.refusals.composedRefused, { refusal: submitted.check.feedback, issueCodes: [...submitted.check.issueCodes] });
  }
  const { candidate } = submitted;
  return answer.answered({
    ok: true,
    status: "draft",
    revision: candidate.revision,
    digest: candidate.digest,
    complete: { revision: candidate.revision, digest: candidate.digest },
    changedPaths: [...candidate.changedPaths],
    assembledFrom: from,
    ...(assembled.assembled.composed ? { calls: { subflowKey: assembled.assembled.composed.subflowKey, inOrder: assembled.assembled.composed.calls } } : {}),
    ...(assembled.assembled.flowInputs.length ? { flowInputs: assembled.assembled.flowInputs.map((entry) => ({ subflowKey: entry.subflowKey, input: entry.input })) } : {}),
    verification: "not_performed",
    promotionAllowed: false,
    next: GUIDANCE.next.afterAssemble
  });
}
