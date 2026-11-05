// @fluxiq-test-group real-sql
// A completion refused over the same evidence (run-mw37vz9n-a77a02c2, steps 116 to 121): it was
// refused three times at about $0.14 each with `loopsCaught` at 0, until the money ran out. The
// person's rule is never to burn a budget on a refusal. Through the real service and loop with a
// scripted model, on a context as large as that run's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../../../../service.ts";
import { complete, fakeLibrary, READ_LOANS, runNode, scriptedAttempt } from "../../fake-library.ts";
import { decisions, expectEnded, expectReached, held, judgeCalls, judgedNo, keptAttempt, noWaiting, pendingAsk } from "../support.ts";

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
  it("are steered, then change approach, then ask the person, with money left, and it says what it holds", async () => {
    const hold = held();
    let modelCalls = 0;
    const generating = scriptedAttempt({
      ...largeContext,
      wrapProvider: (provider) => ({
        ...largeContext.wrapProvider(provider),
        runTask: async (request, execution) => {
          modelCalls += 1;
          return await provider.runTask(request, execution);
        }
      }),
      before: (service, project) => {
        noWaiting()(service);
        hold.before(service, project);
      },
      judge: [judgedNo(REASON)],
      script: [
        read(),
        complete("Listed."),
        complete("Listed, again."),
        complete("Listed, once more."),
        complete("Listed, in other words."),
        complete("Never asked: the person stops it first.")
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    expect(ask.timeoutMs).toBeNull();
    // What it holds and what the check said, in the person's words.
    const words = await askWords(service, projectId, flowId, ask.askId);
    expect(words).toContain("3 rows");
    expect(words).toContain(REASON);
    expect(words).not.toMatch(/answer_first|near_repeat|same_evidence|stuck_in_a_loop/u);
    const kept = await keptAttempt(service, projectId, flowId);
    expect(kept?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" });
    expect(nearRepeats(kept!.attempt.loopsCaught)).toEqual({ steered: 1, refused: 3, changeApproach: 1, askPerson: 1 });
    expect(kept?.tried.approaches).toBe(1);
    // A wait: nothing is asked of the model, and nothing more is spent.
    const callsAtTheAsk = modelCalls;
    const spentAtTheAsk = kept!.attempt.spend.usd;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(modelCalls).toBe(callsAtTheAsk);
    // The instruction's reading, the read, the judged completion and the three refused: well short of the purse.
    expect(spentAtTheAsk).toBeLessThan(1);
    expect(spentAtTheAsk).toBeLessThan(PURSE_USD / 4);
    expect(callsAtTheAsk).toBeLessThanOrEqual(7);
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: "stuck_stop" });
    const attempt = await generating;
    const answer = expectEnded(attempt, "stopped_by_person");
    expect(judgeCalls(attempt)).toHaveLength(1);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(nearRepeats(answer.attempt.loopsCaught)).toEqual({ steered: 1, refused: 3, changeApproach: 1, askPerson: 1 });
    expect(answer.attempt.spend.usd).toBeLessThan(1);
    expect(attempt.said.some((line) => line.includes("Noticed it was repeating itself"))).toBe(true);
  });

  it("a person answering lets the task go on, on what it held, to its result", async () => {
    const hold = held();
    const library = fakeLibrary();
    const notes: string[] = [];
    const generating = scriptedAttempt({
      ...largeContext,
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
        complete("Listed, once more."),
        complete("Listed, in other words."),
        (request) => {
          notes.push(JSON.stringify(shownEntry(request, "core.attempt_note")));
          library.loans.push({ title: "Dams and Weirs", due: "2030-01-09" });
          return read("read.more");
        },
        complete("Listed them all.")
      ]
    }, cleanups);
    const { service, projectId, flowId } = await hold.ready();
    const ask = await pendingAsk(service, projectId, flowId, "stuck_in_a_loop");
    await service.conversations.answerAsk({ projectId, askId: ask.askId, kind: "choice", value: "stuck_keep_going" });
    const attempt = await generating;
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(4);
    expect(judgeCalls(attempt)).toHaveLength(2);
    expect(notes[0]).toContain("said to keep going");
    expect(notes[0]).toContain(REASON);
    expect(asks(answer.attempt.loopsCaught)).toBe(1);
  });

  it("with nobody to ask it keeps going, and the purse is what ends it", async () => {
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
    expect(asks(answer.attempt.loopsCaught)).toBeGreaterThanOrEqual(1);
    expect(judgeCalls(attempt)).toHaveLength(1);
    expect(answer.attempt.spend.usd).toBeLessThanOrEqual(0.5);
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
    expect(afterSame).toContain("stop with what you hold");
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
