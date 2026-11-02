import { describe, expect, it } from "vitest";
import { automationStudioCreditedHintMs } from "../index.ts";

describe("a wait hint, credited with the time already passed", () => {
  it.each([
    ["nothing has passed", 5_500, 0, { remainingMs: 5_500, creditedMs: 0 }],
    ["a few milliseconds passed, below a tenth of a second", 5_500, 37, { remainingMs: 5_500, creditedMs: 0 }],
    ["the after-action snapshot took 2.66 s", 5_500, 2_662, { remainingMs: 2_900, creditedMs: 2_600 }],
    ["more than the hint passed", 5_500, 8_000, { remainingMs: 0, creditedMs: 5_500 }]
  ] as const)("when %s", (_name, hint, passed, expected) => {
    expect(automationStudioCreditedHintMs(hint, 1_000, 1_000 + passed)).toEqual(expected);
  });

  it("credits nothing when the clock reads earlier than the settlement", () => {
    expect(automationStudioCreditedHintMs(2_000, 5_000, 4_000)).toEqual({ remainingMs: 2_000, creditedMs: 0 });
  });
});
