// @fluxiq-test-group real-sql
// A stuck attempt with nobody to ask (t869, revised by R7 for run-mwc6ut8u-52e3c1b3): it used to
// park at `waiting_for_person` (`stuck_in_a_loop`) and spend nothing more. A task ends only with
// its result, its budget or a person's Stop, so now it is steered onto a different way each time
// the ladder's last rung fires, posts no question, and goes on until its purse is gone. It is
// never a waiting row, so a restart has nothing to call interrupted.
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioAnswerFirstInterruptedView } from "../../../interrupted/index.ts";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { answerOf, decisions, judgeCalls, judgedNo, keptAttempt, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a stuck attempt with nobody to ask", () => {
  it("is steered onto a different way, never waits, and goes on until its budget is gone", async () => {
    const attempt = await scriptedAttempt({
      judge: [judgedNo("Not it.")],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 },
      resolver: { maxTotalEstimatedCostUsd: 0.4 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      before: (service) => {
        noWaiting()(service);
        Object.defineProperty(service.conversations, "available", { value: false });
      },
      keepLooking: true,
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), ...Array.from({ length: 200 }, () => complete("It is done."))]
    }, cleanups);
    expect(attempt.hung).toBe(false);
    expect(attempt.scriptRanOut).toBe(false);
    const answer = answerOf(attempt);
    expect(answer.attempt.status).toBe("budget_out");
    expect(answer.attempt).not.toHaveProperty("waitingFor");
    expect(answer.result?.missingWhat).not.toMatch(/nobody to ask|answer_first|stuck_in_a_loop/u);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // The same refused completion is never judged again.
    expect(judgeCalls(attempt)).toHaveLength(1);
    expect(Object.values(answer.attempt.loopsCaught).reduce((sum, each) => sum + each.askPerson, 0)).toBeGreaterThanOrEqual(1);
    // Each stopped loop's next round is told to take a different way, and that nobody was asked.
    const steered = decisions(attempt).filter((request) => JSON.stringify(request.context).includes("loopStopped"));
    expect(steered.length).toBeGreaterThanOrEqual(1);
    for (const request of steered) expect(JSON.stringify(request.context)).not.toContain("personAsked");
    expect(attempt.said.some((line) => line.includes("Trying a different way"))).toBe(true);
    const kept = await keptAttempt(attempt.service, attempt.projectId, attempt.flowId);
    expect(kept).toBeDefined();
    expect(automationStudioAnswerFirstInterruptedView(kept!)).toBeUndefined();
  });
});
