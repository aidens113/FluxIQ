// @fluxiq-test-group real-sql
// A candidate build that fails after the model wrote its Flow (t362, lane A
// round 4, `run-muyrpbnk-fef374e7`, C6): four revisions were accepted and two
// were test-run, then twelve refused submissions stopped the build, which told
// the person "the model's answer could not be used" and that the Flow "has no
// steps yet", and the Lab recorded `candidate: null`. These drive the actual
// service. No count of refused submissions ends a build any more (t1056), and no
// stall does either (t1063): each refusal is told, loop detection steers, and at
// the top of its ladder the build retests its latest revision where the trial
// gate can, and otherwise the model decides how to go on. The purse ends these
// builds. Each call the provider answers -- the start's reading of the
// instruction (t976), then each decision -- costs two cents of the $0.25 purse
// (the run ceiling) unless a test says otherwise, and each judge call $0.0005, so
// a build that makes no judged trial ends after 12 calls, $0.24: the $0.01 left
// cannot hold a thirteenth.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioConversationCallCause } from "../../../../../runtime/conversations/commands/index.ts";
import { parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioCandidateStallCode } from "../../candidate-failure/index.ts";
import { blankFixture, caller, judgeReply, mockProvider, plan } from "../../../tests/service-bootstrap/tests/fixtures.ts";

type Reply = (call: number, latest: { revision?: number; digest?: string } | undefined) => Record<string, unknown>;

/** A submission the completion check refuses, the same way each time. */
const refusedSubmission = { kind: "tool_call", callId: "submit-bad", toolId: "core.submit_candidate", input: { summary: "popups first", plan: { schemaVersion: "0.1" } } };

/**
 * What the trial's judge names when it says no: a current no lists its defects (t752, 534c41fb), and a Flow that
 * stores no rows names the act no step does (t766), which Core finds in the trial's steps.
 */
const NO_DEFECTS = [{ kind: "act_missing", row: "a deterministic step between Start and End", requestWords: "Create a deterministic Start to End Flow" }];

/** A page that never moves: each look finds nothing, on the same page state, so a run of them is a search going nowhere. */
const lookFindsNothing = async ({ value }: { value: Record<string, unknown> }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { found: `0 matches for ${String(value.area)}` }, effectApplied: false, stateDigests: { before: "s1", after: "s1" } });

/**
 * The build, driven through the service. Every call the provider answers -- the start's reading of the instruction
 * (t976) first, then each decision -- costs `decisionUsd` (two cents unless given); each judge call `JUDGE_USAGE`'s $0.0005.
 */
async function candidateBuild(reply: Reply, verdict: "yes" | "no" | "unknown" = "no", options: { decisionUsd?: number; look?: typeof lookFindsNothing } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-kept-"));
  let calls = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply(verdict, verdict === "no" ? { defects: NO_DEFECTS } : {});
    calls++;
    const evidence = request.context.evidenceLoop?.evidence ?? [];
    const latest = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate" && (entry.value as { ok?: unknown } | undefined)?.ok === true)?.value as { revision?: number; digest?: string } | undefined;
    return { response: { kind: "evidence_tool_decision", summary: "Scripted candidate authoring", decision: reply(calls, latest) }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: options.decisionUsd ?? 0.02 } };
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: options.look ?? (async () => ({ kind: "llm_evidence_tool_execution", evidence: { area: "item" }, effectApplied: false, targetsUnchanged: true })) } });
  const { project, flow } = await blankFixture(service);
  const settled = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "candidate" })
    .then((result) => ({ ok: true as const, result }), (error: unknown) => ({ ok: false as const, error }));
  const drafts = (service as unknown as { candidateDrafts: { get(projectId: string, flowId: string): Promise<{ candidateId: string; candidate: { revision: number; digest: string } } | undefined> } }).candidateDrafts;
  return { settled, draft: () => drafts.get(project.id, flow.flowId), close: async () => { await service.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

describe("a candidate build that fails after writing its Flow says what it kept", () => {
  it("refused submissions in a row are steered, never ended, until the purse runs out; the latest accepted revision is kept as a draft, naming the candidate and its trial", async () => {
    const build = await candidateBuild((call, latest) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } }
      : call === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "whole flow", plan: plan() } }
      : call === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { ...refusedSubmission, callId: `submit-bad-${call}` });
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic((build.settled.error as { diagnostic?: unknown }).diagnostic);
      if (!diagnostic) throw new Error("the failure carried no diagnostic Core reads back");
      // The purse, never loop detection (t1063): the start's reading, the submission, its trial and 9 refused submissions
      // are 12 calls at $0.02, and the trial's two judge calls $0.0005 each, $0.241 of $0.25. The $0.009 left cannot hold a call.
      expect(diagnostic.code).toBe("flow_bootstrap.evidence_iteration_limit");
      expect(diagnostic.accounting).toMatchObject({ inputTokens: 12 * 10 + 2 * 200, outputTokens: 12 * 5 + 2 * 20, estimatedCostUsd: expect.closeTo(12 * 0.02 + 2 * 0.0005, 6) });
      const steps = (diagnostic.evidenceLoop as { steps: { toolId: string; resultCode?: string }[] } | undefined)?.steps ?? [];
      expect(steps.filter((step) => step.toolId === "core.submit_candidate" || step.toolId === "core.test_candidate")).toHaveLength(11);
      // Steered, then the ladder's top reached and decided by the model, and the build went on past it: the trial was judged
      // no, so the gate has no retest to run, and what had ended the build here (t1056) is now only a rung.
      const top = steps.findIndex((step) => step.resultCode === "llm_evidence_loop.loop_change_approach");
      expect(steps.findIndex((step) => step.resultCode === "llm_evidence_loop.loop_steered")).toBeLessThan(top);
      expect(top).toBeGreaterThan(0);
      expect(steps.slice(top + 1).filter((step) => step.toolId === "core.submit_candidate").length).toBeGreaterThan(0);
      const draft = await build.draft();
      expect(draft).toBeDefined();
      expect(diagnostic.candidate).toEqual({ candidateId: draft!.candidateId, draft: "saved", revision: draft!.candidate.revision, digest: draft!.candidate.digest, trialCount: 1,
        trials: [{ revision: draft!.candidate.revision, verdict: "no", trialRunId: expect.any(String), code: expect.any(String) }] });
      // What the chat says: the real cause, the budget, never the stage's words.
      const said = automationStudioConversationCallCause("the build", { ok: false, payload: { diagnostic } } as Parameters<typeof automationStudioConversationCallCause>[1]);
      expect(said).toBe("the build failed: it reached its spending limit");
    } finally { await build.close(); }
  }, 60_000);

  it("a model that repeats itself after an unsure trial is retested by the trial gate at the ladder's top, and goes on: the purse ends it", async () => {
    const build = await candidateBuild((call, latest) => call === 1 ? { kind: "tool_call", callId: "look", toolId: "inspect", input: { area: "item" } }
      : call === 2 ? { kind: "tool_call", callId: "submit", toolId: "core.submit_candidate", input: { summary: "whole flow", plan: plan() } }
      : call === 3 ? { kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: { revision: latest?.revision, digest: latest?.digest } }
      : { kind: "tool_call", callId: `look-${call}`, toolId: "inspect", input: { area: `shelf ${call}` } }, "unknown", { decisionUsd: 0.001, look: lookFindsNothing });
    try {
      if (build.settled.ok) throw new Error(`expected the build to end, got ${build.settled.result.status}`);
      const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic((build.settled.error as { diagnostic?: unknown }).diagnostic);
      if (!diagnostic) throw new Error("the failure carried no diagnostic Core reads back");
      // The model asked for one trial; the loop ran two more of the same revision itself, each time the run of looks
      // reached the ladder's top while the gate still had a retest (`candidate/stall-retest.ts`). Three trials is the gate's
      // most per revision, so after that the ladder's top is decided by the model and the build goes on.
      expect(diagnostic.candidate).toMatchObject({ draft: "saved", revision: 1, trialCount: 3,
        trials: [1, 2, 3].map(() => ({ revision: 1, verdict: "unsure", trialRunId: expect.any(String), code: "candidate.trial_unconfirmed" })) });
      const steps = (diagnostic.evidenceLoop as { steps: { toolId: string; resultCode?: string }[] } | undefined)?.steps ?? [];
      expect(steps.filter((step) => step.toolId === "core.test_candidate" && step.resultCode === "candidate.trial_unsure")).toHaveLength(3);
      expect(steps.filter((step) => step.resultCode === "llm_evidence_loop.loop_change_approach").length).toBeGreaterThan(2);
      // Never a stall: the purse ends it. The start's reading and 232 decisions at $0.001 are 233 calls, and the three
      // trials' six judge calls $0.0005 each: $0.236 of $0.25, and the $0.014 left cannot hold the next decision beside the
      // judging the purse keeps back.
      expect(diagnostic.code).toBe("flow_bootstrap.evidence_iteration_limit");
      expect(diagnostic.accounting).toMatchObject({ inputTokens: 233 * 10 + 6 * 200, outputTokens: 233 * 5 + 6 * 20, estimatedCostUsd: expect.closeTo(233 * 0.001 + 6 * 0.0005, 6) });
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
      // The purse ends it, never loop detection (t1063): the start's reading and 11 refused submissions are 12 calls at
      // $0.02, $0.24 of $0.25, and the $0.01 left cannot hold a thirteenth. The budget's ending names the refused step its money last went on (t1056), in the
      // model's own words, with where its issue is and that issue's code; never the node's key or definition.
      expect(diagnostic.code).toBe("flow_bootstrap.evidence_iteration_limit");
      expect(diagnostic.accounting).toMatchObject({ inputTokens: 12 * 10, outputTokens: 12 * 5, estimatedCostUsd: expect.closeTo(12 * 0.02, 6) });
      expect(diagnostic.refusedSteps).toEqual([{ step: "keep requests with 5 or more mutual friends", path: "plan.subflows.0.nodes.1.parameters.minimumMutualFriends", code: "bootstrap.unknown_parameter" }]);
      const said = automationStudioConversationCallCause("the build", { ok: false, payload: { diagnostic } } as Parameters<typeof automationStudioConversationCallCause>[1]);
      expect(said).toBe("the build failed: it reached its spending limit while the Flow it wrote was still being refused, the last time because the step 'keep requests with 5 or more mutual friends' was given a setting it doesn't take");
    } finally { await build.close(); }
  }, 60_000);
});

// The stall code now serves a project brief's builder, which still stalls; a candidate build never does (t1063, `../../candidate-failure/stall-code.ts`).
describe("why a builder's loop stalled", () => {
  it("replies of the wrong shape are an unusable answer; refusals of a readable answer are no progress", () => {
    expect(automationStudioCandidateStallCode(["llm_output.invalid_evidence_decision"])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode(["llm_evidence_loop.invalid_decision", "llm_output.kind_mismatch"])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode([])).toBe("flow_bootstrap.evidence_unusable_decision");
    expect(automationStudioCandidateStallCode(["flow_bootstrap.evidence_completion_parameters_unresolved"])).toBe("flow_bootstrap.evidence_repeat_without_progress");
    expect(automationStudioCandidateStallCode(["candidate.submission_refused"])).toBe("flow_bootstrap.evidence_repeat_without_progress");
  });
});
