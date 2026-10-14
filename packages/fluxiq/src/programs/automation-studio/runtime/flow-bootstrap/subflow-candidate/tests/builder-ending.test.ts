// A builder's honest ending (t581). On the A8 bigbox run every dependent
// builder's trial answered that its entry was not prepared, the gate told it
// to "complete with outcome blocked and say why", and its completion took only
// a receipt: it sent the same one four times, was told the draft-mode "run the
// step that is missing" words, and stalled. Here it ends with
// `{"ended": "blocked", "reason": ...}`, the outcome carries that ending and
// the last trial, and a refusal sent again is said in a builder's terms.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, runAutomationStudioSubflowBuilderLoop, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
type Answer = Pick<AutomationStudioSubflowTrialResult, "verdict" | "entryPrepared" | "feedback">;

const MISSING: Answer = { verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_predecessor_missing", missing: ["sign_in"], partial: true, entryPrepared: false } };
const YES: Answer = { verdict: "yes", entryPrepared: true, feedback: {} };

const receiptOf = (evidence: readonly Entry[]) => {
  const value = [...evidence].reverse().find((entry) => entry.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.value as JsonObject;
  return { revision: value.revision as number, digest: value.digest as string };
};
const submit: Step = () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId: "submit", input: script([...OPEN, ...callPart(), ...part()]) });
const test: Step = (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: receiptOf(evidence) });
const receipt: Step = (evidence) => ({ kind: "complete", result: { subflowKey: "find_listing", ...receiptOf(evidence) } });
const end = (result: JsonObject): Step => () => ({ kind: "complete", result });

async function build(steps: Step[], answer: Answer = MISSING, scope = testScope()) {
  const observed: AutomationStudioLlmEvidenceLoopInput[] = [];
  const shown: JsonObject[][] = [];
  let index = 0;
  const outcome = await runAutomationStudioSubflowBuilderLoop({
    scope, siblings: [...SIBLINGS], submission: testSubmission(),
    observe: (loop) => {
      observed.push(loop);
      return loop;
    },
    trial: { port: async (request: AutomationStudioSubflowTrialRequest) => ({ partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, ...structuredClone(answer) }) },
    loop: {
      tools: [look], maxIterations: steps.length + 1, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }),
      decide: async ({ evidence }) => {
        shown.push(evidence.filter((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID).map((entry) => entry.value as JsonObject));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence);
      }
    }
  });
  return { outcome, observed, shown };
}

const WHY = "The subflow before this one never prepared its entry, so its trial cannot pass.";

describe("a subflow builder's honest ending", () => {
  it("ends blocked with its reason once a trial answered, carrying the ending and that last trial", async () => {
    const { outcome } = await build([submit, test, end({ ended: "blocked", reason: WHY })]);
    expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
    expect(outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
    expect(outcome.lastTrial).toMatchObject({ verdict: "execution_failed", entryPrepared: false, feedback: { code: "subflow.trial_predecessor_missing", missing: ["sign_in"] } });
    expect(outcome.proposal?.revision).toBe(1);
  });

  it("offers the ending in its completion schema and its submit tool", async () => {
    const { observed } = await build([submit, test, end({ ended: "blocked", reason: WHY })]);
    expect(observed[0]!.completionSchema).toMatchObject({ type: "object", properties: { subflowKey: { type: "string", const: "find_listing" }, revision: { type: "integer" }, digest: { type: "string" }, ended: { type: "string", enum: ["blocked", "partial"] }, reason: { type: "string" } }, additionalProperties: false });
    // The receipt or the ending whole (t601): what the check reads, and a passing receipt stands whatever else it carries.
    expect(observed[0]!.completionSchema!.anyOf).toEqual([{ required: ["subflowKey", "revision", "digest"] }, { required: ["ended", "reason"] }]);
    expect(observed[0]!.completionSchema!.description).toContain("A receipt whose trial answered yes is taken as the brief done whatever else it carries.");
    const description = observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.description;
    expect(description).toContain("end the brief instead: complete with {\"ended\": \"blocked\", \"reason\": \"<why, in a sentence>\"}");
  });

  it("refuses an ending before anything was submitted or tried, one written wrong, and one while a yes stands", async () => {
    // A builder with no subflow before it has no prepared entry to find its part done at (t594).
    const early = await build([end({ ended: "blocked", reason: WHY }), submit, test, end({ outcome: "blocked", reason: WHY }), end({ ended: "blocked", reason: WHY })], MISSING, testScope({ predecessors: [] }));
    expect(early.outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
    const said = JSON.stringify(early.shown.flat());
    expect(said).toContain("subflow.ending_too_soon");
    expect(said).toContain("subflow.ending_shape");
    const passed = await build([submit, test, end({ ended: "blocked", reason: WHY }), receipt], YES);
    expect(passed.outcome.loop.ok).toBe(true);
    expect(passed.outcome.ended).toBeUndefined();
    expect(JSON.stringify(passed.shown.flat())).toContain("subflow.ending_after_yes");
    expect(passed.outcome.trial).toMatchObject({ verdict: "yes" });
  });

  it("says a refused completion sent again in a builder's terms, never the draft's, and hides the words it carries them under", async () => {
    const { shown } = await build([submit, test, receipt, receipt, end({ ended: "blocked", reason: WHY })]);
    const last = shown.at(-1)!.at(-1)!;
    expect(last.code).toBe("subflow.trial_execution_failed");
    expect(last.sentAgain).toMatch(/^This completion was refused for these same reasons at decision \d+, and this is attempt 2\. The check reads the trial gate's answer/u);
    expect(last.sentAgain).toContain("end the brief instead");
    expect(last.sentAgain).not.toContain("run the step that is missing");
    for (const feedback of shown.flat()) expect(feedback).not.toHaveProperty("sentAgainInstead");
    // The first refusal carries no sent-again words at all.
    expect(shown.flat()[0]).not.toHaveProperty("sentAgain");
  });

  // A8 launch 7 (t594): every prepared entry of a dependent subflow started with its part already done by the subflow before it,
  // and its builders resubmitted a step that could not be named until the repeat guard ended each brief.
  it("tells a dependent builder that a part already done at its entry was a subflow before it, and takes its blocked ending before anything was tried", async () => {
    const DONE = "The page already shows the renewal done where this subflow starts; the subflow before it did that part.";
    const dependent = await build([end({ ended: "blocked", reason: DONE })]);
    expect(dependent.outcome.loop.ok, JSON.stringify(dependent.outcome.loop)).toBe(true);
    expect(dependent.outcome.ended).toEqual({ outcome: "blocked", reason: DONE });
    expect(JSON.stringify(dependent.shown.flat())).not.toContain("subflow.ending_too_soon");
    const flow = (dependent.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.inputSchema as { properties: { flow: { description: string } } }).properties.flow.description;
    expect(flow).toContain("The subflow \"sign_in\" runs before it and leaves the page where it starts.");
    expect(flow).toContain("a subflow before it did that part: write no step for it");
    expect(flow).toContain("complete with {\"ended\": \"blocked\", \"reason\": \"<which part is already done, and which subflow did it>\"}");
    // A partial ending still needs something tried, and a builder with no predecessor is told nothing of it.
    const partial = await build([end({ ended: "partial", reason: DONE }), end({ ended: "blocked", reason: DONE })]);
    expect(JSON.stringify(partial.shown.flat())).toContain("subflow.ending_too_soon");
    const first = await build([submit, test, end({ ended: "blocked", reason: WHY })], MISSING, testScope({ predecessors: [] }));
    const firstFlow = (first.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.inputSchema as { properties: { flow: { description: string } } }).properties.flow.description;
    expect(firstFlow).not.toContain("runs before it");
  });

  it("maps a partial ending through, and keeps no ending when the loop did not complete with one", async () => {
    const partial = await build([submit, test, end({ ended: "partial", reason: WHY })]);
    expect(partial.outcome.ended).toEqual({ outcome: "partial", reason: WHY });
    const plain = await build([submit, test, test]);
    expect(plain.outcome.ended).toBeUndefined();
    expect(plain.outcome.lastTrial).toMatchObject({ verdict: "execution_failed" });
  });
  // A8 launch 8 (t601): a builder whose trial answered yes completed four times with its receipt plus `ended: "partial"`,
  // was refused `subflow.ending_shape` each time with only the ending's shape named, and the brief came back partial.
  describe("a receipt sent beside an ending", () => {
    const mixed = (extra: JsonObject): Step => (evidence) => ({ kind: "complete", result: { subflowKey: "find_listing", ...receiptOf(evidence), ...extra } });

    it("is the brief done when a yes stands for the proposal it names, its ending set aside", async () => {
      const { outcome, shown } = await build([submit, test, mixed({ ended: "partial", reason: "It is a partial trial." })], YES);
      expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
      expect(outcome.ended).toBeUndefined();
      expect(outcome.trial).toMatchObject({ verdict: "yes", entryPrepared: true });
      expect(JSON.stringify(shown.flat())).not.toContain("subflow.ending_shape");
    });

    it("is the honest ending it carries when no yes stands for the proposal it names", async () => {
      const { outcome } = await build([submit, test, mixed({ ended: "partial", reason: WHY })]);
      expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
      expect(outcome.ended).toEqual({ outcome: "partial", reason: WHY });
    });

    it("is refused naming the one shape to send when it names no latest proposal, or carries a key neither has", async () => {
      const stale: Step = (evidence) => ({ kind: "complete", result: { subflowKey: "find_listing", revision: receiptOf(evidence).revision + 1, digest: receiptOf(evidence).digest, ended: "partial", reason: WHY } });
      const failing = await build([submit, test, stale, end({ ended: "blocked", reason: WHY })]);
      const refused = failing.shown.flat().find((feedback) => feedback.code === "subflow.ending_shape")!;
      expect(refused.instruction).toContain("No trial answered yes for the latest proposal of this subflow, so this completion can only end the brief: send exactly {\"ended\": \"blocked\"");
      expect(failing.outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
      // Where a yes stands, the one shape is that proposal's exact receipt.
      const passing = await build([submit, test, end({ outcome: "done" }), receipt], YES);
      const told = passing.shown.flat().find((feedback) => feedback.code === "subflow.ending_shape")!;
      expect(told.instruction).toMatch(/^Revision 1 of this subflow passed its trial, so the brief is done: complete with exactly \{"subflowKey": "find_listing", "revision": 1, "digest": "[0-9a-f]+"\} and nothing else\.$/u);
      expect(passing.outcome.loop.ok).toBe(true);
    });
  });
});
