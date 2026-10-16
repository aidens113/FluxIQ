// A candidate build's judged-yes trial, remembered by the Flow it saved (t662),
// through the actual service: the build proposes on two yeses, the chat
// approves and applies, apply records the trial against the versions it saved,
// a playback of the saved Flow names exactly those versions, and the run's
// result check then holds that playback's double no on the trial's very rows
// unverified, while different rows are refuted as before. The rows are a
// seed nursery's, written into each run's own store: the Start-to-End Flow the
// build makes reads none.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import {
  automationStudioFlowGraphVersion,
  automationStudioFlowInstructionDigest,
  automationStudioFlowJudgedBuildTrialFromMetadata,
  automationStudioFlowVersionsFromMetadata
} from "../../../flow-version/index.ts";
import { AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES, automationStudioResultJudgedBuildTrialOfSavedFlow } from "../../../result-verification/build-yes-hold/index.ts";
import { verifyAutomationStudioRuntimeSessionResult } from "../../../result-verification/index.ts";
import { provider as judging } from "../../../result-verification/tests/run-outcome-harness.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "variety", label: "Variety", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] };
const PACKETS: JsonObject[] = [{ variety: "Brandywine Pink", price: "$3.25" }, { variety: "Cherokee Purple", price: "$3.50" }];

/** A candidate build that explores once, submits Start to End, tests it (two yeses) and completes; then the chat approves and applies it. */
async function appliedCandidate() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-applied-judged-trial-"));
  let judged = 0, decisions = 0;
  const provider = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    if (request.taskKind === "loop_verification") return judgeReply(++judged <= 2 ? "yes" : "unknown");
    decisions++;
    const latest = [...(request.context.evidenceLoop?.evidence ?? [])].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as { revision?: number; digest?: string } | undefined;
    const decision = decisions === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: {} }
      : decisions === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "Start to End", plan: plan() } }
      : decisions === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "complete", result: { revision: latest?.revision, digest: latest?.digest } };
    return { response: { kind: "evidence_tool_decision", summary: "Scripted", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { looked: true }, effectApplied: false, targetsUnchanged: true }) } });
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  const { project, flow } = await blankFixture(service);
  const projectId = project.id, flowId = flow.flowId;
  const result = await service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" });
  if (result.status !== "proposed") throw new Error(`expected a proposal, got ${result.status}`);
  await service.reviewFlowBootstrapAdaptation({ projectId, flowId, adaptationId: result.adaptationId, action: "approve", actorId: "user.test" });
  await service.reviewFlowBootstrapAdaptation({ projectId, flowId, adaptationId: result.adaptationId, action: "apply", actorId: "user.test" });
  return { service, projectId, flowId, adaptationId: result.adaptationId, trialRunId: result.candidate!.trial.runId };
}

/** Stores `rows` as one dataset of the run, processed as a run's datasets are when it ends. */
async function stored(service: AutomationStudioService, projectId: string, runId: string, rows: JsonObject[]): Promise<void> {
  await service.runDatasets.recordBatchHandler(projectId, runId)({ nodeId: "read", attemptId: `${runId}.read`, batchKey: `${runId}.read`, datasetId: "packets", label: "Packets", writeMode: "append", schema: SCHEMA, rows: rows.map((row) => ({ ...row })), invalidCount: 0, truncated: false });
  await service.runDatasets.processRunDatasets({ projectId, runId });
}

/** The run's result check over the service's own stores and saved Flow, with a judge that says no on every call. */
async function checkedAsTheServiceChecks(service: AutomationStudioService, projectId: string, session: AutomationStudioRuntimeSession) {
  const asked: AutomationStudioLlmTaskRequest[] = [];
  const written: AutomationStudioRuntimeSession[] = [];
  const next = await verifyAutomationStudioRuntimeSessionResult({ projectId, session, ports: {
    flowInstructionSet: (request) => service.getFlowInstructionSet(request),
    getFlowRunDetail: async () => null, saveFlowRunDetail: async (detail: AutomationStudioFlowRunDetail) => detail, writeRuntimeSession: async (_projectId, saved) => { written.push(saved); },
    listRunDatasets: (request) => service.runDatasets.listRunDatasets(request), getRunDatasetPage: (request) => service.runDatasets.getRunDatasetPage(request),
    resolveProvider: async () => ({ provider: judging("no", asked) }),
    // The port exactly as `service.ts` builds it for a run's result check.
    judgedBuildTrial: automationStudioResultJudgedBuildTrialOfSavedFlow({ flowMetadata: async (project, flow) => (await service.getFlow(project, flow)).metadata })
  } });
  return { next, asked };
}

describe("a candidate build's judged trial, remembered by the Flow it saved", () => {
  it("is recorded at apply, names the versions a playback runs, and holds that playback's double no on the trial's rows", async () => {
    const built = await appliedCandidate();
    const { service, projectId, flowId } = built;
    const parent = await service.getFlow(projectId, flowId);
    const record = automationStudioFlowJudgedBuildTrialFromMetadata(parent.metadata);
    const subflows = await service.listFlowSubflowSummaries({ projectId, flowId, limit: 10, offset: 0 });
    const primary = (await service.getFlowSubflow(projectId, flowId, subflows.subflows[0]!.subflowId))!;
    const graph = await service.getFlow(projectId, primary.graphFlowId!);
    expect(record).toEqual({
      trialRunId: built.trialRunId, verdict: "yes", calls: 2, adaptationId: built.adaptationId,
      instructionDigest: automationStudioFlowInstructionDigest(await service.getFlowInstructionSet({ projectId, flowId })),
      versions: [automationStudioFlowGraphVersion({ flow: parent }), automationStudioFlowGraphVersion({ flow: graph, subflowId: primary.subflowId })]
    });
    expect(record!.versions[1]!.revision).toBeGreaterThanOrEqual(1);

    // A playback of the saved Flow names exactly the versions apply recorded.
    const playback = await service.runRuntimeSession({ projectId, flowId, adaptiveMode: "no_llm_intervention" });
    expect(playback.status).toBe("succeeded");
    const ran = automationStudioFlowVersionsFromMetadata(playback.metadata);
    expect(ran.map((version) => [version.graphFlowId, version.revision])).toEqual(record!.versions.map((version) => [version.graphFlowId, version.revision]));

    // The trial's rows and the playback's are the same: the double no is held, never a yes.
    await stored(service, projectId, built.trialRunId, PACKETS);
    await stored(service, projectId, playback.runId, PACKETS);
    const same = await checkedAsTheServiceChecks(service, projectId, playback);
    expect(same.asked).toHaveLength(2);
    expect(same.next.status).toBe("succeeded");
    expect(same.next.metadata?.resultVerification).toMatchObject({ status: "unverified", verdict: "unsure", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_BUILD_YES_DISAGREES });
  });

  it("refutes a playback's double no as before where its rows are not the trial's", async () => {
    const built = await appliedCandidate();
    const { service, projectId, flowId } = built;
    const playback = await service.runRuntimeSession({ projectId, flowId, adaptiveMode: "no_llm_intervention" });
    await stored(service, projectId, built.trialRunId, PACKETS);
    await stored(service, projectId, playback.runId, [PACKETS[0]!, { variety: "Brandywine Pink", price: "$2.75" }]);
    const differs = await checkedAsTheServiceChecks(service, projectId, playback);
    expect(differs.next.status).toBe("failed");
    expect(differs.next.metadata?.resultVerification).toMatchObject({ status: "refuted", verdict: "does_not_answer", basis: "model" });
  });
});
