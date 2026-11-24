// @fluxiq-test-group real-sql
// A completion refused over the same evidence (run-mw37vz9n-a77a02c2, steps 116 to 121): it was
// refused three times at about $0.14 each with `loopsCaught` at 0, until the money ran out. Now the
// ladder climbs and asks the model to decide how to go on; the person is asked only where the model
// decides so (t962), without waiting (R7): a task ends only with its result, its budget or a Stop. Through the real
// service and loop with a scripted model, on a context as large as that run's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { decisions, expectEnded, expectReached, judgeCalls, judgedNo, keptAttempt, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const PURSE_USD = 5;
const CALL_USD = 0.14;
const REASON = "The rows came back in the wrong order.";

/** Every decision costs what a late decision of that run cost, against that run's purse. */
const largeContext = {
  usage: { inputTokens: 65_000, outputTokens: 900, totalTokens: 65_900, estimatedCostUsd: CALL_USD },
  resolver: { maxTotalEstimatedCostUsd: PURSE_USD },
  wrapProvider: (provider: AutomationStudioLlmProvider): AutomationStudioLlmProvider => ({ ...provider, estimateCostUsd: () => CALL_USD })
};
const read = (callId = "read") => runNode(callId, READ_LOANS, {}, [], { add: true });
const nearRepeats = (loopsCaught: { near_repeat: unknown }) => loopsCaught.near_repeat;
const asks = (loopsCaught: Record<string, { askPerson: number }>) => Object.values(loopsCaught).reduce((sum, each) => sum + each.askPerson, 0);
const shownEntry = (request: AutomationStudioLlmTaskRequest, toolId: string): JsonObject | undefined => request.context.evidenceLoop?.evidence.find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const told = (request: AutomationStudioLlmTaskRequest): string => JSON.stringify(request.context.evidenceLoop?.evidence);

/** Asking the person is a last resort (t969): core offers it only after a changed approach and a climb. */
const askOffered = (request: AutomationStudioLlmTaskRequest): boolean => /"offered":\[[^\]]*"ask_person"/u.test(told(request));
const CHANGE: JsonObject = { decision: "change_approach", approach: "Check the list against the page again before completing." };

describe("three refused completions in a row", () => {
  // t969: asking the person is a last resort, so the first time the model is asked to decide it is not offered, and the model keeps going by its own choice.
  it("are steered and the model asked to decide; asking the person is not offered yet, its change of approach is carried out, nobody is asked, and it goes on until its budget is gone", async () => {
    let offeredAtTheDecision: boolean | undefined;
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      before: noWaiting(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 },
      resolver: { maxTotalEstimatedCostUsd: 0.5 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      judge: [judgedNo(REASON)],
      keepLooking: true,
      script: [
        read(),
        complete("Listed."),
        (request) => {
          // The refusal over the same evidence asks the model to decide how to go on.
          expect(told(request)).toContain(REASON);
          return complete("Listed, again.");
        },
        (request) => {
          expect(told(request)).toContain("core.loop_decision");
          offeredAtTheDecision = askOffered(request);
          expect(told(request)).toContain("genuinely impossible under their instructions");
          return toolCall("decide.0", "core.loop_decision", CHANGE);
        },
        ...Array.from({ length: 200 }, (_, index) => complete(`Listed, take ${index}.`))
      ]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.attempt).not.toHaveProperty("waitingFor");
    expect(asks(answer.attempt.loopsCaught)).toBe(0);
    expect(offeredAtTheDecision).toEqual(false);
    // Refused completions over the same evidence are never judged again.
    expect(judgeCalls(attempt)).toHaveLength(1);
  });

  it("with nobody to ask, and a model that never decides, it is stopped and steered each time, posts nothing, and goes on until its budget is gone", async () => {
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      before: (service) => {
        noWaiting()(service);
        Object.defineProperty(service.conversations, "available", { value: false });
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.02 },
      resolver: { maxTotalEstimatedCostUsd: 0.5 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.02 }),
      judge: [judgedNo(REASON)],
      keepLooking: true,
      script: [read(), ...Array.from({ length: 200 }, (_, index) => complete(`Listed, take ${index}.`))]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.attempt).not.toHaveProperty("waitingFor");
    expect(asks(answer.attempt.loopsCaught)).toBe(0);
    expect(nearRepeats(answer.attempt.loopsCaught)).toMatchObject({ askPerson: 0 });
    // Refused completions over the same evidence are never judged again, however long it goes on.
    expect(judgeCalls(attempt)).toHaveLength(1);
    const steered = decisions(attempt).find((request) => told(request).includes("loopStopped"));
    expect(steered && told(steered)).toContain("You completed with the same result");
    expect(steered && told(steered)).toContain("Take a different approach");
    expect(steered && told(steered)).not.toContain("personAsked");
  });
});

describe("new evidence between completions", () => {
  it("starts it again: a real read then a complete is judged again, and the ladder has not moved on", async () => {
    const library = fakeLibrary();
    const more = (title: string, callId: string) => () => {
      // A loan the page now shows: the same read on an unmoved page is answered from memory, and is no read.
      library.loans.push({ title, due: "2030-02-01" });
      library.shelf = title;
      return read(callId);
    };
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      ...largeContext,
      library,
      before: noWaiting(),
      judge: [judgedNo(REASON), judgedNo("Still missing one.")],
      script: [
        read(),
        complete("Listed."),
        complete("Listed, again."),
        more("Dams and Weirs", "read.second"),
        complete("Listed more."),
        complete("Listed more, again."),
        more("Eels of the Fens", "read.third"),
        complete("Listed them all.")
      ]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(5);
    expect(judgeCalls(attempt)).toHaveLength(3);
    // Two refused once each, told each time, and it never had to change approach or ask.
    expect(nearRepeats(answer.attempt.loopsCaught)).toEqual({ steered: 2, refused: 2, changeApproach: 0, askPerson: 0 });
    expect((await keptAttempt(attempt.service, attempt.projectId, attempt.flowId))?.tried.approaches).toBe(0);
  });
});

describe("what the model reads", () => {
  it("a judged no's reason reaches its next request, whole, with what the result holds in its order", async () => {
    const seen: string[] = [];
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      judge: [judgedNo(REASON)],
      script: [
        read(),
        complete("Listed."),
        (request) => {
          seen.push(told(request));
          const check = shownEntry(request, "core.completion_check");
          expect(check?.code).toBe("answer_first.judged_no");
          expect(check?.instruction).toContain(REASON);
          expect(check?.resultHolds).toMatchObject({ totalRows: 3, columns: ["title", "due"], rowsInOrder: [{ title: "Atlas of Rivers" }, { title: "Birds of the Coast" }, { title: "Clockmaking" }], acts: 0 });
          return complete("Listed, again.");
        },
        (request) => {
          seen.push(told(request));
          const check = shownEntry(request, "core.completion_check");
          expect(check?.code).toBe("answer_first.same_evidence");
          expect(check?.resultHolds).toMatchObject({ totalRows: 3 });
          return complete("Listed, once more.");
        },
        (request) => {
          seen.push(told(request));
          return runNode("read.again", READ_LOANS, { shape: "another" }, [], {});
        }
      ]
    }, cleanups);
    expect(attempt.scriptRanOut).toBe(true);
    const [afterNo, afterSame, freshRound] = seen;
    // Plain: what the no was about, what would change it, and what repeating it leads to.
    expect(afterSame).toContain(REASON);
    expect(afterSame).toContain("Only new evidence changes");
    expect(afterSame).toContain("an act on the site that lands");
    expect(afterSame).toContain("a read that returns different rows or the same rows in a different order");
    expect(afterSame).toContain("Editing the draft, or rewording your summary or notes, is not new evidence");
    expect(afterSame).toContain("Completing again with nothing new stops this round, and the next must take a different way.");
    expect(afterSame).toContain("core.loop_decision");
    expect(afterSame).not.toContain("the person is asked");
    expect(afterNo).toContain("Only new evidence changes");
    // Never told that the check reads the draft: it does not, and being told so is what sent that run to edit its draft.
    for (const words of seen) {
      expect(words).not.toContain("The check reads the draft");
      expect(words).not.toContain("until the draft changes");
    }
    // The fresh round has the reason and the result too, on a smaller context.
    expect(freshRound).toContain("core.attempt_note");
    expect(freshRound).toContain("completionRefused");
    expect(freshRound).toContain(REASON);
    expect(freshRound).toContain("rowsInOrder");
    expect(freshRound).toContain("freshStarts");
    expect(freshRound).not.toContain("core.completion_check.");
    expect(decisions(attempt).length).toBeGreaterThan(3);
  });
});

describe("the old ending", () => {
  it("a budget really spent is still a budget-out: new evidence each time is judged each time, and nothing is asked", async () => {
    const library = fakeLibrary();
    let moved = 0;
    const moving = () => {
      library.shelf = `shelf ${(moved += 1)}`;
      return complete(`Listed from shelf ${moved}.`);
    };
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      library,
      before: noWaiting(),
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.04 },
      resolver: { maxTotalEstimatedCostUsd: 0.5 },
      wrapProvider: (provider) => ({ ...provider, estimateCostUsd: () => 0.04 }),
      judge: Array.from({ length: 60 }, () => judgedNo(REASON)),
      keepLooking: true,
      script: [read(), ...Array.from({ length: 60 }, () => moving)]
    }, cleanups);
    const answer = expectEnded(attempt, "budget_out");
    expect(answer.result).toMatchObject({ kind: "rows", label: "refuted" });
    expect(judgeCalls(attempt).length).toBeGreaterThanOrEqual(2);
    expect(asks(answer.attempt.loopsCaught)).toBe(0);
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(0.5);
    expect(answer.attempt.spend.usd).toBeGreaterThan(0.2);
  });
});
