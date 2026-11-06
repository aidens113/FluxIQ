// @fluxiq-test-group real-sql
// The same words typed again, and a person's Run again (t869, the lead's call: `runtime/answer-first/
// act-record/seed.ts`), through the real service, the real engine and a scripted model. A lending
// library stands in, unrelated to any realistic scenario. Provider-free.
//
//   same words after an achieved attempt    what landed is carried: the saved Flow's run and a press
//                                           by hand both refuse it, it is reported already done, and
//                                           a round is told so.
//   attempt 3 and later                     carried from the union, whatever the attempts between did.
//   Run again                               an empty record: a count presses again, and the next same
//                                           words carry both what it landed and what it was spared.
//                                           A stated control is still checked first, so a switch
//                                           already in its asked-for state is not pressed.
//   a new row                               not carried, so it is pressed, once.
//   another case, or a full stop            the same task (t869): its acts carry, and nothing is pressed again.
//   a Run again's judge                     told the person asked for a repeat, and shown this attempt's own
//                                           before-state: one more of a count is right, more is not.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN } from "../../../../../runtime/result-verification/index.ts";
import { judgeReply } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioAnswerFirstKnownFlow, automationStudioAnswerFirstLiveAttemptsOf, automationStudioAnswerFirstRunAgain, automationStudioAnswerFirstStepsDigest, automationStudioAnswerFirstTaskKey } from "../index.ts";
import { HOLD_SHELF, pressCard as renewCardOnTarget, renewEveryLoan, savedStep } from "./fake-library-engine.ts";
import { complete, RENEW_CARD, runNode } from "./fake-library.ts";
import { judgedNo } from "./endings/support.ts";
import { laterAttempts, readLoans, toldTo } from "./later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CARD_TASK = "List every loan on my library account and renew the card.";
const LOAN_TASK = "Renew every loan on my library account.";
const HOLD_TASK = "Keep my loans on the hold shelf.";
const pressCard = (callId = "card") => runNode(callId, RENEW_CARD, {}, ["modify_existing"], { add: true });
const cardAttempt = { instruction: CARD_TASK, permittedConsequences: ["modify_existing" as const], script: [readLoans(), pressCard(), complete("Done.")] };
const same = { instruction: CARD_TASK, permittedConsequences: ["modify_existing" as const] };
const ALREADY = /^Already done earlier: /u;

describe("the same words after an achieved attempt", () => {
  it("run the saved Flow, press nothing that landed, report it already done, and ask the model nothing", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    const second = await lane.attempt(same);
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.decisions).toHaveLength(0);
    expect(second.judgeCalls).toHaveLength(1);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed", what: expect.stringMatching(ALREADY) })]);
    expect(lane.said.some((line) => line.includes("Already done"))).toBe(true);
  });

  it("by hand too: a round that presses it again is refused, is told the acts are an earlier attempt's, and answers", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    const second = await lane.attempt({ ...same, judge: [judgedNo("The list is not shown yet."), undefined].filter(Boolean), script: [pressCard("again"), readLoans("read.again"), complete("Listed, and the card was already renewed.")] });
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.answer.attempt.status).toBe("achieved");
    const told = toldTo(second.decisions[0]);
    expect(told?.earlierActs).toEqual(expect.stringContaining("do not press them again"));
    expect(JSON.stringify(told?.acts)).toContain("\"carried\":true");
    const refused = JSON.stringify(second.decisions[1]?.context.evidenceLoop?.evidence.find((entry) => entry.callId === "again") ?? null);
    expect(refused).toContain("attempt.act_already_done");
  });

  it("carry across attempts 3 and later, from the union, though attempt 2 pressed nothing", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    await lane.attempt(same);
    const third = await lane.attempt(same);
    const fourth = await lane.attempt(same);
    expect(lane.target.library.renewals.card).toBe(1);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", ordinal: 3 });
    expect(fourth.answer.result?.acts).toEqual([expect.objectContaining({ what: expect.stringMatching(ALREADY) })]);
  });
});

describe("a person's Run again", () => {
  it("presses again with an empty record, and the next same words carry what it landed and what it was spared", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    const again = await lane.attempt({ ...same, runAgain: true });
    expect(again.answer.attempt.attemptId).toBe(again.pressed);
    expect(lane.target.library.renewals.card).toBe(2);
    expect(again.answer.result?.acts.map((act) => act.what)).toEqual([expect.not.stringMatching(ALREADY)]);
    expect((await lane.kept(CARD_TASK))?.attempts.at(-1)).toMatchObject({ attemptId: again.pressed, askedAgain: true });
    const after = await lane.attempt(same);
    expect(lane.target.library.renewals.card).toBe(2);
    expect(after.answer.result?.acts).toEqual([expect.objectContaining({ what: expect.stringMatching(ALREADY) })]);
  });

  it("keeps each step's checked state: a switch already in its asked-for state is checked, not pressed, and the answer stands", async () => {
    const lane = await laterAttempts(cleanups);
    // The list is read and shown, as a task that saves and lists does, and then the switch: one the attempt that wrote it saw flip on.
    const steps = [renewEveryLoan()[0]!, savedStep(2, HOLD_SHELF, { control: "Keep on hold" }, { label: "Keep on hold" })];
    const STATED = [{ step: "saved.2", ensureState: { state: "on" } }];
    await lane.memory.update(lane.projectId, automationStudioAnswerFirstTaskKey({ instructionText: HOLD_TASK, startLocation: undefined }), (current) => ({
      ...current, flowId: "flow.loans", best: { attemptId: "attempt.kept", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, stated: STATED, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } }
    }));
    const first = await lane.attempt({ instruction: HOLD_TASK });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(lane.target.library.onHold).toBe(true);
    const again = await lane.attempt({ instruction: HOLD_TASK, runAgain: true });
    expect(again.answer.attempt).toMatchObject({ attemptId: again.pressed, status: "achieved", path: "run_flow", ordinal: 2 });
    expect(again.decisions).toHaveLength(0);
    expect(lane.target.library.onHold).toBe(true);
    expect(lane.target.presses.filter((press) => press.node === HOLD_SHELF)).toHaveLength(1);
    expect((await lane.kept(HOLD_TASK))?.best?.stated).toEqual(STATED);
  });

  it("that presses nothing still leaves what landed before it carried", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    // The page no longer has the card's control, so the press reaches nothing.
    lane.target.over = ({ nodeId }) => nodeId === RENEW_CARD ? { status: "failed", route: "failed", message: "No.", failure: { category: "target_not_found", code: "library.no_button", retryable: false } } : undefined;
    await lane.attempt({ ...same, runAgain: true, script: [readLoans("read.again"), complete("Listed.")] });
    delete lane.target.over;
    await lane.attempt(same);
    expect(lane.target.library.renewals.card).toBe(1);
  });

  it("is refused while the task is still going, and for a task this project does not have, in a person's words, and starts nothing", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(cardAttempt);
    const press = (taskId: string, words: string | undefined = CARD_TASK) => automationStudioAnswerFirstRunAgain(lane.service, lane.stores, { projectId: lane.projectId, taskId, goalWords: async () => words }, async () => "ran");
    const live = automationStudioAnswerFirstLiveAttemptsOf(lane.service);
    live.claim(first.answer.attempt.attemptId);
    expect(await press(first.answer.attempt.taskId)).toEqual({ ok: false, refused: "live", say: "This task is still going." });
    live.release(first.answer.attempt.attemptId);
    expect(await press("task.none")).toEqual({ ok: false, refused: "unknown_task", say: expect.stringMatching(/^I no longer have this task/u) });
    expect(lane.target.library.renewals.card).toBe(1);
  });
});

describe("rows across attempts", () => {
  it("a row that was not there the first time is pressed, once, and those that were are not pressed again", async () => {
    const lane = await laterAttempts(cleanups);
    const steps = renewEveryLoan();
    await lane.memory.update(lane.projectId, automationStudioAnswerFirstTaskKey({ instructionText: LOAN_TASK, startLocation: undefined }), (current) => ({
      ...current, flowId: "flow.loans", best: { attemptId: "attempt.kept", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } }
    }));
    const first = await lane.attempt({ instruction: LOAN_TASK, permittedConsequences: ["modify_existing"] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(lane.target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    lane.target.library.loans.push({ title: "Dune Grasses", due: "2030-01-04" });
    const second = await lane.attempt({ instruction: LOAN_TASK, permittedConsequences: ["modify_existing"] });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(lane.target.library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1, "Dune Grasses": 1 });
  });
});

describe("the same words in another case, or with a full stop (t869)", () => {
  it("are the same task: a switch it pressed is not pressed again, the chat finds its Flow, and the words stay as typed", async () => {
    const lane = await laterAttempts(cleanups);
    // A plain press of a switch that flips each time, with no state to keep: a toggle site's Save in small.
    const steps = [renewEveryLoan()[0]!, savedStep(2, HOLD_SHELF, { control: "Keep on hold" }, { consequences: ["modify_existing"], label: "Keep on hold" })];
    await lane.memory.update(lane.projectId, automationStudioAnswerFirstTaskKey({ instructionText: HOLD_TASK, startLocation: undefined }), (current) => ({
      ...current, flowId: "flow.loans", best: { attemptId: "attempt.kept", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } }
    }));
    const first = await lane.attempt({ instruction: HOLD_TASK, permittedConsequences: ["modify_existing"] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(lane.target.library.onHold).toBe(true);
    const typed = "keep my loans on the hold shelf";
    expect(await automationStudioAnswerFirstKnownFlow(lane.service, lane.stores, { projectId: lane.projectId, instructionText: "KEEP MY LOANS ON THE HOLD SHELF!" })).toBe("flow.loans");
    const second = await lane.attempt({ instruction: typed, permittedConsequences: ["modify_existing"] });
    expect(second.answer.attempt).toMatchObject({ taskId: first.answer.attempt.taskId, ordinal: 2, status: "achieved", path: "run_flow" });
    expect(second.decisions).toHaveLength(0);
    expect(lane.target.library.onHold).toBe(true);
    expect(lane.target.presses.filter((press) => press.node === HOLD_SHELF)).toHaveLength(1);
    // The key is folded; what the judge reads is what the person typed.
    const asked = JSON.stringify(second.judgeCalls[0]?.context.instructions.instructions.map((one) => one.body));
    expect(asked).toContain(typed);
    expect(asked).not.toContain(HOLD_TASK);
  });
});

/** The count a look shows, from what the judge was sent: the library's page says how many renewals it holds. */
const renewedIn = (shown: unknown): number | undefined => {
  const found = /"renewed":(\d+)/u.exec(JSON.stringify(shown ?? null));
  return found ? Number(found[1]) : undefined;
};

describe("a Run again's judge", () => {
  it("is told the person asked for a repeat and judges this attempt's own change: one more is right, the same words are not told, and a press beyond the ask is wrong", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt(cardAttempt);
    expect(lane.target.library.renewals.card).toBe(1);
    const shown: Record<string, unknown>[] = [];
    // A judge in small: right only when told it is a repeat asked for, and this time's change is exactly one more.
    const judge = (request: AutomationStudioLlmTaskRequest) => {
      const sent = request.context.resultSummary as unknown as Record<string, unknown>;
      shown.push(sent);
      const change = (renewedIn(sent.endView) ?? 0) - (renewedIn((sent.witnesses as { before?: unknown } | undefined)?.before) ?? 0);
      return sent.askedAgain === AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN && change === 1 ? judgeReply("yes") : judgedNo(`It changed by ${change}.`);
    };

    const again = await lane.attempt({ ...same, runAgain: true, judge: [judge] });
    expect(again.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(lane.target.library.renewals.card).toBe(2);
    expect(renewedIn((shown[0]!.witnesses as { before?: unknown }).before)).toBe(1);
    expect(renewedIn(shown[0]!.endView)).toBe(2);

    // The same words are no repeat the person asked for, and are not told one.
    const capture = (request: AutomationStudioLlmTaskRequest) => {
      shown.push(request.context.resultSummary as unknown as Record<string, unknown>);
      return judgeReply("yes");
    };
    await lane.attempt({ ...same, judge: [capture] });
    expect(shown[1]!.askedAgain).toBeUndefined();
    expect(lane.target.library.renewals.card).toBe(2);

    // The page takes two where one was asked: wrong, and the attempt does not end achieved on it.
    lane.target.over = ({ nodeId }) => {
      if (nodeId === RENEW_CARD) renewCardOnTarget(lane.target);
      return undefined;
    };
    const beyond = await lane.attempt({ ...same, runAgain: true, judge: [judge] });
    delete lane.target.over;
    expect(lane.target.library.renewals.card).toBe(4);
    expect(shown[2]!.askedAgain).toBe(AUTOMATION_STUDIO_FLOW_LESS_ASKED_AGAIN);
    expect(renewedIn(shown[2]!.endView)! - renewedIn((shown[2]!.witnesses as { before?: unknown }).before)!).toBe(2);
    expect(beyond.answer.attempt.status).not.toBe("achieved");
  });
});
