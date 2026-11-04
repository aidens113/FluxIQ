// @fluxiq-test-group real-sql
// The keep-going table's rows about a completion and its judge, each through the real service and
// loop with a scripted model (plan, "Keep Going Until The Result"). None of these ends a task but
// the purse: a completion that gives up, and a judge's no, unsure or silence, all go back to the
// exploration, and the result is then reached or the best of it kept.
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, fakeLibrary, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { decisions, expectEnded, expectPresses, expectReached, judgeCalls, judgedNo, judgedUnsure } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const read = (callId: string, over: Record<string, string> = {}) => runNode(callId, READ_LOANS, over, [], { add: true });

describe("a completion and its judge never end a task", () => {
  it("a completion that says it cannot be done keeps going, and reaches the result", async () => {
    const attempt = await scriptedAttempt({
      judge: [judgedNo("It says this cannot be done, and nothing was looked at.")],
      script: [
        complete("This cannot be done.", "It cannot be done."),
        (request) => {
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("answer_first.judged_no");
          return read("read");
        },
        complete("Listed every loan.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result).toMatchObject({ kind: "rows", timesChecked: 2 });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expectPresses(attempt, {});
  });

  it("a judge's no goes back with its reason, and the task reaches its result", async () => {
    const library = fakeLibrary();
    const attempt = await scriptedAttempt({
      library,
      judge: [judgedNo("One of the loans is missing.")],
      script: [
        read("read"),
        complete("Listed."),
        (request) => {
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("One of the loans is missing.");
          library.shelf = "moved";
          return runNode("read.more", READ_LOANS, {}, [], {});
        },
        complete("Listed them all.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result).toMatchObject({ kind: "rows", timesChecked: 2 });
    expect(judgeCalls(attempt)).toHaveLength(2);
  });

  it("a judge's unsure keeps it looking for evidence, and the task reaches its result", async () => {
    const library = fakeLibrary();
    const attempt = await scriptedAttempt({
      library,
      judge: [judgedUnsure()],
      script: [
        read("read"),
        complete("Listed."),
        (request) => {
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("answer_first.judged_unsure");
          library.shelf = "looked at again";
          return runNode("read.more", READ_LOANS, {}, [], {});
        },
        complete("Listed, and looked again.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result).toMatchObject({ kind: "rows", timesChecked: 2 });
    expect(judgeCalls(attempt)).toHaveLength(2);
  });

  it("a judge that gave nothing is not judged: the same evidence may be asked again, and it is not a no", async () => {
    const attempt = await scriptedAttempt({
      // A no with no located defect is a reply that does not say.
      judge: [{ response: { kind: "diagnosis", summary: "Said nothing.", diagnosis: {} }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.0001 } }],
      script: [
        read("read"),
        complete("Listed."),
        (request) => {
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toContain("answer_first.not_judged");
          return complete("Listed, the same.");
        }
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.timesChecked).toBe(1);
    expect(judgeCalls(attempt)).toHaveLength(2);
  });

  it("a judge refused by the purse is a budget-out, with the best result and an honest label", async () => {
    const attempt = await scriptedAttempt({
      resolver: { maxTotalEstimatedCostUsd: 0.1 },
      keepLooking: true,
      // The completion's own reply bills far past its estimate, so what was kept back no longer pays for the check.
      wrapProvider: (provider) => ({
        ...provider,
        estimateCostUsd: () => 0.002,
        runTask: async (request, execution) => {
          const answered = await provider.runTask(request, execution) as { response?: { decision?: { kind?: string } }; usage?: object };
          return answered.response?.decision?.kind === "complete" ? { ...answered, usage: { ...answered.usage, estimatedCostUsd: 0.0985 } } : answered;
        }
      }),
      script: [read("read"), complete("Listed."), complete("Listed, again.")]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.result).toMatchObject({ kind: "rows", label: "unverified", timesChecked: 0 });
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.missingWhat).toMatch(/budget/u);
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(0.1);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0);
    expectPresses(attempt, {});
    // It was the check that could not be paid for, and it was said to be asked: the decision before it was answered.
    expect(attempt.said.some((line) => line.includes("Checking the result"))).toBe(true);
    expect(judgeCalls(attempt)).toHaveLength(0);
  });

  it("no lasting act is repeated however often a judge says no", async () => {
    const library = fakeLibrary();
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      judge: [judgedNo("Not confirmed."), judgedUnsure(), judgedNo("Still not confirmed.")],
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        complete("Renewed."),
        () => {
          library.shelf = "first look";
          return runNode("card.again", RENEW_CARD, {}, ["modify_existing"], {});
        },
        complete("Renewed it."),
        () => {
          library.shelf = "second look";
          return toolCall("card.third", "core.run_node", { node: RENEW_CARD, parameters: {}, consequences: ["modify_existing"], reason: "Press it again." });
        },
        complete("It is renewed."),
        () => {
          library.shelf = "third look";
          return complete("It is renewed, as the page shows.");
        }
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expectPresses(attempt, { card: 1 });
    expect(answer.result?.acts).toHaveLength(1);
    expect(decisions(attempt).length).toBeGreaterThan(5);
  });
});
