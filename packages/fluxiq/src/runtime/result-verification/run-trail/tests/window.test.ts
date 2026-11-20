// t965: which form of a judge's summary fits the judging model's window, measured conservatively (`../window.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioResultSummaryFormForWindow } from "../window.ts";

const WINDOW = { maxInputTokens: 872_000, maxOutputTokens: 128_000, maxTotalTokens: 1_000_000 };
const of = (bytes: number) => ({ page: "a b ".repeat(Math.ceil(bytes / 4)) });

describe("the form a judge's request is sent in", () => {
  it("is the whole summary where it fits", () => {
    expect(automationStudioResultSummaryFormForWindow([of(400_000), of(1_000)], WINDOW, 0)).toBe(0);
  });

  it("is a shorter form for a summary of run-mwodpw10's judge 0117 (2.05 MB), which bytes / 3 measured as fitting", () => {
    expect(Math.ceil(2_050_000 / 3) + WINDOW.maxOutputTokens).toBeLessThan(WINDOW.maxTotalTokens);
    expect(automationStudioResultSummaryFormForWindow([of(2_050_000), of(1_700_000), of(300_000)], WINDOW, 0)).toBe(2);
  });

  it("is the shortest where none fits", () => {
    expect(automationStudioResultSummaryFormForWindow([of(3_000_000), of(2_500_000)], WINDOW, 0)).toBe(1);
  });
});
