// The Flow the attempt leaves behind (plan, D3, D11): the steps the model authored, assembled by
// the same check a legacy completion goes through and saved as an unverified candidate, which
// nothing runs or applies. Best effort, always: a draft that cannot be assembled or saved costs
// the draft and never the result, and the steps stay on the attempt's row, so nothing is lost.
//
// **Nobody is asked here.** The permission check handed to the assembly grants every step, because
// a step that did not run has done nothing, and a draft runs nothing. Asking would put a question
// to a person at the end of a task (plan, D13: never in the middle of a Flow), and it is the
// later attempt that runs this draft which goes through the gates.

import { randomUUID } from "node:crypto";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioFlowCandidate } from "../../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import { automationStudioLlmStepLogNote, checkAutomationStudioFlowBootstrapCompletion } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { automationStudioAnswerFirstAccounting } from "./accounting.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export type AutomationStudioAnswerFirstDraftOutcome =
  | { kind: "saved"; record: AutomationStudioFlowCandidateDraftRecord }
  | { kind: "kept"; why: "not_assembled" | "not_saved"; codes: readonly string[] };

export async function automationStudioAnswerFirstSaveDraft(run: AutomationStudioAnswerFirstAttemptRun, summary: string): Promise<AutomationStudioAnswerFirstDraftOutcome> {
  const { input } = run;
  try {
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary }, projectId: input.projectId, flowId: input.flowId, registry: input.registry, resolution: input.resolution, size: input.size, binding: input.binding,
      permissionFor: () => async () => ({ permitted: true, missing: [], requestId: null }),
      draftSteps: run.steps, routeSignaturesOf: input.routing.signaturesOf, instructionText: input.instructionText,
      ...(input.startLocation === undefined ? {} : { startLocation: input.startLocation })
    });
    if (!verdict.ok) {
      // Codes belong in a step log, which a person does not read: without them nobody can say why a draft saved nothing.
      automationStudioLlmStepLogNote(`The draft was refused and kept as steps only: ${verdict.codes.join(", ") || "no code given"}`);
      return { kind: "kept", why: "not_assembled", codes: verdict.codes };
    }
    const record = await input.stores.drafts.save(draftRecord(run, verdict.summary, verdict.buildPlan));
    // Its parts go to the library; a failure there is reported by name on the trace and changes nothing here (`../../project-parts/draft-parts.ts`).
    await input.parts?.saveDraft({ projectId: input.projectId, flowId: input.flowId, candidateId: record.candidateId, buildPlan: verdict.buildPlan, instructionIds: input.instructionIds, instructionText: input.instructionText, startLocation: input.startLocation });
    return { kind: "saved", record };
  } catch (error) {
    const code = error instanceof Error ? error.name : "unknown";
    automationStudioLlmStepLogNote(`The draft could not be saved and was kept as steps only: ${code}`);
    return { kind: "kept", why: "not_saved", codes: [code] };
  }
}

function draftRecord(run: AutomationStudioAnswerFirstAttemptRun, summary: string, buildPlan: AutomationStudioFlowCandidate["buildPlan"]): AutomationStudioFlowCandidateDraftRecord {
  const { input } = run;
  const base = { baseDependencyDigest: input.baseDependencyDigest, instructionText: input.instructionText, projectId: input.projectId, flowId: input.flowId };
  const common = {
    kind: "flow_candidate_draft" as const, status: "draft" as const, verification: "not_performed" as const,
    candidateId: `candidate.${randomUUID()}`, projectId: input.projectId, flowId: input.flowId, sourceInstructionIds: [...input.instructionIds], instructionText: input.instructionText,
    baseSettingsRevision: input.baseSettingsRevision, accounting: automationStudioAnswerFirstAccounting(run), createdAt: Date.now()
  };
  const candidate = { revision: 1, baseDependencyDigest: input.baseDependencyDigest, status: "draft" as const, summary, buildPlan, changedPaths: [] };
  if (!input.source) return { ...common, schemaVersion: 1, candidate: { ...candidate, digest: fingerprint.candidate({ ...base, buildPlan }) } };
  const { originalSources, originalInstructionsDigest } = input.source;
  return {
    ...common, schemaVersion: 2, originalSources, originalInstructionsDigest, sourceInstructionIds: [...originalSources.effectiveInstructionIds],
    candidate: { ...candidate, digest: fingerprint.candidate({ ...base, buildPlan, originalInstructionsDigest }), fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest }
  };
}
