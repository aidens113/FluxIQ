// How a replay was checked, as the attempt's row and the step files keep it (t897, `../replay-verdict.ts`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS, automationStudioAnswerFirstReplayKept, automationStudioAnswerFirstReplayVerdictOf, automationStudioAnswerFirstReplayVerdictRead } from "../index.ts";
import { automationStudioAnswerFirstReplayVerdictNote } from "../replay-verdict.ts";

describe("a replay's verdict", () => {
  it("is what the completion decided: stood on its record, or the deviation it was judged for, and nothing where it closed no replay", () => {
    expect(automationStudioAnswerFirstReplayVerdictOf({ onRecord: true })).toEqual({ stood: true });
    expect(automationStudioAnswerFirstReplayVerdictOf({ deviation: "shape_differs" })).toEqual({ stood: false, deviation: "shape_differs" });
    expect(automationStudioAnswerFirstReplayVerdictOf({})).toBeUndefined();
    expect(automationStudioAnswerFirstReplayKept({})).toEqual({});
    expect(automationStudioAnswerFirstReplayKept({ onRecord: true })).toEqual({ replay: { stood: true } });
  });

  it("reads back every deviation the rule names, and nothing else", () => {
    for (const deviation of AUTOMATION_STUDIO_ANSWER_FIRST_REPLAY_DEVIATIONS) expect(automationStudioAnswerFirstReplayVerdictRead({ stood: false, deviation })).toEqual({ stood: false, deviation });
    expect(automationStudioAnswerFirstReplayVerdictRead({ stood: true })).toEqual({ stood: true });
    for (const bad of [null, [], "stood", { stood: true, deviation: "step_routed" }, { stood: false }, { stood: false, deviation: "page said so" }, { stood: false, deviation: "step_routed", extra: 1 }]) {
      expect(automationStudioAnswerFirstReplayVerdictRead(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it("is said in the step files in closed words, with the deviation's own word", () => {
    expect(automationStudioAnswerFirstReplayVerdictNote({ stood: true })).toMatch(/stood on its record/u);
    expect(automationStudioAnswerFirstReplayVerdictNote({ stood: false, deviation: "act_not_done" })).toMatch(/was judged.*: act_not_done\.$/u);
  });
});
