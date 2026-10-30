// A builder whose trial port can run from a step (t804): its submit tool and
// the submit answer's `next` say to repair a failed test live on its failing step
// and check it from there, a run from a step is never recorded as a trial, and
// the brief finishes only on a judged whole run of its latest revision.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool } from "../../../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID,
  AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID,
  AutomationStudioSubflowPendingRepair,
  runAutomationStudioSubflowBuilderLoop,
  type AutomationStudioSubflowFromStepRequest,
  type AutomationStudioSubflowFromStepResult,
  type AutomationStudioSubflowTrialRequest,
  type AutomationStudioSubflowTrialResult
} from "../../../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "../../subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };
type Entry = { callId: string; toolId: string; value: unknown };
type Decide = Parameters<typeof runAutomationStudioSubflowBuilderLoop>[0]["loop"]["decide"];

const answerOf = (evidence: readonly Entry[], callId: string): JsonObject => [...evidence].reverse().find((entry) => entry.callId === callId)!.value as JsonObject;
const submitted = (evidence: readonly Entry[]) => {
  const value = answerOf(evidence, "submit");
  return { revision: value.revision as number, digest: value.digest as string };
};

async function build(steps: Array<(evidence: readonly Entry[]) => JsonObject>, trials: AutomationStudioSubflowTrialResult["verdict"][], keys: { failAt?: string }) {
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  const ran: AutomationStudioSubflowFromStepRequest[] = [];
  const seen: Entry[][] = [];
  const observed: AutomationStudioLlmEvidenceLoopInput[] = [];
  let index = 0;
  const decide: Decide = async ({ evidence }) => {
    seen.push([...(evidence as Entry[])]);
    const step = steps[index++];
    if (!step) throw new Error("script exhausted");
    return step(evidence as Entry[]);
  };
  const port = Object.assign(async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    asked.push(request);
    keys.failAt = request.proposal.subflows[0]!.nodes[1]!.key;
    const verdict = trials.shift() ?? "yes";
    return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict, feedback: verdict === "execution_failed" ? { code: "candidate.execution_incomplete", steps: [{ step: 2, status: "failed", failureCode: "web.target.not_found" }] } : {}, entryPrepared: true, ...(verdict === "execution_failed" ? { stoppedAtKey: keys.failAt } : {}) };
  }, {
    fromStep: async (request: AutomationStudioSubflowFromStepRequest): Promise<AutomationStudioSubflowFromStepResult> => {
      ran.push(request);
      return { fromStep: true, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, fromKey: request.fromKey, status: "ended", passedKeys: [request.fromKey], feedback: {} };
    }
  });
  const pendingRepair = new AutomationStudioSubflowPendingRepair();
  const outcome = await runAutomationStudioSubflowBuilderLoop({
    scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission(), trial: { port }, pendingRepair,
    observe: (loop) => {
      observed.push(loop);
      return loop;
    },
    loop: {
      tools: [look], maxIterations: steps.length, maxToolCalls: steps.length + 4,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
      decide
    }
  });
  return { outcome, asked, ran, seen, observed, pendingRepair };
}

describe("a builder that can run its part from a step (t804)", () => {
  it("is told to repair a failed test from its failing step, runs from it, and finishes only on a judged whole run", async () => {
    const keys: { failAt?: string } = {};
    let nextAfterSubmit = "";
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => {
        nextAfterSubmit = String(answerOf(evidence, "submit").next);
        return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test-1", input: submitted(evidence) };
      },
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "from-1", input: { ...submitted(evidence), from: keys.failAt } }),
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test-2", input: submitted(evidence) }),
      (evidence: readonly Entry[]) => ({ kind: "complete", result: { subflowKey: "find_listing", ...submitted(evidence) } })
    ];
    const { outcome, asked, ran, seen, observed, pendingRepair } = await build(steps, ["execution_failed", "yes"], keys);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(nextAfterSubmit).toContain("Test the whole part when you believe the whole part works; after a test fails, repair the failing step live and check it by running from it, with from.");
    const failed = answerOf(seen[2]!, "test-1");
    expect(String(failed.instruction)).toContain(`Repair live, from the page this test left: work on step "${keys.failAt}"`);
    const fromRun = answerOf(seen[3]!, "from-1");
    expect(fromRun).toMatchObject({ fromStep: true, repairChecked: true });
    expect(ran).toHaveLength(1);
    expect(asked).toHaveLength(2);
    expect(pendingRepair.standing).toBe(false);
    expect(outcome.trial).toMatchObject({ verdict: "yes" });
    expect(outcome.lastTrial).toMatchObject({ verdict: "yes" });
    const submitTool = observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
    expect(submitTool.description).toContain("After a failed test, repair the failing step live and check it by testing from that step (from) before testing the whole part again.");
    expect(submitTool.description.length).toBeLessThanOrEqual(2000);
    const testTool = observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)!;
    expect(testTool.description.length).toBeLessThanOrEqual(2000);
  });

  it("says in the submit answer, while a repair stands, to run from the failing step with its exact call", async () => {
    const keys: { failAt?: string } = {};
    let next = "";
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test-1", input: submitted(evidence) }),
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit-2", input: script([...OPEN, ...callPart("widen"), ...part("widen")]) }),
      (evidence: readonly Entry[]) => {
        next = String(answerOf(evidence, "submit-2").next);
        return { kind: "complete", result: { ended: "partial", reason: "stopping the test here" } };
      }
    ];
    const { outcome } = await build(steps, ["execution_failed"], keys);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(next).toMatch(/^A test of this part failed: check this repair next by running it from the failing step/u);
    expect(next).toMatch(/"from": "[^"]+"\}/u);
    expect(next).toContain("Test the whole part only when you believe the whole part works");
  });
});
