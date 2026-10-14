import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioSubflowScope, AutomationStudioSubflowTrialPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { AutomationStudioHostLeaseScope, type AutomationStudioHostResourceScheduler, type AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectBuildRef } from "../../project-agents/index.ts";
import { automationStudioBuildTestJudge } from "../../result-verification/index.ts";
import { admitAutomationStudioBuildTrialSession } from "../runtime-session/index.ts";
import { automationStudioSubflowTrialPort } from "../subflow-trial/index.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { automationStudioProjectBuildTrialReads } from "./trial-reads.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "./whole-trials.ts";

// A project build's partial trials (unit A5c over A4b's runner): one port for
// the build, shared by every brief, made from the same trial environment the
// whole candidate's trials are run with, and three things of the project's:
//
// - **Admission.** Each trial's session opens through
//   `admitAutomationStudioBuildTrialSession`: only while this build runs and
//   only under the host-resource lease of the brief that asked, read from the
//   lease scope the dispatcher runs each brief in. A stale builder's late trial
//   never opens a session.
// - **The scoped judge.** The build-test judge, asked about the brief's parts
//   alone: its instructions are one instruction holding the parts' own words
//   and the subflow's success check, never the whole task.
// - **Proposals.** Every proposal tried is kept by brief, revision and digest
//   (`./proposals.ts`), so the supervisor can assemble a done return's
//   proposal and a later subflow's trial can run its predecessors' latest
//   passing proposals to reach its entry.

export function automationStudioProjectBuildSubflowTrials(input: {
  ref: AutomationStudioProjectBuildRef;
  environment: AutomationStudioProjectBuildTrialEnvironment;
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  judge: { provider: AutomationStudioLlmProvider; timeoutMs?: number | undefined; signal?: AbortSignal | undefined };
  records: Pick<AutomationStudioProjectBuildRecordStore, "read">;
  proposals: AutomationStudioProjectBuildProposals;
  leases: Pick<AutomationStudioHostResourceScheduler, "assertCurrent">;
  /** Whether the build is still running: a trial asked after it ended is refused. */
  running(): boolean;
}): ReturnType<typeof automationStudioSubflowTrialPort> {
  const { ref, environment, binding } = input;
  const { projectId, flowId } = environment;
  const trials = automationStudioSubflowTrialPort(ref.buildId, {
    ...environment,
    ...automationStudioProjectBuildTrialReads(binding, projectId, flowId),
    openSession: async ({ runId, metadata }) => await admitAutomationStudioBuildTrialSession({
      knownBuild: (buildId) => buildId === ref.buildId && input.running(),
      leases: input.leases,
      startRuntimeSession: () => environment.openSession({ runId, metadata })
    }, { buildId: ref.buildId, briefId: briefOf(metadata), lease: AutomationStudioHostLeaseScope.current() }),
    predecessorProposals: async (scope) => input.proposals.predecessors(scope),
    currentPlanDigest: async (buildId) => buildId === ref.buildId ? (await input.records.read(ref))?.record.plans.at(-1)?.plan.digest ?? null : null,
    judge: async ({ summary, scope }) => await automationStudioBuildTestJudge({
      provider: input.judge.provider, timeoutMs: input.judge.timeoutMs, instructions: [scopeInstruction(scope, projectId, flowId)],
      deniedEvidenceKeys: binding.deniedEvidenceKeys, projectId, flowId, signal: input.judge.signal
    })({ summary })
  });
  const port: AutomationStudioSubflowTrialPort = async (request) => {
    const result = await trials.port(request);
    input.proposals.trialled(request.scope, request.proposal, result.verdict);
    return result;
  };
  return { ...trials, port };
}

/** The brief a partial trial's session is marked with (`../subflow-trial/run.ts`, `metadata.subflowTrial`). */
function briefOf(metadata: Record<string, unknown>): string {
  const marker = metadata.subflowTrial;
  const briefId = marker && typeof marker === "object" && !Array.isArray(marker) ? (marker as Record<string, unknown>).briefId : undefined;
  return typeof briefId === "string" ? briefId : "";
}

/** The one instruction the scoped judge reads: the brief's parts in the person's own words, and the subflow's success check. */
function scopeInstruction(scope: AutomationStudioSubflowScope, projectId: string, flowId: string): AutomationStudioFlowInstruction {
  const parts = scope.parts.map((part) => `- ${part.text}`).join("\n");
  const check = scope.successCheck ? `\nIts success check: ${JSON.stringify(scope.successCheck)}` : "";
  return {
    schemaVersion: "0.1", instructionId: `project-scope.${scope.briefId}`, title: `Subflow ${scope.subflowKey}`,
    body: `This trial ran only the subflow "${scope.subflowKey}" of a larger Flow. Judge only whether it did these parts of the task:\n${parts}${check}`,
    scope: { kind: "flow", projectId, flowId }, priority: 100, status: "active", requirement: "required", createdAt: 0, updatedAt: 0
  };
}
