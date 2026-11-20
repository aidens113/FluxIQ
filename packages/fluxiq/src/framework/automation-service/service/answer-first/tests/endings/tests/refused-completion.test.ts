// @fluxiq-test-group real-sql
// A completion refused over the same evidence (run-mw37vz9n-a77a02c2, steps 116 to 121): it was
// refused three times at about $0.14 each with `loopsCaught` at 0, until the money ran out. Now the
// ladder climbs and asks the model to decide how to go on; the person is asked only where the model
// decides so (t962), without waiting (R7): a task ends only with its result, its budget or a Stop. Through the real
// service and loop with a scripted model, on a context as large as that run's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../../../../service.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { decisions, expectEnded, expectReached, held, heldAtSteer, judgeCalls, judgedNo, keptAttempt, noWaiting, pendingAsk } from "../support.ts";

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

/** The words of the question as the thread shows them. */
async function askWords(service: AutomationStudioService, projectId: string, flowId: string, askId: string): Promise<string> {
  const [conversation] = await service.conversations.listConversations({ projectId, subject: { kind: "flow", id: flowId } });
  const thread = conversation ? await service.conversations.getConversation({ projectId, conversationId: conversation.conversationId }) : null;
  const turn = thread?.turns.find((each) => each.ask?.askId === askId) as { text?: string } | undefined;
  return turn?.text ?? "";
}

describe("three refused completions in a row", () => {
  // t962: the ladder never asks the person by itself; told it is repeating, the model decides, and its own ask_person is what asks.
  it("are steered and the model asked to decide; its ask_person posts its own question without waiting, and a fresh round is steered on, with money left", async () => {
    const hold = held();
    const steer = heldAtSteer();
    const QUESTION = "Should the loans be listed by due date or by title?";
    const generating = scriptedAttempt({
      ...largeContext,
      wrapProvider: (provider) => steer.wrap(largeContext.wrapProvider(provider)),
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      judge: [judgedNo(REASON)],
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
          return toolCall("decide.1", "core.loop_decision", { decision: "ask_person", question: QUESTION });
        },
        complete("Never reached: the person stops it first."),
        complete("Never reached either.")
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    // The model is asked again on a fresh round, steered onto a different way, while the question is open.
    const steered = await steer.steered;
    expect(told(steered)).toContain("Take a different way to the result");
    expect(told(steered)).toContain("Do not wait for them");
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    expect(ask.timeoutMs).toBeNull();
    expect(ask.kind).toBe("open");
    // The model's own question leads, then what is stuck and what it holds, in the person's words.
    const words = await askWords(service, projectId, flowId, ask.askId);
    expect(words).toContain(QUESTION);
    expect(words).toContain("3 rows");
    expect(words).toContain("the result I have keeps being refused");
    expect(words).not.toMatch(/answer_first|near_repeat|same_evidence|stuck_in_a_loop|core\./u);
    expect(words).toContain("I carry on meanwhile");
    const kept = await keptAttempt(service, projectId, flowId);
    expect(kept?.attempt.status).toBe("working");
    expect(kept?.attempt).not.toHaveProperty("waitingFor");
    expect(nearRepeats(kept!.attempt.loopsCaught)).toEqual({ steered: 1, refused: 1, changeApproach: 0, askPerson: 1 });
    expect(kept?.tried.decisions).toEqual([{ decision: "ask_person", pattern: "near_repeat", repeats: 2 }]);
    // The instruction's reading, the read, the judged completion and the refused one: well short of the purse.
    expect(kept!.attempt.spend.usd).toBeLessThan(PURSE_USD / 4);
    // Their Stop is the build's own: it ends the task, with what it had, and closes the question.
    service.buildCancellation.cancel(projectId, flowId);
    steer.release();
    const attempt = await generating;
    const answer = expectEnded(attempt, "stopped_by_person");
    expect(judgeCalls(attempt)).toHaveLength(1);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.attempt.spend.usd).toBeLessThan(1);
    expect(attempt.said.some((line) => line.includes("Noticed it was repeating itself"))).toBe(true);
    expect(attempt.said.some((line) => line.includes("Decided how to go on"))).toBe(true);
  });

  it("a person answering the model's question, while the task goes on, guides a later round to its result", async () => {
    const hold = held();
    const steer = heldAtSteer();
    const library = fakeLibrary();
    const notes: string[] = [];
    const ANSWER = "There are more further down the list.";
    const generating = scriptedAttempt({
      ...largeContext,
      wrapProvider: (provider) => steer.wrap(largeContext.wrapProvider(provider)),
      library,
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      judge: [judgedNo(REASON)],
      script: [
        read(),
        complete("Listed."),
        complete("Listed, again."),
        toolCall("decide.1", "core.loop_decision", { decision: "ask_person", question: "Is the list longer than what I see?" }),
        // The steered round, held until the person has answered: its note was written before the answer.
        complete("Listed, still."),
        (request) => {
          notes.push(JSON.stringify(shownEntry(request, "core.attempt_note")));
          library.loans.push({ title: "Dams and Weirs", due: "2030-01-09" });
          return read("read.more");
        },
        complete("Listed them all.")
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    await steer.steered;
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "text", value: ANSWER });
    steer.release();
    const attempt = await generating;
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(4);
    expect(judgeCalls(attempt)).toHaveLength(2);
    expect(notes.some((note) => note.includes(ANSWER) && note.includes("personSaid"))).toBe(true);
    expect(asks(answer.attempt.loopsCaught)).toBe(1);
  });

  it("with nobody to ask, and a model that never decides, it is stopped and steered each time, posts nothing, and goes on until its budget is gone", async () => {
    const attempt = await scriptedAttempt({
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
