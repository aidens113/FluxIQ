// A candidate build that stalls tests its latest revision instead of ending,
// while that revision can still be tested (`../stall-retest.ts`, t477; lane C
// round 10, `run-mv5uu9g1-9d80deea`: ended with revision 3 unsure and two
// retests left).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../../../llm/evidence-loop/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION,
  AUTOMATION_STUDIO_CANDIDATE_STALL_RETESTED_CODE,
  AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID,
  AutomationStudioFlowCandidateTrialGate,
  automationStudioCandidateStallRetest,
  runAutomationStudioFlowCandidateAuthoringLoop,
  type AutomationStudioCandidateTrialRequest,
  type AutomationStudioCandidateTrialVerdict,
  type AutomationStudioFlowCandidate
} from "../index.ts";

const candidate = (revision: number, digest: string) => ({ revision, digest, baseDependencyDigest: "base", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] }) as unknown as AutomationStudioFlowCandidate;

/** A gate over one latest candidate, whose port answers the verdicts given in turn. */
function gateOver(latest: AutomationStudioFlowCandidate | undefined, verdicts: AutomationStudioCandidateTrialVerdict[] = [], withPort = true) {
  const port = async (request: { revision: number; digest: string }) => ({ revision: request.revision, digest: request.digest, verdict: verdicts.shift() ?? "unsure", feedback: {} });
  return new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, ...(withPort ? { trial: { candidateId: "candidate.t", port } } : {}) });
}

describe("what a stalled candidate build can still test", () => {
  it("names the latest revision while it has a trial left, and why not once it has none", async () => {
    expect(gateOver(candidate(3, "d3"), [], false).retestable()).toEqual({ why: "candidate.stall_no_trial_runner" });
    expect(gateOver(undefined).retestable()).toEqual({ why: "candidate.stall_nothing_submitted" });

    const unsure = gateOver(candidate(3, "d3"), ["unsure"]);
    expect(unsure.retestable()).toEqual({ revision: 3, digest: "d3", trials: 0 });
    await unsure.test({ revision: 3, digest: "d3" });
    expect(unsure.retestable()).toEqual({ revision: 3, digest: "d3", trials: 1 });
    for (let trial = 1; trial < AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION; trial += 1) await unsure.test({ revision: 3, digest: "d3" });
    expect(unsure.retestable()).toEqual({ why: "candidate.stall_retests_used" });

    const no = gateOver(candidate(3, "d3"), ["no"]);
    await no.test({ revision: 3, digest: "d3" });
    expect(no.retestable()).toEqual({ why: "candidate.stall_latest_judged_no" });

    const yes = gateOver(candidate(3, "d3"), ["yes"]);
    await yes.test({ revision: 3, digest: "d3" });
    expect(yes.retestable()).toEqual({ why: "candidate.stall_latest_passed" });
  });

  it("asks the loop to test it once per revision and trial count, and ends with the gate's reason otherwise", () => {
    const answers: Array<{ revision: number; digest: string; trials: number } | { why: string }> = [
      { revision: 3, digest: "d3", trials: 1 },
      { revision: 3, digest: "d3", trials: 1 },
      { revision: 3, digest: "d3", trials: 2 },
      { why: "candidate.stall_retests_used" }
    ];
    const recover = automationStudioCandidateStallRetest({ retestable: () => answers.shift()! });
    const stall = { issueCodes: ["llm_evidence_loop.searching_without_acting"] };
    expect(recover(stall)).toEqual({ call: { toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, input: { revision: 3, digest: "d3" } } });
    // No trial has run since: the stall-run retest was refused (a reset, say), so the build ends.
    expect(recover(stall)).toEqual({ endedBecause: AUTOMATION_STUDIO_CANDIDATE_STALL_RETESTED_CODE });
    expect(recover(stall)).toEqual({ call: { toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, input: { revision: 3, digest: "d3" } } });
    expect(recover(stall)).toEqual({ endedBecause: "candidate.stall_retests_used" });
  });
});

// The same, through the real authoring loop: the model submits, its trial is unsure, and it then searches eight times in a row.
const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const submission = { projectId: "project.test", flowId: "flow.test", registry: new AutomationStudioNodeRegistry([definition]), resolution: { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] }, baseDependencyDigest: "accepted.base" };
const plan: JsonObject = { summary: "Inspect", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
  { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "criterion" } }
], edges: [] }] } };

describe("a stalled candidate build", () => {
  it("tests its latest revision again instead of ending, and completes on that trial's yes", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const verdicts: AutomationStudioCandidateTrialVerdict[] = ["unsure", "yes"];
    let receipt: { revision: number; digest: string } | undefined;
    let decisions = 0;
    const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
      submission,
      trial: {
        candidateId: "candidate.t",
        port: async (request) => {
          asked.push(request);
          return { revision: request.revision, digest: request.digest, verdict: verdicts.shift() ?? "no", feedback: {} };
        }
      },
      loop: {
        tools: [{ toolId: "demo.find", effect: "observe", description: "Find", inputSchema: { type: "object" } }], maxIterations: 20, maxToolCalls: 20,
        unusableDecisions: { maxConsecutive: 20, maxInARow: 20, stalled: () => new Error("stalled") },
        executeTool: async ({ value }) => ({ kind: "llm_evidence_tool_execution", evidence: { found: `0 matches for ${String(value.query)}` }, effectApplied: false, stateDigests: { before: "s1", after: "s1" } }),
        decide: async ({ evidence }): Promise<AutomationStudioLlmEvidenceLoopDecision> => {
          decisions += 1;
          const submitted = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")?.value as JsonObject | undefined;
          if (submitted?.ok === true) receipt = { revision: submitted.revision as number, digest: submitted.digest as string };
          if (decisions === 1) return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit.1", input: plan };
          if (decisions === 2) return { kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: "test.1", input: receipt! };
          // Eight looks in a row; the stall after the eighth runs the retest, whose yes the next decision completes on.
          if (decisions <= 10) return { kind: "tool_call", toolId: "demo.find", callId: `find.${decisions}`, input: { query: `q${decisions}` } };
          const retest = evidence.find((entry) => entry.toolId === AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID && entry.callId.startsWith("core.stall_recovery."))?.value as JsonObject | undefined;
          expect(retest).toMatchObject({ ok: true, verdict: "yes" });
          return { kind: "complete", result: receipt! };
        }
      }
    });
    expect(outcome.loop.ok).toBe(true);
    expect(asked.map((request) => request.revision)).toEqual([1, 1]);
    expect(outcome.trial?.verdict).toBe("yes");
  });
});
