// What the whole gate's answers tell the model, done, and then the identical test again, through the real loop and its real
// repeat guard (`../../../../../llm/repeat-guard/outcomes.ts`). The model reads each answer where it reads it, in the evidence
// of the next decision. A lending library; the page is reported by a look, as a domain with digests on its calls reports it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../../../llm/index.ts";
import type { AutomationStudioSiteResetDecision, AutomationStudioSiteResetTrialReset } from "../../../site-reset/index.ts";
import { automationStudioCandidateTestRequestKey } from "../../../test-request/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION, AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID as TEST, AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../../index.ts";

const LATEST = { revision: 1, digest: "d".repeat(64) } as AutomationStudioFlowCandidate;
const PAIR: JsonObject = { revision: LATEST.revision, digest: LATEST.digest };
const END_STATE = { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_starts_in_end_state", failed: "starts_in_end_state", canMeet: "another_page", actsToUndo: [{ act: "act-1", did: "press \"Hold\"" }], instruction: "Undo just that act, then test again." } } as const satisfies AutomationStudioSiteResetDecision;
type Entry = { toolId: string; value: unknown };
type Options = { verdicts?: ReadonlyArray<AutomationStudioCandidateTrialResult["verdict"]>; refusals?: number; refusedBy?: "admit" | "beforeTrial" };

/** Runs the scripted decisions over the real gate and loop: a look reports one unchanging page, and the first `refusals` tests are refused by the reset. */
async function run(script: Array<"look" | "test" | "undo">, options: Options = {}) {
  let trials = 0;
  let refusals = options.refusals ?? 0;
  let calls = 0;
  const refuse = () => (refusals-- > 0 ? END_STATE : undefined);
  const reset: AutomationStudioSiteResetTrialReset = {
    beforeTrial: async () => (options.refusedBy === "beforeTrial" ? refuse() : undefined) ?? { kind: "admit" },
    trialRan: () => [],
    ...(options.refusedBy === "admit" ? { admit: () => refuse() ?? { kind: "admit" as const } } : {})
  };
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => LATEST, reset,
    trial: { candidateId: "candidate.1", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: options.verdicts?.[trials] ?? "yes", feedback: { said: "judged" }, trialRunId: `run-${++trials}` }) }
  });
  const shown = new Map<string, Entry>();
  let at = 0;
  await runAutomationStudioLlmEvidenceLoop({
    tools: [
      { toolId: "library.look", description: "Read the page.", effect: "observe", inputSchema: { type: "object" } },
      { toolId: "library.press", description: "Press a control.", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } },
      { toolId: TEST, description: "Test the candidate.", effect: "mutate", inputSchema: { type: "object" } }
    ],
    maxIterations: script.length + 1, maxToolCalls: script.length + 1, dryRun: false, draft: false,
    requestContextKey: (toolId) => (toolId === TEST ? automationStudioCandidateTestRequestKey(LATEST) : undefined),
    unusableDecisions: { maxConsecutive: script.length + 1, maxInARow: script.length + 1, stalled: () => new Error("stalled") },
    executeTool: async ({ toolId, value }) => (toolId === TEST ? gate.test(value) : { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: toolId === "library.press", targetsUnchanged: true, stateDigests: { before: "page.one", after: "page.one" }, draft: { actionId: toolId, effect: toolId === "library.press" ? "mutate" : "observe", proposes: false } }),
    decide: async ({ evidence }) => {
      for (const entry of evidence) shown.set(`${entry.callId}:${JSON.stringify(entry.value)}`, { toolId: entry.toolId, value: entry.value });
      const step = script[at++];
      if (!step) return { kind: "complete", result: { ended: "script done" } };
      calls += 1;
      return step === "test"
        ? { kind: "tool_call", toolId: TEST, callId: `test.${calls}`, input: PAIR }
        : { kind: "tool_call", toolId: step === "look" ? "library.look" : "library.press", callId: `${step}.${calls}`, input: { n: calls } };
    }
  });
  const of = (toolId: string) => [...shown.values()].filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
  return { trials: () => trials, tests: of(TEST), repeats: of("core.repeat_check") };
}

describe("the whole gate's answers, under the real repeat guard", () => {
  it.each(["admit", "beforeTrial"] as const)("candidate.trial_starts_in_end_state from %s: refused alone, and tested again once the act was undone on the same page", async (refusedBy) => {
    const alone = await run(["look", "test", "test"], { refusals: 1, refusedBy });
    expect(alone.tests[0]).toMatchObject({ ok: false, code: "candidate.trial_starts_in_end_state" });
    expect(alone.repeats).toHaveLength(1);
    expect(alone.trials()).toBe(0);

    const done = await run(["look", "test", "undo", "test"], { refusals: 1, refusedBy });
    expect(done.repeats).toEqual([]);
    expect(done.trials()).toBe(1);
    expect(done.tests.at(-1)).toMatchObject({ verdict: "yes" });
  });

  it.each(["execution_failed", "not_judged", "unsure"] as const)("a %s with retests left is tested again on the same page, up to the gate's bound", async (verdict) => {
    const allowed = await run(["look", "test", "test", "test"], { verdicts: [verdict, verdict, verdict] });
    expect(allowed.repeats).toEqual([]);
    expect(allowed.trials()).toBe(AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION);
  });

  it("past the bound, a not_judged does not tell the model to test again", async () => {
    const spent = await run(["look", "test", "test", "test"], { verdicts: ["not_judged", "not_judged", "not_judged"] });
    const last = spent.tests.at(-1)!;
    expect(last).toMatchObject({ verdict: "not_judged", retestsLeft: 0 });
    expect(String(last.instruction)).not.toMatch(/test this revision again/iu);
    expect(String(last.instruction)).toMatch(/no retests left/iu);
  });

  it("with a retest left, a not_judged still says to test again", async () => {
    const one = await run(["look", "test"], { verdicts: ["not_judged"] });
    expect(one.tests[0]).toMatchObject({ verdict: "not_judged", retestsLeft: 2 });
    expect(String(one.tests[0]!.instruction)).toMatch(/test this revision again/iu);
  });
});
