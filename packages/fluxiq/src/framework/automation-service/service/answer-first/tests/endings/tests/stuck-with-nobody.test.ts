// @fluxiq-test-group real-sql
// A stuck attempt with nobody to ask waits, with the reason it is waiting for, and spends nothing more (t869):
// the person's rule is never to burn a budget on a refusal. A restart does not call it interrupted, and a
// person who says keep going later is the answer it waited for.
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioAnswerFirstInterruptedView } from "../../../interrupted/index.ts";
import { complete, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { answerOf, judgeCalls, judgedNo, keptAttempt, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a stuck attempt with nobody to ask", () => {
  it("waits for a person to say whether to keep going, spends no more, and is not an interrupted row", async () => {
    const attempt = await scriptedAttempt({
      judge: [judgedNo("Not it.")],
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
    expect(answer.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" });
    expect(answer.attempt.endedAtMs).toBeUndefined();
    expect(answer.result?.missingWhat).toMatch(/nobody to ask whether to keep going/u);
    expect(answer.result?.missingWhat).not.toMatch(/answer_first|stuck_in_a_loop/u);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(judgeCalls(attempt)).toHaveLength(1);
    // It stopped at the third refusal: five decisions at most, not the purse.
    expect(attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision").length).toBeLessThan(10);
    const kept = await keptAttempt(attempt.service, attempt.projectId, attempt.flowId);
    expect(kept).toBeDefined();
    expect(automationStudioAnswerFirstInterruptedView(kept!)).toBeUndefined();
  });
});
