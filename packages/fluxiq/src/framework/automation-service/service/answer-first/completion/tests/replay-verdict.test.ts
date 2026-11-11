// How a replay was checked, as the completion hands it to the attempt's row and says it in the step files (t897, `../replay-verdict.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstReplayKept, automationStudioAnswerFirstReplayVerdictOf } from "../index.ts";
import { automationStudioAnswerFirstReplayVerdictNote } from "../replay-verdict.ts";

describe("a replay's verdict", () => {
  it("is what the completion decided: stood on its record, or the deviation it was judged for, and nothing where it closed no replay", () => {
    expect(automationStudioAnswerFirstReplayVerdictOf({ onRecord: true })).toEqual({ stood: true });
    expect(automationStudioAnswerFirstReplayVerdictOf({ deviation: "shape_differs" })).toEqual({ stood: false, deviation: "shape_differs" });
    expect(automationStudioAnswerFirstReplayVerdictOf({})).toBeUndefined();
    expect(automationStudioAnswerFirstReplayKept({})).toEqual({});
    expect(automationStudioAnswerFirstReplayKept({ onRecord: true })).toEqual({ replay: { stood: true } });
  });

  it("is said in the step files in closed words, with the deviation's own word", () => {
    expect(automationStudioAnswerFirstReplayVerdictNote({ stood: true })).toMatch(/stood on its record/u);
    expect(automationStudioAnswerFirstReplayVerdictNote({ stood: false, deviation: "act_not_done" })).toMatch(/was judged.*: act_not_done\.$/u);
  });
});
