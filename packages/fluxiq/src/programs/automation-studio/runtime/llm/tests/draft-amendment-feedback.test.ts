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
    bind_not_a_binding: true, bind_new_key: true, bind_row_outside_loop: true, bind_malformed: true
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
    expect(next).toContain("Step 13 already ran with exactly this argument, so its result stands as shown: do not run it again.");
    expect(next).toContain(`{"step": <that press>, "change": "repeat", "over": 13}`);
    expect(feedback.instruction).toContain("stop sending it");
    expect(feedback.instruction).toContain("next, beside a refusal");
    expect((feedback.reasons as Record<string, string>).changes_nothing).toContain("A listing whose rows are right is never run again");
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
