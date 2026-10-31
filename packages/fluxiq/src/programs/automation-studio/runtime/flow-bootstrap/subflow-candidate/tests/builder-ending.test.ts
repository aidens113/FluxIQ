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

async function build(steps: Step[], answer: Answer = MISSING, scope = testScope(), opening: JsonObject = { ok: true }) {
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
      // The opening look carries what Core's entry note says, as the brief's port adds it (t676); every other call answers ok.
      executeTool: async (call) => ({ kind: "llm_evidence_tool_execution", evidence: call.callId.startsWith("initial.") ? opening : { ok: true }, effectApplied: false, targetsUnchanged: true }),
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
/** A dependent scope whose one part asks a lasting act (t676). */
const ACTING = testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Reserve a seat for the evening talk", lastingActs: ["create_new"] }] });
/** The opening look of a prepared entry, as the brief's port adds Core's note beside it: what the preparation run landed, a possible act among them. */
const ENTRY: JsonObject = { ok: true, entry: { prepared: true, note: "Core ran the subflows before yours.", predecessorsLeftOnSite: [{ act: "act-2", did: "create_new" }, { act: "act-3", did: "pressed a control", possibly: true }] } };

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
    // Since t811 the ending after a yes is never asked: Core completes with the receipt the moment the yes stands
    // (`./submit-then/tests/builder-loop-auto-complete.test.ts` covers `subflow.ending_after_yes` where a repair holds Core back).
    const passed = await build([submit, test, end({ ended: "blocked", reason: WHY }), receipt], YES);
    expect(passed.outcome.loop.ok).toBe(true);
    expect(passed.outcome.ended).toBeUndefined();
    expect(passed.shown).toHaveLength(2);
    expect(JSON.stringify(passed.shown.flat())).not.toContain("subflow.ending_after_yes");
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
  // and its builders resubmitted a step that could not be named until the repeat guard ended each brief. Since t676 the ending names
  // the part and the act, and Core checks both.
  // t676: before it, any dependent builder's blocked ending before a try was taken. An entry that was never prepared, or a
  // page that cannot do its parts, now reaches its honest ending through one trial, which says why.
  it("ends a dependent brief whose entry was never prepared blocked after one trial says so, never before", async () => {
    const reading = testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Read the listings on the listings page", lastingActs: [] }] });
    const { outcome, shown } = await build([end({ ended: "blocked", reason: WHY }), submit, test, end({ ended: "blocked", reason: WHY })], MISSING, reading, { ok: true, entry: { prepared: false, code: "subflow.trial_predecessor_missing" } });
    const early = shown.flat().find((feedback) => feedback.code === "subflow.ending_too_soon")!;
    expect(early.instruction).not.toContain("doneBefore");
    expect(early.instruction).toContain("its trial says why it cannot pass, and the brief can then end blocked saying so");
    expect(outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
    expect(outcome.lastTrial).toMatchObject({ entryPrepared: false, feedback: { code: "subflow.trial_predecessor_missing" } });
  });

  it("tells a dependent builder that a part already done at its entry was a subflow before it, and takes its blocked ending before anything was tried", async () => {
    const DONE = "The page already shows the renewal done where this subflow starts; the subflow before it did that part.";
    const dependent = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-2" } })], MISSING, ACTING, ENTRY);
    expect(dependent.outcome.loop.ok, JSON.stringify(dependent.outcome.loop)).toBe(true);
    expect(dependent.outcome.ended).toEqual({ outcome: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-2" } });
    expect(JSON.stringify(dependent.shown.flat())).not.toContain("subflow.ending_too_soon");
    const flow = (dependent.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.inputSchema as { properties: { flow: { description: string } } }).properties.flow.description;
    expect(flow).toContain("The subflow \"sign_in\" runs before it and leaves the page where it starts.");
    expect(flow).toContain("a subflow before it did that part: write no step for it");
    expect(flow).toContain("complete with {\"ended\": \"blocked\", \"reason\": \"<which part is already done, and which subflow did it>\", \"doneBefore\": {\"part\": \"<that part's id>\"");
    expect(dependent.observed[0]!.completionSchema).toMatchObject({ properties: { doneBefore: { type: "object", required: ["part"], additionalProperties: false } } });
    // A partial ending still needs something tried, and a builder with no predecessor is told nothing of it.
    const partial = await build([end({ ended: "partial", reason: DONE }), end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } })], MISSING, ACTING, ENTRY);
    expect(JSON.stringify(partial.shown.flat())).toContain("subflow.ending_too_soon");
    expect(partial.outcome.ended).toEqual({ outcome: "blocked", reason: DONE, doneBefore: { part: "p1" } });
    const first = await build([submit, test, end({ ended: "blocked", reason: WHY })], MISSING, testScope({ predecessors: [] }));
    const firstFlow = (first.observed[0]!.tools.find((tool) => tool.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID)!.inputSchema as { properties: { flow: { description: string } } }).properties.flow.description;
    expect(firstFlow).not.toContain("runs before it");
  });

  // A8 frozen pair 8 (t676): a later builder ended blocked as "already done" before it submitted anything and Core took its word --
  // once for a part that only reads, which no subflow before it can do, costing a merge and a rebuild.
  describe("a claim that a subflow before it did its part", () => {
    const DONE = "The subflow before this one already did this part.";
    const refusals = (shown: JsonObject[][]) => shown.flat().filter((feedback) => feedback.code === "subflow.done_before_refused");

    it("is refused for a part that asks no lasting act: its result comes only from this subflow's own steps", async () => {
      const reading = testScope({ parts: [{ partId: "p1", sourceId: "instruction.1", text: "Read the listings on the listings page", lastingActs: [] }] });
      const { outcome, shown } = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } }), submit, test, end({ ended: "blocked", reason: WHY })], MISSING, reading, ENTRY);
      expect(refusals(shown)[0]!.instruction).toBe("This brief's part asks for no lasting act, so no subflow before this one can have done it: its result comes only from this subflow's own steps; build it from this page.");
      // Once something was tried, its own honest ending is taken as before.
      expect(outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
    });

    it("is refused when it names no part, or a part that is not this brief's", async () => {
      const { outcome, shown } = await build([end({ ended: "blocked", reason: DONE }), end({ ended: "blocked", reason: DONE, doneBefore: { part: "p9" } }), end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } })], MISSING, ACTING, ENTRY);
      // Naming no part is too soon: any other reason to end is one a trial says first.
      const unnamed = shown.flat().find((feedback) => feedback.code === "subflow.ending_too_soon")!;
      expect(unnamed.instruction).toContain("If a subflow before it already did one of its parts, end it now with exactly {\"ended\": \"blocked\"");
      expect(unnamed.instruction).toContain("For any other reason -- its entry not prepared, or the site unable to do what its parts ask -- submit the subflow");
      const [unknown] = refusals(shown);
      expect(unknown!.instruction).toBe("\"p9\" is no part of this brief, whose parts are \"p1\": name one of them, by its id, under doneBefore.part.");
      expect(outcome.ended).toEqual({ outcome: "blocked", reason: DONE, doneBefore: { part: "p1" } });
    });

    it("is refused when its act is not one the run that prepared the entry landed: that act is this build's from exploration", async () => {
      const { outcome, shown } = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-9" } }), end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-2" } })], MISSING, ACTING, ENTRY);
      expect(refusals(shown)[0]!.instruction).toBe("\"act-9\" is not an act the run that prepared this subflow's entry landed (the acts it landed are \"act-2\", \"act-3\", as the entry note lists them under predecessorsLeftOnSite): it is this build's act from exploration, which every trial's reset undoes; build the step that does it.");
      expect(outcome.ended).toEqual({ outcome: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-2" } });
      // With no entry note, no act is the preparation run's.
      const bare = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-2" } }), end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } })], MISSING, ACTING);
      expect(refusals(bare.shown)[0]!.instruction).toContain("(it landed none, as the entry note lists them under predecessorsLeftOnSite)");
    });

    it("is admitted when the part asks a lasting act and the act is the preparation run's, a possible one included", async () => {
      const { outcome, shown } = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "Reserve a seat for the evening talk", act: "act-3" } })], MISSING, ACTING, ENTRY);
      expect(outcome.loop.ok, JSON.stringify(outcome.loop)).toBe(true);
      // The part is kept by its id, whichever way the builder named it.
      expect(outcome.ended).toEqual({ outcome: "blocked", reason: DONE, doneBefore: { part: "p1", act: "act-3" } });
      expect(refusals(shown)).toEqual([]);
    });

    it("is refused for a builder with no subflow before it, and as partial", async () => {
      const early = await build([end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } }), submit, test, end({ ended: "blocked", reason: DONE, doneBefore: { part: "p1" } }), end({ ended: "blocked", reason: WHY })], MISSING, testScope({ ...ACTING, predecessors: [] }));
      const said = early.shown.flat();
      expect(said[0]!.code).toBe("subflow.ending_too_soon");
      expect(refusals(early.shown)[0]!.instruction).toContain("No subflow runs before this one, so none can have done one of its parts");
      expect(early.outcome.ended).toEqual({ outcome: "blocked", reason: WHY });
      const partial = await build([submit, test, end({ ended: "partial", reason: DONE, doneBefore: { part: "p1" } }), end({ ended: "partial", reason: WHY })], MISSING, ACTING, ENTRY);
      expect(refusals(partial.shown)[0]!.instruction).toContain("ends the brief blocked, never partial");
      expect(partial.outcome.ended).toEqual({ outcome: "partial", reason: WHY });
    });
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
      // Where a yes stands, Core completes with that proposal's exact receipt before any other completion is asked (t811);
      // the refusal naming that receipt is covered where a repair holds Core back (`./submit-then/tests/builder-loop-auto-complete.test.ts`).
      const passing = await build([submit, test, end({ outcome: "done" }), receipt], YES);
      expect(passing.shown).toHaveLength(2);
      expect(JSON.stringify(passing.shown.flat())).not.toContain("subflow.ending_shape");
      expect(passing.outcome.loop.ok).toBe(true);
    });
  });
});
