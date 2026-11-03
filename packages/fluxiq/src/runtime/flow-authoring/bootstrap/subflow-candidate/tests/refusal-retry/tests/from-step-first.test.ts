// A whole test refused until a run from the failing step passes it (`subflow.trial_from_step_first`, t804), then sent again word
// for word, through the real loop and its real repeat guard (`../../../../../../llm/repeat-guard/outcomes.ts`). The gate's answers
// report no page, so a builder that looked once is keyed on that page however its runs moved things: the refusal told it to run
// from the step, it did, and the identical whole test was refused unrun on the page it had looked at. A lending library.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../../../../llm/index.ts";
import { automationStudioCandidateTestRequestKey } from "../../../../test-request/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID as TEST, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowFromStepRequest, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialResult } from "../../../index.ts";
import { testScope } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const STEPS = ["s1", "s2", "s3"].map((key) => ({ key, definitionId: "library.open", definitionVersion: "1", label: `step ${key}`, parameters: { url: "https://library.test/all" } }));
const latest: AutomationStudioSubflowProposal = { scope: identity, revision: 1, digest: "1".repeat(64), subflows: [{ key: scope.subflowKey, name: "Find", role: "primary", nodes: STEPS, edges: [] }], summary: "Find", changedPaths: [] };
const WHOLE: JsonObject = { revision: latest.revision, digest: latest.digest };
type Step = "look" | "whole" | "from" | "failing from";

async function run(script: Step[]) {
  const whole: string[] = [];
  const ran: string[] = [];
  const answers = [{ verdict: "execution_failed" as const, stoppedAtKey: "s2" }, { verdict: "yes" as const }];
  const port = (async (request) => {
    const answer = answers[whole.length] ?? { verdict: "yes" as const };
    whole.push(answer.verdict);
    const feedback = answer.verdict === "execution_failed" ? { code: "candidate.execution_incomplete", steps: [{ step: 2, label: "step s2", status: "failed", failureCode: "library.target.not_found", retryable: true }] } : {};
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, feedback, entryPrepared: true, trialRunId: `run-${whole.length}`, ...answer } satisfies AutomationStudioSubflowTrialResult;
  }) as AutomationStudioSubflowTrialPreparingPort;
  Object.assign(port, { fromStep: async (request: AutomationStudioSubflowFromStepRequest) => {
    ran.push(request.fromKey);
    const passed = request.fromKey === "s2";
    return { fromStep: true, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, fromKey: request.fromKey, status: passed ? "ended" : "stopped", passedKeys: passed ? ["s2", "s3"] : [], feedback: { ran: true }, ...(passed ? {} : { stoppedAtKey: "s2" }) };
  } });
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(latest), port });
  const shown = new Map<string, { toolId: string; value: unknown }>();
  let at = 0;
  await runAutomationStudioLlmEvidenceLoop({
    tools: [{ toolId: "library.look", description: "Read the page.", effect: "observe", inputSchema: { type: "object" } }, gate.tool],
    maxIterations: script.length + 1, maxToolCalls: script.length + 1, dryRun: false, draft: false,
    requestContextKey: (toolId) => (toolId === TEST ? automationStudioCandidateTestRequestKey(latest) : undefined),
    unusableDecisions: { maxConsecutive: script.length + 1, maxInARow: script.length + 1, stalled: () => new Error("stalled") },
    executeTool: async ({ toolId, value }) => (toolId === TEST ? gate.test(value) : { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true, stateDigests: { before: "page.one", after: "page.one" } }),
    decide: async ({ evidence }) => {
      for (const entry of evidence) shown.set(`${entry.callId}:${JSON.stringify(entry.value)}`, { toolId: entry.toolId, value: entry.value });
      const step = script[at++];
      if (!step) return { kind: "complete", result: { ended: "script done" } };
      if (step === "look") return { kind: "tool_call", toolId: "library.look", callId: `look.${at}`, input: { n: at } };
      return { kind: "tool_call", toolId: TEST, callId: `test.${at}`, input: step === "whole" ? WHOLE : { ...WHOLE, from: step === "from" ? "s2" : "s1" } };
    }
  });
  const of = (toolId: string) => [...shown.values()].filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
  return { whole, ran, tests: of(TEST), repeats: of("core.repeat_check") };
}

describe("subflow.trial_from_step_first under the real repeat guard", () => {
  it("told to run from the failing step, the identical whole test runs once that run passed it", async () => {
    const done = await run(["look", "whole", "whole", "from", "whole"]);
    expect(done.tests[1]).toMatchObject({ ok: false, code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect(done.repeats).toEqual([]);
    expect(done.ran).toEqual(["s2"]);
    expect(done.whole).toEqual(["execution_failed", "yes"]);
  });

  it("with no call between, the identical whole test is still refused unrun", async () => {
    const alone = await run(["look", "whole", "whole", "whole"]);
    expect(alone.repeats).toHaveLength(1);
    expect(alone.whole).toEqual(["execution_failed"]);
  });

  it("after a run that did not check the repair, the gate answers again, and the refusal is not lifted by a refused call", async () => {
    const unchecked = await run(["look", "whole", "whole", "failing from", "whole"]);
    expect(unchecked.tests.at(-1)).toMatchObject({ ok: false, code: "subflow.trial_from_step_first", repairStep: "s2" });
    expect(unchecked.whole).toEqual(["execution_failed"]);
  });
});
