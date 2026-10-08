import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE, AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT } from "../../plan/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION,
  AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID,
  runAutomationStudioFlowCandidateAuthoringLoop,
  type AutomationStudioCandidateTrialRequest,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioCandidateTrialVerdict
} from "../index.ts";

// The trial gate in the real authoring loop: the model decides through a
// script, Core's loop runs it, and the trial port is a fake that records what
// it was asked. Every refusal is read where the model reads it -- the evidence
// of the next decision -- so the feedback is proved to reach the model.

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base" };
function plan(text = "reusable criterion"): JsonObject {
  return { summary: "Inspect selected values", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
    { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text } }
  ], edges: [] }] } };
}

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const receipt = (evidence: readonly Entry[]) => { const value = latestOf("core.submit_candidate", evidence)!; return { revision: value.revision as number, digest: value.digest as string }; };
const submit = (text?: string): Step => () => ({ kind: "tool_call", toolId: "core.submit_candidate", callId: `submit.${text ?? "same"}.${Math.random().toString(36).slice(2, 8)}`, input: plan(text) });
const test: Step = (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: `test.${Math.random().toString(36).slice(2, 8)}`, input: receipt(evidence) });
const complete: Step = (evidence) => ({ kind: "complete", result: receipt(evidence) });

/** Runs the loop over the scripted steps; what each decision saw is kept, and the loop stops when the script runs out. */
async function run(steps: Step[], port?: (request: AutomationStudioCandidateTrialRequest) => Promise<AutomationStudioCandidateTrialResult>, explored: JsonObject = { looked: true }, stateDigests?: { before: string; after: string }) {
  const seen: Entry[][] = [];
  let index = 0;
  const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission,
    ...(port ? { trial: { candidateId: "candidate.under-test", port } } : {}),
    loop: {
      tools: [{ toolId: "demo.explore", effect: "mutate", description: "Explore", inputSchema: { type: "object" } }], maxIterations: steps.length, maxToolCalls: steps.length,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: explored, effectApplied: false, ...(stateDigests ? { stateDigests } : {}) }),
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence) as never;
      }
    }
  }).catch((error: unknown) => ({ error }));
  return { outcome, seen };
}
const verdictPort = (verdicts: AutomationStudioCandidateTrialVerdict[], asked: AutomationStudioCandidateTrialRequest[] = []) => async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
  asked.push(request);
  const verdict = verdicts.shift() ?? "no";
  return { revision: request.revision, digest: request.digest, verdict, feedback: { said: `judge said ${verdict}` }, trialRunId: `run.${asked.length}` };
};
const completionFeedback = (evidence: readonly Entry[]) => latestOf(AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, evidence);
function loopOf(outcome: Awaited<ReturnType<typeof run>>["outcome"]) {
  if ("error" in outcome) throw outcome.error;
  return outcome;
}

describe("candidate trial gate", () => {
  it("refuses completion without a trial as candidate.trial_required, and an untested candidate carries no verdict", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { outcome, seen } = await run([submit(), complete, complete], verdictPort([], asked));
    expect(asked).toEqual([]);
    const feedback = completionFeedback(seen[2]!);
    expect(feedback).toMatchObject({ code: "candidate.trial_required" });
    expect(String(feedback?.instruction)).toContain(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID);
    // The script ran out with the candidate still untested: no loop success, no verdict, never promotable.
    expect("error" in outcome || !outcome.loop.ok).toBe(true);
  });

  it("returns no verdict for a loop that ends on an untested candidate", async () => {
    const result = loopOf((await run([submit(), complete], verdictPort([]))).outcome);
    expect(result.loop.ok).toBe(false);
    expect(result.candidate).toMatchObject({ revision: 1 });
    expect(result.trial).toBeUndefined();
    expect(result.promotionAllowed).toBe(false);
  });

  it("completes on a yes for the exact latest revision and digest, and the port receives exactly that revision", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const result = loopOf((await run([submit(), test, complete], verdictPort(["yes"], asked))).outcome);
    expect(result.loop.ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ candidateId: "candidate.under-test", revision: result.candidate!.revision, digest: result.candidate!.digest });
    expect(asked[0]!.signal).toBeInstanceOf(AbortSignal);
    // The port is handed the exact submission the digest names, frozen.
    expect(asked[0]!.candidate.digest).toBe(result.candidate!.digest);
    expect(asked[0]!.candidate.buildPlan).toEqual(result.candidate!.buildPlan);
    expect(Object.isFrozen(asked[0]!.candidate.buildPlan)).toBe(true);
    expect(result.trial).toMatchObject({ verdict: "yes", revision: 1, digest: result.candidate!.digest, trialRunId: "run.1" });
    expect(result.promotionAllowed).toBe(false);
  });

  it("does not let a yes on R1 complete R2, even when R2 is the same Flow", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { outcome, seen } = await run([submit(), test, submit(), complete, complete], verdictPort(["yes"], asked));
    expect(asked.map((request) => request.revision)).toEqual([1]);
    expect(completionFeedback(seen[4]!)).toMatchObject({ code: "candidate.trial_required" });
    expect(String(completionFeedback(seen[4]!)?.instruction)).toContain("revision 2");
    const result = loopOf(outcome);
    expect(result.loop.ok).toBe(false);
    expect(result.candidate?.revision).toBe(2);
    expect(result.trial).toBeUndefined();
  });

  it.each(["unsure", "not_judged", "execution_failed"] as const)("refuses completion after a %s trial and shows the trial's feedback", async (verdict) => {
    const { outcome, seen } = await run([submit(), test, complete, complete], verdictPort([verdict]));
    const tested = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[2]!);
    expect(tested).toMatchObject({ ok: false, verdict, feedback: { said: `judge said ${verdict}` } });
    expect(String(tested?.instruction)).toMatch(/cannot complete/);
    const feedback = completionFeedback(seen[3]!);
    expect(feedback).toMatchObject({ code: `candidate.trial_${verdict}`, verdict, trialFeedback: { said: `judge said ${verdict}` } });
    expect(loopOf(outcome).trial).toMatchObject({ verdict });
  });

  it("lets a transient verdict be tried again on the same revision", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const result = loopOf((await run([submit(), test, test, complete], verdictPort(["not_judged", "yes"], asked))).outcome);
    expect(asked.map((request) => request.revision)).toEqual([1, 1]);
    expect(result.loop.ok).toBe(true);
  });

  // Lane A round 4 (`run-muyrpbnk-fef374e7`, 0048-0050): the web domain reports the page each call found, so the loop's
  // repeat guard had a page to key the trial on, and refused the identical re-test after a busy page as "failed before".
  it.each(["execution_failed", "not_judged", "unsure"] as const)("re-tests the same revision after %s even when exploration reported the page it was on", async (verdict) => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const explore: Step = () => ({ kind: "tool_call", toolId: "demo.explore", callId: `look.${Math.random().toString(36).slice(2, 8)}`, input: { look: true } });
    const { outcome, seen } = await run([explore, submit(), test, test, complete], verdictPort([verdict, "yes"], asked), { looked: true }, { before: "page.one", after: "page.one" });
    const result = loopOf(outcome);
    expect(JSON.stringify(seen[4])).not.toContain("llm_evidence_loop.repeat_refused");
    expect(asked.map((request) => request.revision)).toEqual([1, 1]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ verdict, retestsLeft: 2 });
    expect(result.loop.ok).toBe(true);
    expect(result.trial).toMatchObject({ verdict: "yes", revision: 1 });
  });

  it("bounds re-tests of one revision: past the bound the gate refuses by name and says to change the Flow", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { seen } = await run([submit(), test, test, test, test, complete], verdictPort(["execution_failed", "execution_failed", "execution_failed", "yes"], asked), { looked: true }, { before: "page.one", after: "page.one" });
    expect(asked).toHaveLength(AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)).toMatchObject({ verdict: "execution_failed", retestsLeft: 0 });
    const limited = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!);
    expect(limited).toMatchObject({ ok: false, code: "candidate.trial_retest_limit", trials: 3, maxTrials: 3, previousFeedback: { said: "judge said execution_failed" } });
    expect(String(limited?.instruction)).toMatch(/submit the whole candidate/);
  });

  // t368, F2 (lane A round 6, `run-muz2cj6p-80eb2179`, trials 1 and 2): revision 2's wait timed out, the model
  // re-tested it, and it timed out again at the same step. The same failure at the same step in two trials of one
  // revision is the Flow, not the page: the revision is not tested again, and the model is told to change the step.
  describe("the same failure at the same step twice", () => {
    const stoppedAt = (step: number, definitionId: string, failureCode: string): JsonObject => ({
      code: "candidate.execution_incomplete", start: "reset",
      steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" }, { step, definitionId, status: "failed", attempts: 4, failureCode, retryable: true }]
    });
    const failingPort = (feedbacks: JsonObject[], asked: AutomationStudioCandidateTrialRequest[]) => async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
      asked.push(request);
      const feedback = feedbacks.shift();
      return feedback
        ? { revision: request.revision, digest: request.digest, verdict: "execution_failed", feedback, trialRunId: `run.${asked.length}` }
        : { revision: request.revision, digest: request.digest, verdict: "yes", feedback: { said: "yes" }, trialRunId: `run.${asked.length}` };
    };
    const wait = stoppedAt(13, "web.output.dom-wait_for_text", "web.action.timeout");

    it("ends re-testing of that revision with change-the-step feedback, within the three-trial limit", async () => {
      const asked: AutomationStudioCandidateTrialRequest[] = [];
      const { outcome, seen } = await run([submit(), test, test, test, complete, complete], failingPort([structuredClone(wait), structuredClone(wait), structuredClone(wait)], asked));
      expect(asked.map((request) => request.revision)).toEqual([1, 1]);
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[2]!)).toMatchObject({ verdict: "execution_failed", retestsLeft: 2 });
      const second = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!);
      expect(second).toMatchObject({ verdict: "execution_failed", retestsLeft: 0,
        failedStep: { step: 13, definitionId: "web.output.dom-wait_for_text", failureCode: "web.action.timeout", code: "candidate.execution_incomplete" } });
      expect(String(second?.instruction)).toContain("stopped at the same step with the same failure in two trials");
      expect(String(second?.instruction)).toContain("Change that step");
      const refusedRetest = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!);
      expect(refusedRetest).toMatchObject({ ok: false, code: "candidate.trial_same_failure", failedStep: { step: 13, definitionId: "web.output.dom-wait_for_text" } });
      expect(JSON.stringify(seen[4])).not.toContain("llm_evidence_loop.repeat_refused");
      // Completion says the same, never "test this same revision again".
      const completion = completionFeedback(seen[5]!);
      expect(completion).toMatchObject({ code: "candidate.trial_execution_failed", failedStep: { step: 13 } });
      expect(String(completion?.instruction)).toContain("Change that step");
      expect(loopOf(outcome).trial).toMatchObject({ verdict: "execution_failed", revision: 1 });
    });

    it("still re-tests a revision whose two failures were at different steps", async () => {
      const asked: AutomationStudioCandidateTrialRequest[] = [];
      const { outcome, seen } = await run([submit(), test, test, test, complete],
        failingPort([structuredClone(wait), stoppedAt(8, "web.output.dom-click", "web.action.rate_limited")], asked));
      expect(asked.map((request) => request.revision)).toEqual([1, 1, 1]);
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ verdict: "execution_failed", retestsLeft: 1 });
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).not.toHaveProperty("failedStep");
      expect(loopOf(outcome).loop.ok).toBe(true);
    });

    it("tests the changed revision the model submits after it", async () => {
      const asked: AutomationStudioCandidateTrialRequest[] = [];
      const { outcome } = await run([submit("first"), test, test, submit("changed"), test, complete], failingPort([structuredClone(wait), structuredClone(wait)], asked));
      expect(asked.map((request) => request.revision)).toEqual([1, 1, 2]);
      expect(loopOf(outcome)).toMatchObject({ loop: { ok: true }, trial: { verdict: "yes", revision: 2 } });
    });
  });

  it("after a no, refuses completing or retesting the unchanged Flow until it changes", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { outcome, seen } = await run([submit("first"), test, complete, test, submit("first"), test, submit("revised"), test, complete], verdictPort(["no", "yes"], asked));
    expect(completionFeedback(seen[3]!)).toMatchObject({ code: "candidate.trial_unchanged_after_no", previousFeedback: { said: "judge said no" } });
    // Testing it again, or resubmitting the same Flow as a new revision, never reaches the judge.
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)).toMatchObject({ ok: false, code: "candidate.trial_unchanged_after_no" });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)).toMatchObject({ ok: false, code: "candidate.trial_unchanged_after_no" });
    expect(asked.map((request) => request.revision)).toEqual([1, 3]);
    const result = loopOf(outcome);
    expect(result.loop.ok).toBe(true);
    expect(result.candidate?.revision).toBe(3);
    expect(result.trial).toMatchObject({ verdict: "yes", revision: 3 });
  });

  it("tests only the latest submission, without asking the port for a stale one", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const stale: Step = () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: "test.stale", input: { revision: 1, digest: "not-the-digest" } });
    const { seen } = await run([submit(), stale, complete], verdictPort(["yes"], asked));
    expect(asked).toEqual([]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[2]!)).toMatchObject({ ok: false, code: "candidate.trial_stale_revision", latestRevision: 1 });
  });

  it("counts a verdict about another revision or a failing port as execution_failed, never as a yes", async () => {
    const wrong = async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => ({ revision: request.revision, digest: "other", verdict: "yes", feedback: {} });
    const mismatched = await run([submit(), test, complete, complete], wrong);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, mismatched.seen[2]!)).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_result_mismatch" } });
    expect(completionFeedback(mismatched.seen[3]!)).toMatchObject({ code: "candidate.trial_execution_failed" });
    const thrown = await run([submit(), test, complete], async () => { throw new Error("secret page text"); });
    const tested = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, thrown.seen[2]!);
    expect(tested).toMatchObject({ verdict: "execution_failed", feedback: { code: "candidate.trial_port_failed" } });
    expect(JSON.stringify(tested)).not.toContain("secret page text");
  });

  it("without a port answers candidate.trial_unavailable and still ends as a draft, as before", async () => {
    const { outcome, seen } = await run([submit(), test, complete]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[2]!)).toMatchObject({ ok: false, code: "candidate.trial_unavailable" });
    const result = loopOf(outcome);
    expect(result.loop.ok).toBe(true);
    expect(result.candidate).toMatchObject({ revision: 1, status: "draft" });
    expect(result.trial).toBeUndefined();
    expect(result.promotionAllowed).toBe(false);
  });

  it("shows the model the Flow script format, the act-on-an-item example and the test tool on the submit tool", async () => {
    let tools: Array<{ toolId: string; description: string; inputSchema: JsonObject }> = [];
    let decisionSchema = "";
    await runAutomationStudioFlowCandidateAuthoringLoop({ submission, loop: {
      tools: [], maxIterations: 1, maxToolCalls: 1,
      executeTool: async () => ({}),
      decide: async (request) => { tools = request.tools as typeof tools; decisionSchema = JSON.stringify(request.decisionSchema); throw new Error("seen"); }
    } }).catch(() => undefined);
    const submitTool = tools.find((tool) => tool.toolId === "core.submit_candidate")!;
    const flow = (submitTool.inputSchema.properties as Record<string, JsonObject>).flow!;
    expect(String(flow.description)).toContain(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT);
    expect(String(flow.description)).toContain(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE);
    // The schema is what the provider receives (the decision schema carries each tool's input).
    expect(decisionSchema).toContain(JSON.stringify(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).slice(1, 200));
    expect(submitTool.description).toContain(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID);
    for (const tool of tools) expect(tool.description.length).toBeLessThanOrEqual(2_000);
    expect(tools.map((tool) => tool.toolId)).toContain(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID);
  });
});
