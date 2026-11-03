// What the subflow gate's answers tell a builder, done, and then the identical test again, through the real loop and its real
// repeat guard (`../../../../../../llm/repeat-guard/outcomes.ts`). A builder reads each answer where it reads it, in the evidence of
// the next decision. A lending library; the page is reported by a look, as a domain with digests on its calls reports it.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../../../../../llm/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION } from "../../../../candidate/index.ts";
import type { AutomationStudioSiteResetDecision, AutomationStudioSiteResetTrialReset } from "../../../../site-reset/index.ts";
import { automationStudioCandidateTestRequestKey } from "../../../../test-request/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID as TEST, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialPreparingPort, type AutomationStudioSubflowTrialResult } from "../../../index.ts";
import { testScope } from "../../subflow-fixture.ts";

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal: AutomationStudioSubflowProposal = { scope: identity, revision: 2, digest: "d".repeat(64), subflows: [], summary: "Find", changedPaths: [] };
const PAIR: JsonObject = { revision: proposal.revision, digest: proposal.digest };
const END_STATE = { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_starts_in_end_state", failed: "starts_in_end_state", canMeet: "another_page", actsToUndo: [{ act: "act-1", did: "press \"Hold\"" }], instruction: "Undo just that act, then test again." } } as const satisfies AutomationStudioSiteResetDecision;
const NOT_RUN = { code: "candidate.trial_starts_in_end_state", instruction: "Undo just that act, then test the same revision and digest again.", detail: { actsToUndo: [{ act: "act-1", did: "press \"Hold\"" }] }, retry: true };
type Entry = { toolId: string; value: unknown };
type Options = { answers?: ReadonlyArray<Partial<AutomationStudioSubflowTrialResult>>; refusals?: number; refusedBy?: "admit" | "beforeTrial" | "notRun" };

/** Runs the scripted decisions over the real gate and loop: a look reports one unchanging page; the reset refuses first, or the port did not run the trial. */
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
  const port: AutomationStudioSubflowTrialPreparingPort = async (request) => {
    const base: AutomationStudioSubflowTrialResult = { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: { said: "judged" }, entryPrepared: true };
    if (options.refusedBy === "notRun" && refusals-- > 0) return { ...base, verdict: "not_judged", entryPrepared: false, notRun: NOT_RUN } as AutomationStudioSubflowTrialResult;
    return { ...base, ...options.answers?.[trials], trialRunId: `run-${++trials}` };
  };
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => structuredClone(proposal), reset, port });
  const shown = new Map<string, Entry>();
  let at = 0;
  await runAutomationStudioLlmEvidenceLoop({
    tools: [
      { toolId: "library.look", description: "Read the page.", effect: "observe", inputSchema: { type: "object" } },
      { toolId: "library.press", description: "Press a control.", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } },
      gate.tool
    ],
    maxIterations: script.length + 1, maxToolCalls: script.length + 1, dryRun: false, draft: false,
    requestContextKey: (toolId) => (toolId === TEST ? automationStudioCandidateTestRequestKey(proposal) : undefined),
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

const judged = (verdict: AutomationStudioSubflowTrialResult["verdict"], extra: Partial<AutomationStudioSubflowTrialResult> = {}): Partial<AutomationStudioSubflowTrialResult> => ({ verdict, ...extra });
const ENTRY_UNPREPARED = judged("execution_failed", { entryPrepared: false, feedback: { code: "subflow.entry_not_prepared" } });
const HELD_YES = judged("not_judged", { feedback: { said: "held", yesUnconfirmed: true } });

describe("the subflow gate's answers, under the real repeat guard", () => {
  it.each(["admit", "beforeTrial", "notRun"] as const)("candidate.trial_starts_in_end_state from %s: refused alone, and tested again once the act was undone on the same page", async (refusedBy) => {
    const alone = await run(["look", "test", "test"], { refusals: 1, refusedBy });
    expect(alone.tests[0]).toMatchObject({ ok: false, code: "candidate.trial_starts_in_end_state" });
    expect(alone.repeats).toHaveLength(1);
    expect(alone.trials()).toBe(0);

    const done = await run(["look", "test", "undo", "test"], { refusals: 1, refusedBy });
    expect(done.repeats).toEqual([]);
    expect(done.trials()).toBe(1);
    expect(done.tests.at(-1)).toMatchObject({ verdict: "yes" });
  });

  it.each([["execution_failed", {}], ["not_judged", {}], ["unsure", {}], ["no", { entryPrepared: false }]] as const)("a %s with retests left is tested again on the same page, up to the gate's bound", async (verdict, extra) => {
    const answer = judged(verdict, extra);
    const allowed = await run(["look", "test", "test", "test"], { answers: [answer, answer, answer] });
    expect(allowed.repeats).toEqual([]);
    expect(allowed.trials()).toBe(AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION);
  });

  describe("past the bound, no answer tells the builder to test again", () => {
    const third = async (answer: Partial<AutomationStudioSubflowTrialResult>) => (await run(["look", "test", "test", "test"], { answers: [answer, answer, answer] })).tests.at(-1)!;

    it("a not_judged", async () => {
      const last = await third(judged("not_judged"));
      expect(last).toMatchObject({ retestsLeft: 0 });
      expect(String(last.instruction)).not.toMatch(/test it again/iu);
      expect(String(last.instruction)).toMatch(/no retests left/iu);
    });

    it("a yes the judges gave and Core could not confirm", async () => {
      const last = await third(HELD_YES);
      expect(last).toMatchObject({ retestsLeft: 0 });
      expect(String(last.instruction)).not.toMatch(/test this same revision again/iu);
      expect(String(last.instruction)).toMatch(/"ended": "partial"/u);
      // Still not told to rewrite a subflow whose rows the judges accepted.
      expect(String(last.instruction)).toMatch(/do not rewrite it/u);
    });

    it("a trial whose entry was not prepared", async () => {
      const last = await third(ENTRY_UNPREPARED);
      expect(last).toMatchObject({ retestsLeft: 0 });
      expect(String(last.instruction)).not.toMatch(/test this revision again/iu);
      expect(String(last.instruction)).toMatch(/outcome blocked/u);
    });
  });

  it("with a retest left, each of them still says to test again", async () => {
    for (const [answer, words] of [[judged("not_judged"), /test it again/iu], [HELD_YES, /test this same revision again/iu], [ENTRY_UNPREPARED, /test this revision again/iu]] as const) {
      const one = await run(["look", "test"], { answers: [answer] });
      expect(one.tests[0]).toMatchObject({ retestsLeft: 2 });
      expect(String(one.tests[0]!.instruction)).toMatch(words);
    }
  });
});
