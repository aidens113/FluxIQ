// @fluxiq-test-group real-sql
// The attempt's judge is built to the attempt model's own window (W3, t899): the provider resolution's `tokenLimits`
// reach the judge's harness request, and a summary that does not fit them goes in its shorter, said form, not refused.
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const LIMITS = { maxInputTokens: 60_000, maxOutputTokens: 2_000, maxTotalTokens: 62_000 };
/** An answer of some 300,000 characters, far beyond the window above, said once the loans are read. */
const LONG_ANSWER = Array.from({ length: 7_000 }, (_, index) => `Loan ${index + 1} of the reading room, due Thursday`).join("\n");

describe("an attempt's judge on a model with a small window", () => {
  it("is built and checked to the resolution's limits, and a summary that does not fit is sent shorter and says so", async () => {
    const attempt = await scriptedAttempt({
      instruction: "List every loan on my library account.",
      resolver: { tokenLimits: LIMITS },
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.", LONG_ANSWER)]
    }, cleanups);
    const judges = attempt.requests.filter((request) => request.taskKind === "loop_verification");
    expect(judges.length).toBeGreaterThan(0);
    for (const request of judges) {
      expect(request.tokenLimits).toEqual(LIMITS);
      expect(request.estimatedInputTokens + LIMITS.maxOutputTokens).toBeLessThanOrEqual(LIMITS.maxTotalTokens);
    }
    const sent = judges[0]!.context.resultSummary as unknown as { summarised?: { items: string[]; note: string } };
    expect(sent.summarised?.items).toContain("answerText.text");
    expect(sent.summarised?.note).toContain("core.summarised");
    // Judged, not refused by size.
    expect(attempt.answered).toMatchObject({ status: "answered" });
    expect(JSON.stringify(attempt.answered)).not.toMatch(/not_judged/u);
  });
});
