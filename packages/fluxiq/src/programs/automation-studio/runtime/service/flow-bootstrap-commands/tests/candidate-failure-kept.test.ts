// A candidate build that fails after the model wrote its Flow (t362, lane A
// round 4, `run-muyrpbnk-fef374e7`, C6): four revisions were accepted and two
// were test-run, then twelve refused submissions stopped the build, which told
// the person "the model's answer could not be used" and that the Flow "has no
// steps yet", and the Lab recorded `candidate: null`. These drive the actual
// service.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioConversationCallCause } from "../../../conversations/commands/index.ts";
import { parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../../../flow-bootstrap/index.ts";
import { automationStudioCandidateStallCode } from "../../candidate-failure/index.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

type Reply = (call: number, latest: { revision?: number; digest?: string } | undefined) => Record<string, unknown>;

/** A submission the completion check refuses, the same way each time. */
const refusedSubmission = { kind: "tool_call", callId: "submit-bad", toolId: "core.submit_candidate", input: { summary: "popups first", plan: { schemaVersion: "0.1" } } };

async function candidateBuild(reply: Reply, verdict: "yes" | "no" = "no") {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-kept-"));
  let calls = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply(verdict);
    calls++;
    const evidence = request.context.evidenceLoop?.evidence ?? [];
    const latest = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate" && (entry.value as { ok?: unknown } | undefined)?.ok === true)?.value as { revision?: number; digest?: string } | undefined;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted candidate authoring", decision: reply(calls, latest) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 20, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { area: "item" }, effectApplied: false, targetsUnchanged: true }) } });
  const { project, flow } = await blankFixture(service);
  const settled = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" })
    .then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  const drafts = (service as unknown as { candidateDrafts: { get(projectId: string, flowId: string): Promise<{ candidateId: string; candidate: { revision: number; digest: string } } | undefined> } }).candidateDrafts;
  return { settled, draft: () => drafts.get(project.id, flow.flowId), close: async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

describe("a candidate build that fails after writing its Flow says what it kept", () => {
  it("refused submissions in a row end as no progress, keep the latest accepted revision as a draft, and name the candidate and its trial", async () => {
    const build = await candidateBuild((call, latest) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } }
      : call === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "whole flow", plan: plan() } }
      : call === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { ...refusedSubmission, callId: `submit-bad-${call}` });
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic((build.settled.error as { diagnostic?: unknown }).diagnostic);
      if (!diagnostic) throw new Error("the failure carried no diagnostic Core reads back");
      // No progress, not an unusable answer: each refused submission was a readable Flow.
      expect(diagnostic.code).toBe("flow_bootstrap.evidence_repeat_without_progress");
      const draft = await build.draft();
      expect(draft).toBeDefined();
      expect(diagnostic.candidate).toEqual({ candidateId: draft!.candidateId, draft: "saved", revision: draft!.candidate.revision, digest: draft!.candidate.digest, trialCount: 1,
        trials: [{ revision: draft!.candidate.revision, verdict: "no", trialRunId: expect.any(String), code: expect.any(String) }] });
      // What the chat says: the real cause, never the stage's words.
      const said = automationStudioConversationCallCause("the build", { ok: false, payload: { diagnostic } } as Parameters<typeof automationStudioConversationCallCause>[1]);
      // The refused submission behind the stall, said in the refusal's words (t378: lanes C and D ended "it kept trying without getting any further").
      expect(said).toBe("the build failed: the Flow it wrote was refused 3 times in a row, the last time because some steps weren't written in a way the Flow can run");
      expect(said).not.toContain("could not be used");
    } finally { await build.close(); }
  }, 60_000);

  it("a build that never had a submission accepted names its candidate and keeps no draft", async () => {
    const build = await candidateBuild((call) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } } : { ...refusedSubmission, callId: `submit-bad-${call}` });
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic((build.settled.error as { diagnostic?: unknown }).diagnostic);
      expect(diagnostic?.candidate).toEqual({ candidateId: expect.stringMatching(/^candidate\./u), draft: "none", trialCount: 0, trials: [] });
      await expect(build.draft()).resolves.toBeUndefined();
    } finally { await build.close(); }
  }, 60_000);
});

/** Lane D's refused step (t378): a step that keeps only some rows, given a setting its node does not take. */
function laneDPlan() {
  const written = plan();
  const primary = written.subflows[0]!;
  return { ...written, subflows: [{ ...primary,
    nodes: [primary.nodes[0]!, { key: "keep", name: "keep requests with 5 or more mutual friends", definitionId: "builtin.data.filter-rows", definitionVersion: "1.0.0", parameters: { minimumMutualFriends: 5 } }, primary.nodes[1]!],
    edges: [{ key: "start_keep", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "keep", portId: "in" } }, { key: "keep_end", source: { nodeKey: "keep", portId: "next" }, target: { nodeKey: "end", portId: "in" } }] }] };
}

describe("a candidate build that stops on a refused step names the step", () => {
  it("lane D: the ending says which step was refused, in the model's words, and the diagnostic reads back with them", async () => {
    const build = await candidateBuild((call) => ({ kind: "tool_call", callId: `submit-${call}`, toolId: "core.submit_candidate", input: { summary: "keep the close ones", plan: laneDPlan() } }));
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic((build.settled.error as { diagnostic?: unknown }).diagnostic);
      if (!diagnostic) throw new Error("the failure carried no diagnostic Core reads back");
      expect(diagnostic.code).toBe("flow_bootstrap.evidence_repeat_without_progress");
      // The step's own words, with where its issue is and that issue's code; never the node's key or definition.
      expect(diagnostic.refusedSteps).toEqual([{ step: "keep requests with 5 or more mutual friends", path: "plan.subflows.0.nodes.1.parameters.minimumMutualFriends", code: "bootstrap.unknown_parameter" }]);
      const said = automationStudioConversationCallCause("the build", { ok: false, payload: { diagnostic } } as Parameters<typeof automationStudioConversationCallCause>[1]);
      expect(said).toBe("the build failed: the Flow it wrote was refused 3 times in a row, the last time because the step 'keep requests with 5 or more mutual friends' was given a setting it doesn't take, so nothing was tested");
    } finally { await build.close(); }
  }, 60_000);
});

describe("why a candidate build's loop stalled", () => {
  it("replies of the wrong shape are an unusable answer; refusals of a readable answer are no progress", () => {
    expect(automationStudioCandidateStallCode(["llm_output.invalid_evidence_decision"])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode(["llm_evidence_loop.invalid_decision", "llm_output.kind_mismatch"])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode([])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode(["flow_bootstrap.evidence_completion_parameters_unresolved"])).toBe("flow_bootstrap.evidence_repeat_without_progress");
    expect(automationStudioCandidateStallCode(["candidate.submission_refused"])).toBe("flow_bootstrap.evidence_repeat_without_progress");
  });
});
