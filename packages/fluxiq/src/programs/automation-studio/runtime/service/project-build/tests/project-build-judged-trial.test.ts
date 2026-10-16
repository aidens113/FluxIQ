// A project build's whole-Flow trial, remembered by the Flow it saved (t662),
// through the actual service: the supervisor plans one part, its builder
// builds and tries the subflow, the assembled Flow's whole trial is judged yes
// twice, the chat approves and applies the proposal, and apply records that
// whole trial -- never a subflow trial -- against the versions it saved, which
// are the versions a playback of the saved Flow then names. The scripted
// supervisor and builder are the facade's one-part script
// (`./project-build-facade.test.ts`), cut to what this needs.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import {
  automationStudioFlowInstructionDigest,
  automationStudioFlowJudgedBuildTrialFromMetadata,
  automationStudioFlowVersionsFromMetadata
} from "../../../flow-version/index.ts";
import { automationStudioResultJudgedBuildTrialOfSavedFlow } from "../../../result-verification/build-yes-hold/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds.ts";

// A hang guard only, as the facade's.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The fixture instruction's words (`blankFixture`). */
const TASK = "Create a deterministic Start to End Flow.";
type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });
const SUBMISSION = {
  summary: "Build the main subflow",
  plan: { schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary",
    nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
    edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }] }] }
};

async function appliedProjectBuild() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-judged-trial-"));
  const trialRuns = { whole: [] as string[] };
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request: AutomationStudioLlmTaskRequest) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
      supervisorDecisions += 1;
      const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
      switch (supervisorDecisions) {
        case 1: return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: { taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] }, subflows: [{ key: "main", name: "Main", parts: ["p1"] }] } });
        case 2: return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [{ kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 }] } });
        case 3: return decision({ kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} });
        case 4: return decision({ kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: assembled ?? {} });
        default: {
          const tested = lastOf(evidence, "core.test_candidate");
          if (typeof tested?.trialRunId === "string") trialRuns.whole.push(tested.trialRunId);
          return decision({ kind: "complete", result: assembled ?? {} });
        }
      }
    }
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit-main", toolId: "core.submit_subflow", input: SUBMISSION });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test-main", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    return decision({ kind: "complete", result: { subflowKey: "main", revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) } });
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service);
  const projectId = project.id, flowId = flow.flowId;
  const result = await builds.track(projectId, flowId, service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }));
  if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
  await service.reviewFlowBootstrapAdaptation({ projectId, flowId, adaptationId: result.adaptationId, action: "approve", actorId: "user.test" });
  await service.reviewFlowBootstrapAdaptation({ projectId, flowId, adaptationId: result.adaptationId, action: "apply", actorId: "user.test" });
  return { service, projectId, flowId, adaptationId: result.adaptationId, trialRunId: result.candidate!.trial.runId, trialRuns };
}

describe("a project build's whole-Flow trial, remembered by the Flow it saved", () => {
  it("is recorded at apply against the versions a playback of the saved Flow then names", async () => {
    const built = await appliedProjectBuild();
    const { service, projectId, flowId } = built;
    const record = automationStudioFlowJudgedBuildTrialFromMetadata((await service.getFlow(projectId, flowId)).metadata);
    expect(record).toMatchObject({ trialRunId: built.trialRunId, verdict: "yes", calls: 2, adaptationId: built.adaptationId,
      instructionDigest: automationStudioFlowInstructionDigest(await service.getFlowInstructionSet({ projectId, flowId })) });
    // The whole trial the supervisor was told of, not a subflow's.
    expect(built.trialRuns.whole).toContain(built.trialRunId);
    expect(record!.versions.some((version) => version.subflowId !== undefined && version.revision !== null)).toBe(true);

    const playback = await service.runRuntimeSession({ projectId, flowId, adaptiveMode: "no_llm_intervention" });
    const ran = automationStudioFlowVersionsFromMetadata(playback.metadata);
    expect(ran.length).toBeGreaterThan(0);
    for (const version of ran) expect(record!.versions).toContainEqual(expect.objectContaining({ graphFlowId: version.graphFlowId, revision: version.revision }));
    // The port a run's result check is given names this trial for that playback.
    const port = automationStudioResultJudgedBuildTrialOfSavedFlow({ flowMetadata: async (project, flow) => (await service.getFlow(project, flow)).metadata });
    await expect(port({ projectId, flowId, runId: playback.runId, flowVersions: ran })).resolves.toEqual({ trialRunId: built.trialRunId, verdict: "yes", calls: 2, instructionDigest: record!.instructionDigest });
  });
});
