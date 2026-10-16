// A single-subflow plan's whole test reaches its briefs' gates (t679,
// `../run-brief.ts`, `../../single-subflow/whole-test-port.ts`): a build or
// repair brief's `core.test_subflow` is answered by the dispatch's
// `wholeTrial` in place of the subflow trial port, its start hook still run
// first and each trial still listed, remembered and kept as its gate weighed
// it; a whole test that did not run is answered as its refusal, never a
// verdict; a reset brief never asks it. The real builder loop and gate run on
// a scripted model over a seed catalogue (shaped unlike any Lab scenario).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetTrialReset } from "../../../flow-bootstrap/site-reset/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { OPEN, callPart, part, script, testSubmission } from "../../../flow-bootstrap/subflow-candidate/tests/subflow-fixture.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { createAutomationStudioProjectDispatcher, type AutomationStudioProjectBuilderPorts, type AutomationStudioProjectDispatchWholeTrial, type AutomationStudioProjectResetPorts } from "../index.ts";
import { gardenBrief, gardenBuild, REF } from "./dispatch-fixture.ts";

type Entry = { callId: string; toolId: string; value: unknown };

const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;

/** What one builder's test met: the subflow trial port's calls and start hooks, the gate's resets, and what the test answered. */
type Seen = { scoped: number; hooks: number; resets: number; weighedScoped: number; tested: JsonObject[]; testTool?: string | undefined };

/** A builder whose model submits, tests, then completes on a yes or ends blocked; its subflow trial port answers yes, its start hook and reset are counted. */
function builder(seen: Seen) {
  return (): AutomationStudioProjectBuilderPorts => {
    const steps = [
      () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) }),
      (evidence: readonly Entry[]) => {
        const submitted = lastOf(evidence, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
        return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: { revision: submitted.revision, digest: submitted.digest } };
      },
      (evidence: readonly Entry[]) => {
        const tested = lastOf(evidence, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)!;
        seen.tested.push(tested);
        const submitted = lastOf(evidence, AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!;
        return tested.verdict === "yes"
          ? { kind: "complete", result: { subflowKey: "list_seeds", revision: submitted.revision, digest: submitted.digest } }
          : { kind: "complete", result: { ended: "blocked", reason: "The whole test did not run." } };
      }
    ];
    let step = 0;
    const scoped: AutomationStudioSubflowTrialPreparingPort = async (request) => {
      seen.scoped += 1;
      return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: {}, entryPrepared: true, trialRunId: "scoped-run" };
    };
    scoped.prepareStart = async () => {
      seen.hooks += 1;
      return "reset";
    };
    scoped.weighed = () => {
      seen.weighedScoped += 1;
    };
    const reset: AutomationStudioSiteResetTrialReset = {
      beforeTrial: async () => {
        seen.resets += 1;
        return { kind: "admit" };
      },
      trialRan: () => []
    };
    return {
      loop: {
        tools: [LOOK], maxToolCalls: 8,
        unusableDecisions: { maxConsecutive: 3, maxInARow: 3, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "The seed catalogue." }, effectApplied: false, targetsUnchanged: true }),
        decide: async ({ evidence, tools }) => {
          seen.testTool ??= tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID)?.description;
          return steps[step++]!(evidence);
        }
      },
      submission: testSubmission(),
      deniedEvidenceKeys: [],
      trial: scoped,
      reset
    };
  };
}

/** A whole test answering `verdict` for the proposal under test, or refusing; every request it was asked is kept. */
function whole(answer: "yes" | "no" | "refused", asked: AutomationStudioSubflowTrialRequest[]): AutomationStudioProjectDispatchWholeTrial {
  return async (request) => {
    asked.push(request);
    if (answer === "refused") return { refused: { code: "candidate.trial_reset_required", instruction: "Undo the listed acts, then test again.", detail: { actsToUndo: [{ act: "act-1", did: "press \"Plant\"" }] }, retry: true } };
    return { trial: { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: answer, feedback: { wholeTest: { revision: 4, digest: "d".repeat(64) } }, entryPrepared: true, trialRunId: "whole-run-1" } };
  };
}

describe("a single-subflow plan's whole test in the dispatcher", () => {
  it("answers a build brief's test in place of its subflow trial port, after the port's start hook and the gate's reset, and lists its receipt", async () => {
    const seen: Seen = { scoped: 0, hooks: 0, resets: 0, weighedScoped: 0, tested: [] };
    const told: string[] = [];
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: builder(seen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    build.dispatcherInput.trialled = (scope, proposal, verdict) => told.push(`${scope.briefId} ${proposal.revision} ${verdict}`);
    const returned = await dispatchWith(build, whole("yes", asked));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.scope).toMatchObject({ briefId: "b-read", subflowKey: "list_seeds" });
    // The subflow trial port was never asked, and so never told a verdict; its start hook ran first, then the gate's reset.
    expect(seen).toMatchObject({ scoped: 0, hooks: 1, resets: 1, weighedScoped: 0 });
    expect(seen.tested[0]).toMatchObject({ verdict: "yes", trialRunId: "whole-run-1", feedback: { wholeTest: { revision: 4 } } });
    expect(returned).toMatchObject({ outcome: "done", trials: [{ kind: "subflow_trial", receiptId: "whole-run-1", verdict: "yes" }] });
    // The build's proposals are told the trial, with the verdict the gate kept; the builder is told its test is the judged whole run.
    expect(told).toEqual(["b-read 1 yes"]);
    expect(seen.testTool).toContain("This test is the build's judged run");
  });

  it("answers a repair brief's test through it too", async () => {
    const seen: Seen = { scoped: 0, hooks: 0, resets: 0, weighedScoped: 0, tested: [] };
    const told: string[] = [];
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const fix = gardenBrief("b-fix", "list_seeds", [], (brief) => {
      brief.kind = "repair";
      brief.failingReceipt = { kind: "candidate_trial", receiptId: "whole-run-0", digest: "a".repeat(64) };
    });
    const build = await gardenBuild({ capacity: 1, briefs: [fix], ports: { builder: builder(seen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    build.dispatcherInput.trialled = (scope, proposal, verdict) => told.push(`${scope.briefId} ${proposal.revision} ${verdict}`);
    const returned = await dispatchWith(build, whole("no", asked));
    expect(asked).toHaveLength(1);
    expect(seen.scoped).toBe(0);
    expect(returned).toMatchObject({ outcome: "blocked", trials: [{ receiptId: "whole-run-1", verdict: "no" }] });
    expect(told).toEqual(["b-fix 1 no"]);
  });

  it("answers a whole test that did not run with its refusal in the builder's terms: no verdict, no receipt", async () => {
    const seen: Seen = { scoped: 0, hooks: 0, resets: 0, weighedScoped: 0, tested: [] };
    const told: string[] = [];
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const build = await gardenBuild({ capacity: 1, briefs: [gardenBrief("b-read", "list_seeds")], ports: { builder: builder(seen) } });
    build.dispatcherInput.runBuilder = runAutomationStudioSubflowBuilderLoop;
    build.dispatcherInput.trialled = (scope, proposal, verdict) => told.push(`${scope.briefId} ${proposal.revision} ${verdict}`);
    const returned = await dispatchWith(build, whole("refused", asked));
    expect(seen.tested[0]).toEqual({ ok: false, code: "candidate.trial_reset_required", instruction: "Undo the listed acts, then test again.", actsToUndo: [{ act: "act-1", did: "press \"Plant\"" }] });
    expect(seen.tested[0]).not.toHaveProperty("verdict");
    expect(returned).toMatchObject({ outcome: "blocked", trials: [] });
    expect(seen.scoped).toBe(0);
    // No trial ran, so the build's proposals are told nothing.
    expect(told).toEqual([]);
  });

  it("never asks it for a reset brief", async () => {
    const asked: AutomationStudioSubflowTrialRequest[] = [];
    const reset = (): AutomationStudioProjectResetPorts => ({
      loop: {
        tools: [],
        unusableDecisions: { maxConsecutive: 2, maxInARow: 2, stalled: () => new Error("the reset stalled") },
        executeTool: async () => ({ ok: true }),
        decide: async () => ({ kind: "complete", result: { summary: "done" } })
      },
      remainingActs: async () => []
    });
    const brief = gardenBrief("b-reset", "list_seeds", [], (value) => Object.assign(value, { kind: "reset", parts: [], maxIterations: 3 }));
    const build = await gardenBuild({ capacity: 1, briefs: [brief], ports: { reset } });
    const returned = await dispatchWith(build, whole("yes", asked));
    expect(returned.briefId).toBe("b-reset");
    expect(asked).toHaveLength(0);
  });
});

/** Dispatches the build's recorded briefs with `wholeTrial`, inside the supervisor's scope, and answers the first return. */
async function dispatchWith(build: Awaited<ReturnType<typeof gardenBuild>>, wholeTrial: AutomationStudioProjectDispatchWholeTrial) {
  const dispatch = createAutomationStudioProjectDispatcher(build.dispatcherInput);
  let returns: Awaited<ReturnType<typeof dispatch>>["returns"] | undefined;
  await build.cancellation.run(REF.projectId, REF.flowId, async () => {
    returns = (await dispatch({ briefs: build.briefs, signal: new AbortController().signal, wholeTrial })).returns;
  });
  return returns![0]!;
}
