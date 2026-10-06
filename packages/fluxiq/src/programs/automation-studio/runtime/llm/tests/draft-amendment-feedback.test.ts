// An amendment the draft refused reaches the model, and the row records it.
//
// `run-muhubegx-9469de5e` made nine amend_draft decisions, seven of which
// changed nothing and five of those in a row. The draft computed a precise
// reason for every one of them; the loop read only how many had landed, so the
// model was asked again with nothing to correct and the record kept one word
// for all seven. These pin both halves: what the model is told, and what the
// row carries.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID,
  automationStudioLlmEvidenceDraftAmendmentFeedback,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceLoopTrace
} from "../index.ts";

const press = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const tools = [press];
const stalled = () => new Error("stalled");
// Each press is one the Flow needs, so it is added to the Flow as it runs.
const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` }, add: true });
const complete = { kind: "complete", result: { flow: "..." } };

/** A tool that always works, with an evidence value of the size asked for. */
const pressing = (bytes = 0) => async () => ({
  kind: "llm_evidence_tool_execution" as const,
  evidence: { page: "after", ...(bytes ? { filler: "z".repeat(bytes) } : {}) },
  effectApplied: true
});

type ShownEntry = { callId: string; toolId: string; value: Record<string, unknown> };

/** What the decision at `index` was shown under the amendment-feedback tool id. */
function feedbackShown(decide: ReturnType<typeof vi.fn>, index: number): Record<string, unknown> | undefined {
  const shown = decide.mock.calls[index]?.[0].evidence as ShownEntry[] | undefined;
  return shown?.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID)?.value;
}

const amendRow = (trace: AutomationStudioLlmEvidenceLoopTrace[]): AutomationStudioLlmEvidenceLoopTrace | undefined =>
  trace.find((entry) => entry.decision === "amend_draft");

describe("an amendment the draft refused", () => {
  it("does not prescribe a row loop for a singular quantity claim already named", () => {
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 8, reason: "act_already_named", act: "a2.quantity" }], applied: 0,
      steps: [{ position: 8, effect: "mutate", disposition: "kept" }],
      stepsWithoutProgress: 1, maxStepsWithoutProgress: 4, actsNotDone: ["a2.quantity", "a2", "a3"]
    });
    const reason = (feedback.reasons as Record<string, string>).act_already_named!;
    expect(reason).not.toContain("repeat the press over its listing");
    expect(reason).toContain("todo");
  });

  it("names an explicit repair for an already-claimed quantity that carries a mistaken repeat", () => {
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 8, reason: "act_already_named", act: "a2.quantity" }], applied: 0,
      steps: [{ position: 8, effect: "mutate", disposition: "kept", routing: { kind: "repeat" } }],
      stepsWithoutProgress: 2, maxStepsWithoutProgress: 4, actsNotDone: ["a2.quantity", "a2", "a3"]
    });
    expect((feedback.refused as { next: string }[])[0]!.next).toContain('{"step": 8, "change": "unrepeat"}');
    expect((feedback.refused as { next: string }[])[0]!.next).toContain("quantity_is_a_repeat");
  });


  it("is told to the model, by step and reason, before it is asked again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({
      ok: false,
      code: "llm_evidence_loop.draft_amendments_refused",
      refused: [{ step: 9, reason: "no_such_step" }],
      applied: 0,
      steps: 1,
      // The draft has one step, so 9 was never a number it could have named.
      positions: [1]
    });
    expect((feedback?.reasons as Record<string, string>).no_such_step).toContain("no step at that number");
    expect(feedback?.stepsWithoutProgress).toBe(1);
  });

  it("is recorded on the amend row beside the count that landed", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      // One amendment lands and one is refused, which the single result code
      // cannot say and the row now does.
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }, { step: 4, change: "drop" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_amended",
      amended: 1,
      amendmentsRefused: [{ step: 4, reason: "no_such_step" }]
    });
    // Half an edit landing is still an edit the model must be told about.
    expect(feedbackShown(decide, 2)).toMatchObject({ applied: 1, refused: [{ step: 4, reason: "no_such_step" }] });
  });

  it("names the reason the draft computed, not a guess at the step meant", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      // The step is already in the Flow: it was added as it ran.
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_unchanged",
      amended: 0,
      amendmentsRefused: [{ step: 1, reason: "already_in_flow" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "already_in_flow" }] });
    // Nothing was named that does not exist, so no positions are listed.
    expect(feedback?.positions).toBeUndefined();
  });

  it("leaves an edit that landed cleanly with nothing to explain", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "exploratory" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)?.amendmentsRefused).toBeUndefined();
    expect(feedbackShown(decide, 2)).toBeUndefined();
  });

  // No byte limit ends a loop any more: after a large result the refusal is
  // still shown to the model, and the loop asks again.
  it("is shown however large the evidence before it, and the loop goes on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] })
      .mockResolvedValue(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8,
      unusableDecisions: { stalled }, executeTool: pressing(2_000_000)
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({ amended: 0, amendmentsRefused: [{ step: 9, reason: "no_such_step" }] });
    const shown = decide.mock.calls[2]![0].evidence as { toolId: string }[];
    expect(shown.some((entry) => entry.toolId === "core.amendment_check")).toBe(true);
  });
});

// `rerun` is the one amendment the draft does not carry out, so the loop filters
// it out of the apply call and resolves it itself
// (`../evidence-loop/rerun-request.ts`). That left one amendment able to change
// nothing in silence after every other kind had stopped: the row read
// `draft_unchanged`, no refusal existed to record, and `run_by_the_loop` -- a
// reason the draft computes -- could not occur on the loop path at all.
describe("a rerun the loop cannot carry out", () => {
  it("reaches the model as a refusal naming a step that is not there, and is recorded on the row", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 6, change: "rerun", input: { target: "target.6" } }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      resultCode: "llm_evidence_loop.draft_unchanged",
      amended: 0,
      amendmentsRefused: [{ step: 6, reason: "no_such_step" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 6, reason: "no_such_step" }], applied: 0, positions: [1] });
    // The guard's arithmetic is untouched: an amend decision that changed
    // nothing counts once, and the count the model is shown is that one.
    expect(feedback?.stepsWithoutProgress).toBe(1);
  });

  it("is the second rerun of one decision, told as run_by_the_loop while the first one runs", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({
        kind: "amend_draft",
        amendments: [
          { step: 1, change: "rerun", input: { target: "target.1b" } },
          { step: 1, change: "rerun", input: { target: "target.1c" } }
        ]
      })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: pressing()
    });
    expect(result.ok).toBe(true);
    expect(amendRow(result.trace)).toMatchObject({
      // The rerun was carried out, and the one that could not be is still said.
      resultCode: "llm_evidence_loop.draft_rerun",
      amendmentsRefused: [{ step: 1, reason: "run_by_the_loop" }]
    });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "run_by_the_loop" }] });
    expect((feedback?.reasons as Record<string, string>).run_by_the_loop).toContain("rerun");
    // A rerun that ran is progress on the evidence, so nothing was counted
    // against the no-progress guard for the refusal beside it.
    expect(result.trace.filter((entry) => entry.decision === "tool_call")).toHaveLength(2);
  });
});

describe("the feedback an amendment refusal is shown as", () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];
  const built = (refusals: readonly AutomationStudioFlowDraftAmendmentRefusal[], applied = 0) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });

  // Exhaustive by type: a reason added to the draft's closed set fails to
  // compile here until this test names it, and in the module until it is
  // explained there.
  const everyReason: Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], true> = {
    no_such_step: true, already_so: true, no_such_position: true, run_by_the_loop: true, no_step_before_it: true, over_not_before: true, not_a_kept_step: true,
    did_not_work: true, already_in_flow: true, already_out: true, changes_nothing: true, act_on_a_read: true, act_already_named: true,
    bind_not_a_binding: true, bind_new_key: true, bind_row_outside_loop: true, bind_malformed: true,
    rerun_holds_binding: true, repeat_taken_off: true
  };

  it("can say every reason the draft computes, with what the word means", () => {
    for (const reason of Object.keys(everyReason) as AutomationStudioFlowDraftAmendmentRefusal["reason"][]) {
      const feedback = built([{ step: 2, reason }]);
      expect(feedback.refused).toEqual([{ step: 2, reason }]);
      const explanation = (feedback.reasons as Record<string, string>)[reason];
      expect(typeof explanation).toBe("string");
      expect(explanation!.length).toBeGreaterThan(20);
    }
  });

  // t252: a refused bind names the parameter it was refused at, and each reason
  // says what a bind is for and how to write it.
  it("names the parameter a refused bind was about, and says how to write a binding", () => {
    const feedback = built([{ step: 2, reason: "bind_new_key", parameter: "options.sort" }, { step: 3, reason: "bind_row_outside_loop", parameter: "note" }]);
    expect(feedback.refused).toEqual([{ step: 2, reason: "bind_new_key", parameter: "options.sort" }, { step: 3, reason: "bind_row_outside_loop", parameter: "note" }]);
    const reasons = feedback.reasons as Record<string, string>;
    expect(reasons.bind_new_key).toMatch(/already has/u);
    expect(reasons.bind_row_outside_loop).toMatch(/repeat/u);
    const malformed = built([{ step: 2, reason: "bind_malformed" }]).reasons as Record<string, string>;
    expect(malformed.bind_malformed).toContain("$input");
    expect(malformed.bind_malformed).toContain("$step");
    const notOne = built([{ step: 2, reason: "bind_not_a_binding" }]).reasons as Record<string, string>;
    expect(notOne.bind_not_a_binding).toMatch(/rerun/u);
  });

  // t252: a recorded step that holds a binding cannot be run live.
  it("says a bound step runs only in the Flow, and how to rerun or write it", () => {
    const reasons = built([{ step: 2, reason: "rerun_holds_binding" }]).reasons as Record<string, string>;
    expect(reasons.rerun_holds_binding).toContain("Replace every binding with a concrete value");
    expect(reasons.rerun_holds_binding).toContain("new tool_call");
  });

  it("explains each distinct reason once, however many amendments met it", () => {
    const feedback = built([
      { step: 7, reason: "no_such_step" },
      { step: 8, reason: "no_such_step" },
      { step: 2, reason: "already_so" }
    ]);
    expect(Object.keys(feedback.reasons as Record<string, string>)).toEqual(["no_such_step", "already_so"]);
    expect(feedback.refused).toHaveLength(3);
  });

  // run-muqiojz4-04a7a8fc: `10 keep act a2.quantity` five times running, the
  // checklist showing a2.quantity done and a3 still to do.
  it("tells an act named again that the checklist shows done that nothing is left for it, and what still is", () => {
    const told = (actsNotDone: readonly string[] | undefined) => automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 2, reason: "act_already_named", act: "a2.quantity" }], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, actsNotDone
    });
    expect(told(["a3", "a3.size"]).refused).toEqual([{ step: 2, reason: "act_already_named", next: "The acts checklist shows a2.quantity done, so nothing is left to do for it: do not name it again. Still not done on the checklist: a3, a3.size. Go on with those." }]);
    expect(told([]).refused).toEqual([{ step: 2, reason: "act_already_named", next: "The acts checklist shows a2.quantity done, so nothing is left to do for it: do not name it again. Nothing on the checklist is still to do: complete when the Flow does what the person asked." }]);
    // Still to do: the todo is the fault, as before, and nothing more is said.
    expect(told(["a2.quantity", "a3"]).refused).toEqual([{ step: 2, reason: "act_already_named" }]);
    // No checklist read: nothing is claimed about it.
    expect(told(undefined).refused).toEqual([{ step: 2, reason: "act_already_named" }]);
    // The reason itself now says what a done act needs.
    expect((told(undefined).reasons as Record<string, string>).act_already_named).toContain("If the acts checklist shows the act done, nothing is left to do for it");
  });

  it("lists the positions that do exist only when one that does not was named", () => {
    expect(built([{ step: 9, reason: "no_such_step" }]).positions).toEqual([1, 2, 3]);
    expect(built([{ step: 2, reason: "already_so" }]).positions).toBeUndefined();
  });

  // Positions are read off the draft rather than assumed from its length, and
  // the newest are the ones an edit is usually about.
  // Every position since 2026-09-30: it kept the newest 32.
  it("reads every position off the draft, however long", () => {
    const long = Array.from({ length: 40 }, (_unused, index) => ({ position: index + 1 }));
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 99, reason: "no_such_step" }], applied: 0, steps: long, stepsWithoutProgress: 2, maxStepsWithoutProgress: 8
    });
    expect(feedback.steps).toBe(40);
    expect(feedback.positions).toEqual(long.map((step) => step.position));
  });

  it("carries codes, Core's own sentences and integers, and stays well under two kilobytes", () => {
    const feedback = built(Array.from({ length: 16 }, (_unused, index) => ({ step: index + 40, reason: "no_such_step" as const })));
    expect(feedback.refused).toHaveLength(16);
    expect(Buffer.byteLength(JSON.stringify(feedback), "utf8")).toBeLessThan(2_048);
  });

  // Every refusal since 2026-09-30: it listed at most 16.
  it("lists every refusal it is given", () => {
    const feedback = built(Array.from({ length: 20 }, (_unused, index) => ({ step: index + 40, reason: "no_such_step" as const })));
    expect(feedback.refused).toHaveLength(20);
  });
});

// Live run 37 (`run-muq5v4zg-39182b58`): the filtered request listing was step
// 13 and nothing after it pressed a Confirm. `13 repeat over 13` was told the
// rule in general, and three unchanged reruns of step 13 were told "go on with
// the result you have"; the round stopped with no press tried. A refusal about
// a listing now says what comes next, in the draft's own numbers.
describe("a refusal about a listing says what comes next", () => {
  // Run 37's draft as it stood at #13: a look, the way to the page (one
  // navigation refused), a look, the See-all press, three trial listings, and
  // the filtered listing at 13, which is in the Flow.
  const look = (position: number) => ({ position, effect: "observe", effectApplied: false, disposition: "taken" });
  const act = (position: number, disposition = "kept", effectApplied = true) => ({ position, effect: "mutate", effectApplied, disposition });
  const read = (position: number, disposition = "taken") => ({ position, effect: "observe", effectApplied: true, disposition });
  const run37 = [look(1), act(2), act(3), act(4, "kept", false), act(5), act(6), look(7), act(8, "taken"), look(9), read(10), read(11), read(12), read(13, "kept")];
  const told = (refusals: readonly (AutomationStudioFlowDraftAmendmentRefusal & { repeated?: boolean })[], steps: Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0]["steps"] = run37) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });
  const nextOf = (feedback: Record<string, unknown>): string | undefined => (feedback.refused as { next?: string }[])[0]?.next;

  it("a repeat put on the listing over itself, with no press after it: do the act on one kept row first, then the repeat to send", () => {
    const feedback = told([{ step: 13, reason: "over_not_before", over: 13 }]);
    const next = nextOf(feedback);
    expect(next).toContain("Step 13 is the listing, so the repeat cannot go on it.");
    expect(next).toContain("No step after step 13 does anything to a row yet");
    expect(next).toContain("one row step 13 kept");
    expect(next).toContain("press that row's own control");
    expect(next).toContain(`{"step": <that press>, "change": "repeat", "over": 13}`);
    expect(feedback.instruction).toContain("next, beside a refusal, is what to do instead");
  });

  it("names the press after the listing, and says to add it first when it is not in the Flow", () => {
    const inFlow = told([{ step: 13, reason: "over_not_before", over: 13 }], [...run37, act(14)]);
    expect(nextOf(inFlow)).toContain(`the repeat goes on it: send {"step": 14, "change": "repeat", "over": 13}`);
    const taken = told([{ step: 13, reason: "over_not_before", over: 13 }], [...run37, act(14, "taken")]);
    expect(nextOf(taken)).toContain(`add step 14 with its act, then send {"step": 14, "change": "repeat", "over": 13}`);
    // A press that did not work is no act to repeat.
    const failed = told([{ step: 13, reason: "over_not_before", over: 13 }], [...run37, act(14, "taken", false)]);
    expect(nextOf(failed)).toContain("No step after step 13 does anything to a row yet");
  });

  it("finds the listing whichever way round the two steps were named", () => {
    // `13 repeat over 14`: the repeat on the listing, over the press after it.
    const swapped = told([{ step: 13, reason: "over_not_before", over: 14 }], [...run37, act(14)]);
    expect(nextOf(swapped)).toContain(`send {"step": 14, "change": "repeat", "over": 13}`);
  });

  it("an unchanged rerun of a listing: its rows stand, do not run it again, go on to the act", () => {
    const feedback = told([{ step: 13, reason: "changes_nothing", repeated: true }]);
    const next = nextOf(feedback);
    expect(next).toContain("Step 13's identical request was not sent again");
    expect(next).toContain("only if it actually returned the intended rows");
    expect(next).toContain(`{"step": <that press>, "change": "repeat", "over": 13}`);
    expect(feedback.instruction).toContain("stop sending it");
    expect(feedback.instruction).toContain("next, beside a refusal");
    expect((feedback.reasons as Record<string, string>).changes_nothing).toContain("Inspect the previous result");
  });

  it("says nothing extra where the refused step is not a listing, or the draft gives no effects", () => {
    expect(nextOf(told([{ step: 6, reason: "changes_nothing" }]))).toBeUndefined();
    expect(nextOf(told([{ step: 6, reason: "over_not_before", over: 6 }]))).toBeUndefined();
    const plain = told([{ step: 2, reason: "over_not_before", over: 2 }], [{ position: 1 }, { position: 2 }]);
    expect(plain.refused).toEqual([{ step: 2, reason: "over_not_before" }]);
    expect(plain.instruction).not.toContain("next, beside a refusal");
  });

  // The loop passes the draft itself, so a refusal it tells carries next.
  it("reaches the model from the loop", async () => {
    const list = { toolId: "list", description: "List rows.", inputSchema: { type: "object" }, effect: "observe" as const };
    const executeTool = async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { rows: 4 }, effectApplied: true, draft: { proposes: true } });
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.list", toolId: "list", input: { where: "atLeast 5" }, add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "repeat", over: 1 }] })
      .mockResolvedValueOnce(complete);
    await runAutomationStudioLlmEvidenceLoop({ tools: [list, press], decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool });
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "over_not_before" }] });
    expect(nextOf(feedback!)).toContain(`No step after step 1 does anything to a row yet`);
    expect(nextOf(feedback!)).toContain(`"over": 1}`);
  });

  it("does not claim usable rows after a failed read's unchanged rerun, and does not run it again", async () => {
    const list = { toolId: "list", description: "List rows.", inputSchema: { type: "object" }, effect: "observe" as const };
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: false }, effectApplied: false, stateDigests: { before: "same-state", after: "same-state" }, draft: { proposes: true } }));
    const decide = vi.fn().mockResolvedValueOnce({ kind: "tool_call", callId: "failed-list", toolId: "list", input: { where: "wrong" } })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { where: "wrong" } }] }).mockResolvedValueOnce(complete);
    await runAutomationStudioLlmEvidenceLoop({ tools: [list], decide, executeTool, draft: { seed: [{ position: 1, iteration: 0, actionId: "list", input: { where: "previous valid read" }, effect: "observe", effectApplied: true, proposes: true, disposition: "kept" }] }, unusableDecisions: { stalled: () => new Error("stalled") }, maxIterations: 5, maxToolCalls: 5, dryRun: false });
    const feedback = feedbackShown(decide, 2)!;
    expect(feedback).toMatchObject({ refused: [{ step: 2, reason: "changes_nothing" }] });
    expect(nextOf(feedback)).toContain("only if it actually returned the intended rows");
    expect(nextOf(feedback)).not.toContain("its result stands");
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("does not advise write:true on a rerun as conversion of a recorded bound step", () => {
    const feedback = told([{ step: 13, reason: "rerun_holds_binding" }]);
    const reason = (feedback.reasons as Record<string, string>).rerun_holds_binding!;
    expect(reason).toContain("omitted bound parameters remain bound");
    expect(reason).toContain("new tool_call");
    expect(reason).toContain("does not convert");
  });
});

// Live run `run-muqiojz4-04a7a8fc` (t193, bigbox), decisions 25-29: `keep act
// a2.quantity` on a step the checklist already showed doing it, refused
// `act_already_named` five times running while a3 was still to do; the reason
// said only what to do about an act not done, and the round stalled -- recorded
// as a refused call, which the person's ending read as "every attempt to finish
// was refused".
describe("an act named again that the checklist already shows done, through the loop", () => {
  const stalledError = new Error("stalled");
  const keep = { kind: "amend_draft", amendments: [{ step: 1, change: "keep", act: "a2.quantity" }] };
  const run = (actsMissing: () => readonly string[], onStall: (input: { issueCodes: readonly string[] }) => unknown = () => stalledError) => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: { target: "plus" }, add: true, act: "a2.quantity" })
      .mockResolvedValue(keep);
    const done = runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: pressing(), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true,
      draft: { actsMissing }, unusableDecisions: { maxConsecutive: 8, stalled: onStall }
    });
    return { decide, done };
  };

  it("is told nothing is left to do for it, and which acts still are", async () => {
    const { decide, done } = run(() => ["a3", "a3.size"]);
    await expect(done).rejects.toBe(stalledError);
    const feedback = feedbackShown(decide, 2);
    expect(feedback).toMatchObject({ refused: [{ step: 1, reason: "act_already_named", next: "The acts checklist shows a2.quantity done, so nothing is left to do for it: do not name it again. Still not done on the checklist: a3, a3.size. Go on with those." }] });
    expect(String(feedback?.instruction)).toContain("next, beside a refusal, is what to do instead");
  });

  it("is told the general reason alone while the checklist still shows the act not done", async () => {
    const { decide, done } = run(() => ["a2.quantity", "a3"]);
    await expect(done).rejects.toBe(stalledError);
    expect(feedbackShown(decide, 2)?.refused).toEqual([{ step: 1, reason: "act_already_named" }]);
  });

  it("stalls the round as amendments refused, not as a refused call", async () => {
    const onStall = vi.fn((_input: { issueCodes: readonly string[] }) => stalledError);
    const { done } = run(() => ["a3"], onStall);
    await expect(done).rejects.toBe(stalledError);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onStall.mock.calls[0]![0].issueCodes).toEqual(["llm_evidence_loop.draft_amendments_refused"]);
  });
});

// Live run `run-murz83zy-5030820f` (R8): Amara's Confirm was step 9 and the
// filtered request listing step 18. `9 repeat over 18` was sent five decisions
// running and once more in round 1, each told "over ... must come before the
// act: send {step: <act>, change: repeat, over: <listing>}" -- exactly what it
// had sent -- and `next` said no step after 18 did anything. The listing has to
// move before the act; the refusal now says so, every number in it as the
// draft shown numbered it (run `run-musr9pv3-f4bf6256`: the draft is
// renumbered once, after the whole decision).
describe("a repeat on an act that sits before its listing says to move the listing first", () => {
  const act = (position: number, disposition = "kept", effectApplied = true) => ({ position, effect: "mutate", effectApplied, disposition });
  const read = (position: number, disposition = "taken") => ({ position, effect: "observe", effectApplied: true, disposition });
  const told = (refusals: readonly AutomationStudioFlowDraftAmendmentRefusal[], steps: Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0]["steps"]) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });
  const nextOf = (feedback: Record<string, unknown>): string | undefined => (feedback.refused as { next?: string }[])[0]?.next;
  // The run's draft as it stood at 0043: the act at 9, looks and trial reads between, the listing at 18.
  const run = [act(1), act(2), act(3), act(4), act(5), act(6, "taken"), act(7, "taken"), read(8), act(9), read(10), read(11), read(12), read(13), read(14), read(15), read(16), read(17), read(18, "kept")];

  it("names the reorder and the repeat, both in the numbers the draft shows", () => {
    const feedback = told([{ step: 9, reason: "over_not_before", over: 18 }], run);
    const next = nextOf(feedback);
    expect(next).toContain("Step 18 is the listing, and it comes after step 9, the act the repeat was put on");
    expect(next).toContain(`{"step": 18, "change": "reorder", "to": 9}`);
    expect(next).toContain(`{"step": 9, "change": "repeat", "over": 18}`);
    expect(next).toContain("renumbered once, after the whole decision");
    expect(next).not.toContain("No step after step 18 does anything");
    expect((feedback.reasons as Record<string, string>).over_not_before).toContain("reorder");
  });

  it("keeps through as shown when the repeat named one, and adds the act first when it is not in the Flow", () => {
    const steps = [act(1), act(2), act(3), read(4), read(5, "kept")];
    const through = nextOf(told([{ step: 2, reason: "over_not_before", over: 5, through: 3 }], steps));
    expect(through).toContain(`{"step": 5, "change": "reorder", "to": 2}`);
    expect(through).toContain(`{"step": 2, "change": "repeat", "over": 5, "through": 3}`);
    const taken = nextOf(told([{ step: 2, reason: "over_not_before", over: 5 }], [act(1), act(2, "taken"), act(3), read(4), read(5, "kept")]));
    expect(taken).toContain(`add step 2 with its act, then send {"step": 5, "change": "reorder", "to": 2}`);
  });

  it("does not say it about an act that did not work", () => {
    const failed = nextOf(told([{ step: 2, reason: "over_not_before", over: 5 }], [act(1), act(2, "taken", false), act(3), read(4), read(5, "kept")]));
    expect(failed).not.toContain("reorder");
  });
});

// Live run `run-musp4h2f-72e8ed99`, round 0 (0021-0031): the model bound the
// `target` of its "12 Double Rolls" press, as the draft showed it, and was told
// to "name a parameter it already has, as the draft shows it" -- which it had.
// Then it re-sent `keep 9` and `drop 10`, refused `already_in_flow` and
// `already_out` with no word of what was still to do, until the round stopped
// `unusable_decisions`. Round 2 moved a3 off the 3-Pack's Add to cart, which
// stayed in the Flow with no act and was pressed again in the next test.
describe("run musp4h2f: a refused amendment says what is still to do, and a moved act names the step it left", () => {
  const steps = [{ position: 8, effect: "mutate", effectApplied: true, disposition: "kept" }, { position: 9, effect: "mutate", effectApplied: true, disposition: "kept" }, { position: 10, effect: "mutate", effectApplied: true, disposition: "dropped" }];
  const todo = ["a2", "a2.quantity", "a3", "a3.size"];
  const told = (input: Partial<Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0]>) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: [], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, ...input });
  const nexts = (feedback: Record<string, unknown>): (string | undefined)[] => (feedback.refused as { next?: string }[]).map((refusal) => refusal.next);

  it("answers a bind of a press's target as a press: no value to vary, found by its words, leave it and go on with the acts still to do", () => {
    const feedback = told({ refusals: [{ step: 9, reason: "bind_new_key", parameter: "target", control: true }], actsNotDone: todo });
    expect(feedback.refused).toEqual([{ step: 9, reason: "bind_new_key", parameter: "target", next: expect.any(String) }]);
    const [next] = nexts(feedback);
    expect(next).toContain("a press has no value to vary");
    expect(next).toContain("found by its words");
    expect(next).toContain("Bind only a value a step typed, or a read's condition");
    expect(next).toContain("Leave step 9 as it is");
    expect(next).toContain("Still not done on the checklist: a2, a2.quantity, a3, a3.size. Go on with those.");
    // The reason no longer sends the model back to the draft's key names.
    const reason = (feedback.reasons as Record<string, string>).bind_new_key!;
    expect(reason).not.toContain("as the draft shows it");
    expect(reason).toContain("a press has no value to vary");
    expect(feedback.instruction).toContain("next, beside a refusal");
  });

  it("still says the press when there is no checklist, and that nothing is left when all is done", () => {
    const bare = nexts(told({ refusals: [{ step: 9, reason: "bind_new_key", parameter: "target", control: true }] }))[0];
    expect(bare).toContain("a press has no value to vary");
    expect(bare).toContain("Leave step 9 as it is");
    expect(bare).not.toContain("checklist");
    expect(nexts(told({ refusals: [{ step: 9, reason: "bind_new_key", parameter: "target", control: true }], actsNotDone: [] }))[0])
      .toContain("Nothing on the checklist is still to do: complete when the Flow does what the person asked.");
  });

  it("gives every refusal of an all-refused answer the acts still to do, from the checklist that act_already_named reads", () => {
    const feedback = told({ refusals: [{ step: 9, reason: "already_in_flow" }, { step: 10, reason: "already_out" }, { step: 9, reason: "bind_new_key", parameter: "quantity" }, { step: 9, reason: "bind_not_a_binding", parameter: "target" }], actsNotDone: todo });
    const all = nexts(feedback);
    expect(all).toHaveLength(4);
    for (const next of all) expect(next).toContain("Still not done on the checklist: a2, a2.quantity, a3, a3.size. Go on with those.");
    expect(all[0]).toContain("Step 9 is in the Flow already");
    expect(all[1]).toContain("Step 10 is out of the Flow already");
    // A key that is new, not the control, is not told it is a press.
    expect(all[2]).not.toContain("press");
    expect(feedback.instruction).toContain("next, beside a refusal");
  });

  it("names the step an act moved off, says it now does no act, and that it is pressed in every run unless dropped", () => {
    const feedback = told({ applied: 1, moved: [{ act: "a3", from: 16, to: 24 }] });
    expect(feedback.ok).toBe(true);
    expect(feedback.code).toBe("llm_evidence_loop.draft_act_moved");
    expect(feedback.refused).toEqual([]);
    const moved = feedback.moved as { step: number; act: string; to: number; note: string }[];
    expect(moved).toMatchObject([{ step: 16, act: "a3", to: 24 }]);
    expect(moved[0]!.note).toContain("Step 16 no longer does a3: step 24 does it now.");
    expect(moved[0]!.note).toContain("Step 16 now does no act");
    expect(moved[0]!.note).toContain("pressed in every run unless you drop it");
    expect(moved[0]!.note).toContain(`{"step": 16, "change": "drop"}`);
    expect(feedback.instruction).not.toContain("changed nothing");
    // Beside refusals, the move is told too, under the refusal code.
    const both = told({ applied: 1, refusals: [{ step: 9, reason: "already_in_flow" }], moved: [{ act: "a3", from: 16, to: 24 }] });
    expect(both.code).toBe("llm_evidence_loop.draft_amendments_refused");
    expect(both.moved).toMatchObject([{ step: 16, act: "a3", to: 24 }]);
  });
});

// t174-w108 Cause 6 (`run-musp8nz1-dbd3905a`, steps 0027-0028): with steps 1-13
// in the draft the model sent `{step 14, add, act a1}` for an Add to cart press
// it had not run yet. It was told `no_such_step` and the positions, but no
// `next`: a step enters the draft by running, so the number after the last is
// the one a run with add true would take.
describe("a refusal naming the next free number says to run the step first", () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];
  const told = (step: number, on = steps) => automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step, reason: "no_such_step" }], applied: 0, steps: on, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8
  });

  it("says step 4 of three is not there until it runs, and to run it with add true", () => {
    const feedback = told(4);
    const next = (feedback.refused as { next?: string }[])[0]?.next;
    expect(next).toBe("There is no step 4 yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step 4; do not amend it before it has run.");
    expect(feedback.positions).toEqual([1, 2, 3]);
    expect(feedback.instruction).toContain("next, beside a refusal, is what to do instead");
    expect((told(1, []).refused as { next?: string }[])[0]?.next).toContain("it becomes step 1");
  });

  it("says nothing more for a number past the next free one, or one inside the draft", () => {
    expect((told(9).refused as { next?: string }[])[0]).toEqual({ step: 9, reason: "no_such_step" });
    expect((told(2, [{ position: 1 }, { position: 3 }]).refused as { next?: string }[])[0]).toEqual({ step: 2, reason: "no_such_step" });
  });

  // Merged with run musp4h2f's rule that every refusal names the acts still to
  // do: the run-first `next` comes first, then the checklist, when there is one.
  it("ends with the acts the checklist still shows not done, and names only those for any other number", () => {
    const withChecklist = (step: number) => (automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step, reason: "no_such_step" }], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 8, actsNotDone: ["a1"]
    }).refused as { next?: string }[])[0]?.next;
    expect(withChecklist(4)).toBe("There is no step 4 yet: a step enters the draft only by running. Run that action first as a call with add true (and its act, if it does one), and it becomes step 4; do not amend it before it has run. Still not done on the checklist: a1. Go on with those.");
    expect(withChecklist(9)).toBe("Still not done on the checklist: a1. Go on with those.");
  });
});

// Live run `run-musp474o-e0ed7432` reran the attempt its rerun of step 6 had
// replaced, listed as step 7, three times, and was told only that the argument
// had already run. The refusal now says which step replaced it.
describe("a refusal about the attempt a rerun replaced", () => {
  const told = (actsNotDone?: string[]) => automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: 7, reason: "not_a_kept_step", replacedBy: 6 }],
    applied: 0,
    steps: [1, 2, 3, 4, 5, 6, 7, 8].map((position) => ({ position })),
    stepsWithoutProgress: 1,
    maxStepsWithoutProgress: 8,
    ...(actsNotDone ? { actsNotDone } : {})
  });

  it("says to change the step that replaced it", () => {
    const feedback = told();
    const next = (feedback.refused as { next?: string }[])[0]?.next;
    expect(next).toContain("Step 7 is the attempt step 6's rerun replaced");
    expect(next).toContain("change step 6");
    expect(feedback.instruction).toContain("next, beside a refusal");
  });

  it("ends with the acts the checklist still shows not done, as every refusal does", () => {
    const next = (told(["a2"]).refused as { next?: string }[])[0]?.next;
    expect(next).toContain("change step 6");
    expect(next).toMatch(/Still not done on the checklist: a2\. Go on with those\.$/u);
  });
});

// Live run `run-musr9pv3-f4bf6256` carried a repeat on its listing, over the
// Confirm after it, from decision 0056 to the end of the round, and was never
// told it was there. A repeat a decision's moves leave unable to run is now
// taken off after the decision, and the answer says which step's repeat over
// which step went, and why.
describe("a repeat taken off after a decision's moves", () => {
  const steps = Array.from({ length: 16 }, (_, index) => ({ position: index + 1 }));
  const feedbackOf = (refusals: readonly AutomationStudioFlowDraftAmendmentRefusal[], applied = 1) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied, steps, stepsWithoutProgress: 0, maxStepsWithoutProgress: 8 });
  const nextOf = (feedback: Record<string, unknown>): string | undefined => (feedback.refused as { next?: string }[])[0]?.next;

  it("names the step, the step it repeated over, and that the over now runs after it", () => {
    const feedback = feedbackOf([{ step: 15, reason: "repeat_taken_off", over: 16, takenOff: "over_after" }]);
    const next = nextOf(feedback);
    expect(next).toContain("Step 15's repeat over step 16 was taken off");
    expect(next).toContain("step 16 runs after step 15");
    expect((feedback.reasons as Record<string, string>).repeat_taken_off).toContain("not an amendment of yours");
    // Not an amendment that changed nothing, so the answer does not say it was one.
    expect(String(feedback.instruction)).not.toContain("The listed amendments changed nothing");
    expect(String(feedback.instruction)).toContain("repeat_taken_off");
  });

  it("gives the numbers the draft shows now when the moves changed them", () => {
    const next = nextOf(feedbackOf([{ step: 16, reason: "repeat_taken_off", over: 15, takenOff: "over_after", now: 15, overNow: 16 }]));
    expect(next).toContain("Step 16's repeat over step 15 was taken off");
    expect(next).toContain("now step 15");
    expect(next).toContain("now step 16");
  });

  it("says a span that no longer holds together, naming its through", () => {
    const next = nextOf(feedbackOf([{ step: 16, reason: "repeat_taken_off", over: 15, through: 17, takenOff: "span_broken", now: 17, throughNow: 16 }]));
    expect(next).toContain("Step 16's repeat over step 15, through step 17, was taken off");
    expect(next).toContain("step 17 runs before step 16");
  });

  it("is never marked repeated, since the model did not send it", () => {
    const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
      refusals: [{ step: 15, reason: "repeat_taken_off", over: 16, takenOff: "over_after", repeated: true }],
      applied: 1, steps, stepsWithoutProgress: 0, maxStepsWithoutProgress: 8
    });
    expect((feedback.refused as { repeated?: boolean }[])[0]?.repeated).toBeUndefined();
    expect(String(feedback.instruction)).not.toContain("stop sending it");
  });

  it("says, beside any refusal, that every number in one decision is the number the draft showed", () => {
    const feedback = feedbackOf([{ step: 3, reason: "already_so" }], 0);
    expect(String(feedback.instruction)).toContain("renumbered once, after the whole decision");
    expect(String(feedback.instruction)).toContain("The listed amendments changed nothing");
  });
});

// Live run B7 (t262, decisions 0019-0055): a refused bind of a click's `target`
// was told to name a parameter the step has. The refusal now carries the paths
// the step does offer, read by the bind from the step it examined
// (`../../flow-draft/amendment/bind.ts`), and the telling passes them on.
describe("a refused bind says what the step offers instead, run B7", () => {
  type Input = Parameters<typeof automationStudioLlmEvidenceDraftAmendmentFeedback>[0];
  const told = (refusals: Input["refusals"]) =>
    automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals, applied: 0, steps: [{ position: 9, effect: "mutate", effectApplied: true, disposition: "kept" }], stepsWithoutProgress: 1, maxStepsWithoutProgress: 8 });

  it("passes on the paths the step offers beside the refusal, and tells the model to bind only those", () => {
    const feedback = told([{ step: 9, reason: "bind_new_key", parameter: "target", control: true, bindable: ["text"] }]);
    expect(feedback.refused).toEqual([{ step: 9, reason: "bind_new_key", parameter: "target", bindable: ["text"], next: expect.any(String) }]);
    const reason = (feedback.reasons as Record<string, string>).bind_new_key!;
    expect(reason).toContain("bind only a parameter bindable lists beside the refusal");
    expect(reason).not.toContain("rerun the step with the new parameter");
  });

  it("passes on an empty bindable, and says what that means", () => {
    const feedback = told([{ step: 9, reason: "bind_new_key", parameter: "quantity", bindable: [] }]);
    expect(feedback.refused).toEqual([{ step: 9, reason: "bind_new_key", parameter: "quantity", bindable: [] }]);
    expect((feedback.reasons as Record<string, string>).bind_new_key).toContain("An empty bindable");
  });

  it("passes on nothing for a refusal of another reason", () => {
    expect(told([{ step: 9, reason: "bind_row_outside_loop", parameter: "text", bindable: ["text"] }]).refused).toEqual([{ step: 9, reason: "bind_row_outside_loop", parameter: "text" }]);
  });
});
