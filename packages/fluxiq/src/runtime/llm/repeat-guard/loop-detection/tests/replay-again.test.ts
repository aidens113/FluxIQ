// t973 (F20): replays of the Flow's own steps from varying steps, which neither change the result nor
// reach its end anew, with no completion tried, are a loop the model decides on. The pattern is run
// mworaue7-5a56f19a's steps 0281-0356 (local-classifieds, lane A): `core.run_flow` thirteen times from
// steps 38, 38, 29, 29, 38, 29, 29, 33, 34, 38 (to 39), 38, 29 and 38, with structure looks, added steps
// and an amendment between them, the result's rows the same throughout and no completion tried. A
// success again keys on one input, and each added step stood at a new draft, so nothing caught it.

import { describe, expect, it } from "vitest";
import { personFacingTextFaults } from "../../../../../ui/index.ts";
import { automationStudioLlmLoopChatWords, automationStudioLlmLoopSteerNote, automationStudioLlmLoopWatch, type AutomationStudioLlmLoopCall, type AutomationStudioLlmLoopWatch } from "../index.ts";

let n = 0;
const next = () => (n += 1);

/** A replay as the loop reads it: it ran (reads replayed move nothing), the page it leaves is new each time, and the result held still. */
function replay(from: number, fields: Partial<AutomationStudioLlmLoopCall> & { reachedEnd?: boolean; changed?: boolean; to?: number } = {}): AutomationStudioLlmLoopCall {
  const at = next();
  const { reachedEnd = true, changed = false, to, ...rest } = fields;
  return {
    callId: `run.flow.${at}`, toolId: "core.run_flow", input: { from, ...(to ? { to } : {}) }, effect: "mutate", effectApplied: false, refused: false,
    stateBefore: `page.${at}`, stateAfter: `page.${at}.after`, resultCode: "core.run_flow.ran", answer: `answer.${at}`, draftKey: "draft.same",
    replay: { changed, reachedEnd: reachedEnd && to === undefined }, ...rest
  };
}
const look = (): AutomationStudioLlmLoopCall => {
  const at = next();
  return { callId: `detect.${at}`, toolId: "web.detect_repeating_structure", input: { target: `t${at}` }, effect: "observe", effectApplied: false, refused: false, stateBefore: `page.${at}`, stateAfter: `page.${at}`, answer: `structure.${at}` };
};
const addStep = (): AutomationStudioLlmLoopCall => {
  const at = next();
  return { callId: `add.${at}`, toolId: "core.run_node", input: { node: "read", add: true }, effect: "mutate", effectApplied: true, refused: false, stateBefore: `page.${at}`, stateAfter: `page.${at}.added`, answer: `added.${at}`, draftKey: `draft.${at}` };
};

/** The run's sequence, in order: replays by their starting step, `look` and `add` between them as the run made them. */
const RUN_17: ReadonlyArray<number | [number, number] | "look" | "add" | "amend"> = [38, "look", 38, 29, 29, "look", "add", 38, 29, "look", 29, 33, "amend", 34, [38, 39], "look", 38, 29, "look", "add", 38];

function play(watch: AutomationStudioLlmLoopWatch, decide: (finding: NonNullable<ReturnType<AutomationStudioLlmLoopWatch["ran"]>>) => void): { replays: number; steeredAt: number[] } {
  let replays = 0;
  const steeredAt: number[] = [];
  for (const step of RUN_17) {
    if (step === "look") watch.ran(look());
    else if (step === "add") watch.ran(addStep());
    else if (step === "amend") watch.amended({ key: `amend.${next()}`, draftBefore: "draft.same", draftAfter: `draft.amended.${n}`, applied: 1, undone: false });
    else {
      replays += 1;
      const finding = watch.ran(Array.isArray(step) ? replay(step[0], { to: step[1] }) : replay(step));
      if (finding) {
        steeredAt.push(replays);
        decide(finding);
      }
    }
  }
  return { replays, steeredAt };
}

describe("a replay again (run-mworaue7-5a56f19a, steps 0281-0356)", () => {
  it("is caught on the run's pattern, across starting steps and through the steps added between, and asks the model again after it continues", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    const findings: NonNullable<ReturnType<AutomationStudioLlmLoopWatch["ran"]>>[] = [];
    const { replays, steeredAt } = play(watch, (finding) => {
      findings.push(finding);
      // The model decides to go on each time, as a model that keeps replaying would: no hard stop, it is asked again.
      watch.decided("continue");
    });

    expect(replays).toBe(13);
    // The first replay reached the end with the result as it stood: that was new. Three more that changed nothing are the loop.
    expect(steeredAt[0]).toBe(4);
    expect(findings[0]).toMatchObject({ pattern: "near_repeat", replays: true, repeats: 3, toolIds: ["core.run_flow"] });
    // Each replay after a decision to continue asks again, with the count.
    expect(steeredAt).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(findings.at(-1)?.repeats).toBe(12);
    expect(watch.tally().caught.near_repeat).toBeGreaterThanOrEqual(1);
  });

  it("tells the model what it repeated and the person in plain words", () => {
    const finding = { pattern: "near_repeat" as const, repeats: 3, toolIds: ["core.run_flow"], unchanged: ["rows" as const], replays: true as const };
    const note = automationStudioLlmLoopSteerNote(finding, "drafted", true, { instruction: "Decide how to go on." });
    expect(String(note.instruction)).toContain("from different steps, without the result changing");
    expect(String(note.instruction)).toContain("without trying to complete");
    expect(personFacingTextFaults(automationStudioLlmLoopChatWords(finding).text)).toEqual([]);
  });

  it("keeps a replay refused before it runs when the model decided to change approach", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    for (const from of [38, 29, 33]) watch.ran(replay(from));
    expect(watch.ran(replay(34))).toMatchObject({ replays: true });
    watch.decided("change_approach");
    expect(watch.check("core.run_flow", { from: 12 }, undefined, "page.any")).toMatchObject({ replays: true });
  });
});

describe("what a replay that is progress looks like", () => {
  it("a replay that changed the result starts the count again", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    watch.ran(replay(38));
    watch.ran(replay(29));
    watch.ran(replay(33));
    expect(watch.ran(replay(34, { changed: true }))).toBeUndefined();
    expect(watch.ran(replay(38))).toBeUndefined();
    expect(watch.ran(replay(29))).toBeUndefined();
    expect(watch.ran(replay(33))).toMatchObject({ replays: true, repeats: 3 });
  });

  it("a replay that brings rows never seen is progress", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    for (let index = 0; index < 8; index += 1) expect(watch.ran(replay(29 + index, { rows: [`row.${index}`] }))).toBeUndefined();
  });

  it("the first replay that reaches the end since the result changed is progress; replays that stop short are not", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    expect(watch.ran(replay(38, { reachedEnd: false }))).toBeUndefined();
    expect(watch.ran(replay(29, { reachedEnd: false }))).toBeUndefined();
    // The end, reached for the first time: progress, and the count starts again.
    expect(watch.ran(replay(29))).toBeUndefined();
    expect(watch.ran(replay(33, { reachedEnd: false }))).toBeUndefined();
    expect(watch.ran(replay(34, { reachedEnd: false }))).toBeUndefined();
    expect(watch.ran(replay(38, { reachedEnd: false }))).toMatchObject({ replays: true, repeats: 3 });
    // The end reached again with the result as it stood is not new.
    watch.decided("continue");
    expect(watch.ran(replay(38))).toMatchObject({ replays: true, repeats: 4 });
  });

  it("a completion tried starts the count again", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    watch.ran(replay(38));
    watch.ran(replay(29));
    watch.ran(replay(33));
    watch.completionTried();
    watch.ran(replay(38));
    watch.ran(replay(29));
    expect(watch.ran(replay(33))).toBeUndefined();
    expect(watch.ran(replay(34))).toMatchObject({ replays: true, repeats: 3 });
  });

  it("calls that are not replays are never counted as one", () => {
    const watch = automationStudioLlmLoopWatch({ refuseActs: true });
    for (let index = 0; index < 8; index += 1) expect(watch.ran(addStep())?.replays).toBeUndefined();
  });
});
