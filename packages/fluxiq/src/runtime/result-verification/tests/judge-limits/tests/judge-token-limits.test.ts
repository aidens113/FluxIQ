// The Flow-run result check is built to its judging model's window (W3, t899): the resolution's `tokenLimits`
// reach the judge's harness request, which the harness then checks the request against.
import { describe, expect, it } from "vitest";
import { ANSWER, memberHarness as harness, provider, verify } from "../../run-outcome-harness.ts";

describe("the Flow-run result check on a model with a small window", () => {
  it("carries the resolution's token limits to the judge's request, and holds the request to them", async () => {
    const limits = { maxInputTokens: 30_000, maxOutputTokens: 2_000, maxTotalTokens: 32_000 };
    const context = harness({ answer: ANSWER.yes });
    context.ports.resolveProvider = async () => ({ provider: provider(ANSWER.yes, context.requests), tokenLimits: limits });
    await verify(context);
    const judged = context.requests.filter((request) => request.taskKind === "loop_verification");
    expect(judged.length).toBeGreaterThan(0);
    for (const request of judged) {
      expect(request.tokenLimits).toEqual(limits);
      expect(request.estimatedInputTokens + limits.maxOutputTokens).toBeLessThanOrEqual(limits.maxTotalTokens);
    }
  });

  it("is refused by size, before the model is asked, when the window cannot hold the request", async () => {
    const context = harness({ answer: ANSWER.yes });
    context.ports.resolveProvider = async () => ({ provider: provider(ANSWER.yes, context.requests), tokenLimits: { maxInputTokens: 50, maxOutputTokens: 10, maxTotalTokens: 60 } });
    await verify(context);
    expect(context.requests).toHaveLength(0);
  });
});
