// A caller's run-overrides frame: read strictly with the rest of the options, kept with the attempt, and refused by name.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunOverrides } from "../../../../../../runtime/run-overrides/index.ts";
import { automationStudioAnswerFirstCallerOptionsRead as read, automationStudioAnswerFirstKeptCallerOptions as keptOf } from "../index.ts";

const FRAME: AutomationStudioRunOverrides = {
  nodeAttempts: 7,
  retryWaits: { backoffMs: [100, 200], perNodeMs: 5000, perRunMs: 60_000 },
  deadlines: { llmCallMs: 20_000, personWaitMs: 5000, modelSilence: { baseMs: 2000, capMs: 9000 } },
  prompts: { "core.efficiency": { mode: "append", text: "Prefer fewer steps." } },
  tools: { "core.run_node": { mode: "replace", text: "Runs one node." } },
  judgeCriteria: ["Titles are complete."],
  models: { explore: "claude-haiku-5-5", judge: "claude-sonnet-5-5" },
  pace: { minStepGapMs: 5 },
  digest: "d".repeat(64)
};

describe("a caller's run-overrides frame", () => {
  it("is read as a copy, and kept with the attempt as a copy", () => {
    const options = read({ runOverrides: FRAME });
    expect(options.runOverrides).toEqual(FRAME);
    expect(options.runOverrides).not.toBe(FRAME);
    const kept = keptOf(options);
    expect(kept.runOverrides).toEqual(FRAME);
    expect(kept.runOverrides).not.toBe(options.runOverrides);
    // Kept options are read again as a press reads them, and round-trip the frame whole.
    expect(read(JSON.parse(JSON.stringify(kept))).runOverrides).toEqual(FRAME);
    expect(read({}).runOverrides).toBeUndefined();
    expect("runOverrides" in keptOf({ taskKey: "k" })).toBe(false);
  });

  it("refuses a malformed frame, naming what is wrong", () => {
    const bad = (runOverrides: unknown, words: RegExp) => expect(() => read({ runOverrides }), JSON.stringify(runOverrides)).toThrow(words);
    bad(null, /runOverrides must be an object/u);
    bad([], /runOverrides must be an object/u);
    bad({ secrets: { password: "x" } }, /does not take "secrets"/u);
    bad({ nodeAttempts: 0 }, /nodeAttempts/u);
    bad({ nodeAttempts: 1.5 }, /nodeAttempts/u);
    bad({ pace: { minStepGapMs: -1 } }, /pace\.minStepGapMs/u);
    bad({ pace: { gap: 1 } }, /runOverrides\.pace does not take "gap"/u);
    bad({ deadlines: { modelSilence: { baseMs: "x" } } }, /modelSilence\.baseMs/u);
    bad({ retryWaits: { backoffMs: "100" } }, /backoffMs/u);
    bad({ prompts: { a: { mode: "default" } } }, /prompts\.a/u);
    bad({ prompts: { a: { mode: "append", text: "x", extra: 1 } } }, /does not take "extra"/u);
    bad({ tools: { a: { mode: "append", text: 3 } } }, /tools\.a/u);
    bad({ judgeCriteria: [1] }, /judgeCriteria/u);
    bad({ models: { explore: "has spaces" } }, /models\.explore/u);
    bad({ models: { planner: "claude-haiku-5-5" } }, /does not take "planner"/u);
    bad({ digest: 5 }, /digest/u);
    bad({ nodeAttempts: () => 1 }, /nodeAttempts/u);
  });
});

describe("what a press keeps of its attempt's caller options", () => {
  it("keeps the humanness the attempt ran at, so a press is paced the same way", () => {
    expect(keptOf({ humanness: 40 })).toEqual({ humanness: 40 });
    expect(keptOf({})).toEqual({});
  });
});
