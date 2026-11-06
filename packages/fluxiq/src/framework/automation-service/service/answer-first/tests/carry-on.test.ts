// @fluxiq-test-group real-sql
// "Add budget and carry on", through the real service with a scripted model and a lending library
// that counts presses (t870). The same attempt goes on: nothing is pressed twice, the Flow never
// runs again from its start, and what it spent and found stays with it. Provider-free.
//
// Since t869 a person's Stop is carried on too, and that is how a Run again a Stop cut short is
// finished: a second Run again would start with an empty record and press again what the stopped
// one pressed, so it is refused in words that say to carry on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import { automationStudioAnswerFirstCarryOn, automationStudioAnswerFirstLiveAttemptsOf, automationStudioAnswerFirstRunAgain, automationStudioAnswerFirstStepsDigest } from "../index.ts";
import { judgedNo } from "./endings/support.ts";
import { pressLoan, renewEveryLoan } from "./fake-library-engine.ts";
import { complete, LOOK_TOOL, RENEW_LOAN, READ_LOANS, runNode } from "./fake-library.ts";
import { honestFirstAttempt, LOAN_TASK, onceEach } from "./honest-attempts.ts";
import { laterAttempts, readLoans, toldTo, type LaterAttemptOptions } from "./later-attempts.ts";
import { pressLoanByHand, siteLane } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"];
const [ATLAS, BIRDS, CLOCKS, DUNES] = TITLES as [string, string, string, string];
const ALL = "Renew every loan on my library account and list them.";
const PERMITTED = { instruction: ALL, permittedConsequences: ["modify_existing" as const] };
const press = (title: string) => runNode(`renew.${title.replace(/\W+/gu, "-")}`, RENEW_LOAN, { title }, ["modify_existing"], { add: true });
/** A purse with room for the read and two presses, and little past them: a call is held at four cents and billed at a tenth of one, and one is kept back for the judge. */
const TIGHT = { ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true };
const ONCE_EACH = Object.fromEntries(TITLES.map((title) => [title, 1]));

type Lane = Awaited<ReturnType<typeof laterAttempts>>;

const carryOn = (lane: Lane, attemptId: string, addUsd: number, given: LaterAttemptOptions) =>
  automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId, addUsd }, () => lane.attempt(given));

async function pressedAndFinished(lane: Lane, attemptId: string, addUsd: number, given: LaterAttemptOptions) {
  const pressed = await carryOn(lane, attemptId, addUsd, given);
  if (!pressed.ok) throw new Error(`refused: ${pressed.refused}`);
  return await pressed.finished;
}

const byHandPresses = (lane: Lane) => lane.target.library.calls.filter((call) => call.value.node === RENEW_LOAN);
const titlesIn = (rows: readonly Record<string, unknown>[] | undefined) => rows?.map((row) => row.title);

describe("add budget and carry on", () => {
  it("the same attempt reaches its result: every row once, budget and spend cumulative, and the rows it found still in the result", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const before = first.answer.attempt;
    expect(before.status).toBe("budget_out");
    expect(lane.target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    expect(first.answer.result?.rows?.totalRows).toBe(4);

    const gapMs = 1_200;
    await new Promise((resolve) => setTimeout(resolve, gapMs));
    const addUsd = 0.4;
    const pressed = await carryOn(lane, before.attemptId, addUsd, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    if (!pressed.ok) throw new Error(pressed.refused);
    expect(pressed).toMatchObject({ attemptId: before.attemptId, budgetUsd: expect.closeTo(before.budget.usd + addUsd, 8) });

    // The press answered at once, and the row says what is true from then on.
    const during = (await lane.rows()).at(-1)!.attempt;
    expect(during).toMatchObject({ attemptId: before.attemptId, status: "working", budget: { usd: expect.closeTo(before.budget.usd + addUsd, 8) } });
    expect(during.endedAtMs).toBeUndefined();
    expect(parseAutomationStudioTaskAttempt(during).ok).toBe(true);

    const second = await pressed.finished;
    const after = second.answer.attempt;
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
    expect(byHandPresses(lane)).toHaveLength(4);
    expect(after).toMatchObject({ status: "achieved", attemptId: before.attemptId, ordinal: before.ordinal, taskId: before.taskId, startedAtMs: before.startedAtMs, path: "explore" });
    expect(after.runId).not.toBe(before.runId);
    expect(after.endedAtMs).toBeGreaterThan(before.endedAtMs!);

    // Rows found before the press, with no new read.
    expect(lane.target.library.calls.filter((call) => call.value.node === READ_LOANS)).toHaveLength(1);
    expect(second.answer.result?.rows).toMatchObject({ runId: after.runId, totalRows: 4 });
    expect(titlesIn(second.answer.result?.rows?.previewRows)).toEqual(TITLES);
    expect(second.answer.result?.acts).toHaveLength(4);
    expect(second.answer.result?.label).toBe("confirmed");

    // Budget and spend run on from what it had.
    expect(after.budget.usd).toBeCloseTo(before.budget.usd + addUsd, 8);
    expect(after.spend.usd).toBeGreaterThan(before.spend.usd);
    expect(after.spend.usd).toBeCloseTo(before.spend.usd + second.answer.accounting.estimatedCostUsd!, 8);
    expect(after.spend.calls).toBeGreaterThanOrEqual(before.spend.calls + second.decisions.length);
    expect(after.spend.inputTokens).toBeGreaterThan(before.spend.inputTokens);
    expect(after.liveSteps).toBeGreaterThan(before.liveSteps);
    // The wait before the press is no time spent working.
    expect(after.spend.ms).toBeLessThan(after.endedAtMs! - after.startedAtMs - gapMs + 200);

    // One attempt, one row, one line of provenance.
    expect((await lane.rows()).map((row) => row.attempt.attemptId)).toEqual([before.attemptId]);
    const kept = await lane.kept(ALL);
    expect(kept?.attempts.map((row) => row.attemptId)).toEqual([before.attemptId]);
    expect(kept?.acts?.attemptId).toBe(before.attemptId);
    expect(await lane.memory.attemptLocation(lane.projectId, before.attemptId)).toEqual({ taskId: before.taskId, flowId: "flow.loans" });
  });

  it("a row it had already left out as done stays on the result after a press", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const second = await lane.attempt({ ...TIGHT, judge: [judgedNo("Two loans were not renewed.")], script: [] });
    expect(second.answer.attempt.status).toBe("budget_out");
    expect(second.answer.result?.skippedAsDone).toBe(2);
    const pressed = await carryOn(lane, second.answer.attempt.attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    if (!pressed.ok) throw new Error(pressed.refused);
    const carried = await pressed.finished;
    expect(carried.answer.attempt.status).toBe("achieved");
    expect(carried.answer.result?.skippedAsDone).toBe(2);
    expect(lane.target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
  });

  it("the round is told it was carried on and what stands, from what the attempt tried before", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const triedBefore = (await lane.rows()).at(-1)!.tried;
    expect(triedBefore.tried.length).toBeGreaterThan(0);
    const second = await pressedAndFinished(lane, first.answer.attempt.attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    const told = toldTo(second.decisions[0])!;
    expect(told.carriedOn).toBe(true);
    expect(told.standing).toEqual(expect.stringMatching(/does not run again from its start/u));
    expect(told.acts).toMatchObject({ acts: [expect.objectContaining({ state: "landed", onARow: true }), expect.objectContaining({ state: "landed", onARow: true })] });
    expect(told.rowsKept).toMatchObject({ totalRows: 4 });
    expect(told.tried).toBeDefined();
    // The tried record goes on from the seed the loop's record takes: what it held is still there.
    const triedAfter = (await lane.rows()).at(-1)!.tried;
    expect(triedAfter.tried.map((entry) => entry.key)).toEqual(expect.arrayContaining(triedBefore.tried.map((entry) => entry.key)));
    // It goes on from the page as it stands: the start location is not visited again.
    expect(lane.seen.slice(-2).filter((call) => call.startLocation !== undefined)).toEqual([]);
  });

  it("a budget-out during the rounds after a saved Flow's run: the Flow does not run from its start again", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    await lane.attempt({ ...PERMITTED, script: [readLoans(), complete("Listed.")] });
    const steps = renewEveryLoan();
    await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.old", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }), ALL);
    let tries = 0;
    lane.target.over = ({ nodeId }) => nodeId === RENEW_LOAN && (tries += 1) > 2 ? { status: "failed", route: "failed", message: "Nothing here.", failure: { category: "target_not_found", code: "library.no_button", retryable: false } } : undefined;
    const second = await lane.attempt({ ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.1, keepLooking: true });
    const before = second.answer.attempt;
    expect(before).toMatchObject({ status: "budget_out", path: "run_flow_then_explore" });
    expect(second.decisions.length).toBeGreaterThan(0);
    expect(lane.target.reads).toBe(1);
    expect(lane.target.presses).toHaveLength(2);
    const acted = lane.target.presses.map((each) => each.subject);
    const left = TITLES.filter((title) => !acted.includes(title));
    expect(left).toHaveLength(2);

    delete lane.target.over;
    const third = await pressedAndFinished(lane, before.attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(left[0]!), press(left[1]!), complete("All renewed.")] });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", attemptId: before.attemptId, path: "run_flow_then_explore", ordinal: before.ordinal });
    // No run from the start: the engine read and pressed nothing more.
    expect(lane.target.reads).toBe(1);
    expect(lane.target.presses).toHaveLength(2);
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
    expect(third.answer.result?.rows?.totalRows).toBe(4);
    expect(titlesIn(third.answer.result?.rows?.previewRows)).toEqual(TITLES);
    expect(third.answer.result?.source).toBe("both");
    const kept = await lane.kept(ALL);
    expect(kept?.attempts.filter((row) => row.attemptId === before.attemptId)).toHaveLength(1);
    expect(kept?.attempts.at(-1)?.startedFrom?.attemptId).toBe("attempt.old");
  });

  it("a run the judge could not be paid for reads as a run, and the rounds finish it without running it again", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    const second = await lane.attempt({ maxTotalEstimatedCostUsd: 0.01, costUsd: 0.04 });
    const before = second.answer.attempt;
    expect(before).toMatchObject({ status: "budget_out", path: "run_flow" });
    expect(lane.target.reads).toBe(1);
    // A press that buys no decision worked nothing out either, and a run went out, so it reads neither `explore` nor anything more.
    const short = await pressedAndFinished(lane, before.attemptId, 0.001, { costUsd: 0.04, keepLooking: true });
    expect(short.decisions).toHaveLength(0);
    expect(short.answer.attempt).toMatchObject({ status: "budget_out", path: "run_flow", attemptId: before.attemptId });
    const third = await pressedAndFinished(lane, before.attemptId, 0.5, { costUsd: 0.04, script: [complete("Listed.")] });
    expect(third.judgeCalls).toHaveLength(1);
    expect(lane.target.reads).toBe(1);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(third.answer.result?.rows?.totalRows).toBe(3);
  });

  it("the host's total still holds the purse, and the row says what the attempt really has", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const before = first.answer.attempt;
    const second = await pressedAndFinished(lane, before.attemptId, 5, { ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.08, keepLooking: true, script: [press(CLOCKS)] });
    const after = second.answer.attempt;
    expect(after.status).toBe("budget_out");
    expect(after.spend.usd - before.spend.usd).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(after.budget.usd).toBeCloseTo(before.spend.usd + 0.08, 8);
  });

  it("a carry-on that runs out again is a budget-out again, and can be carried on again", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const { attemptId } = first.answer.attempt;
    const second = await pressedAndFinished(lane, attemptId, 0.02, { ...PERMITTED, costUsd: 0.04, keepLooking: true, script: [press(CLOCKS)] });
    expect(second.answer.attempt).toMatchObject({ status: "budget_out", attemptId });
    expect(second.answer.attempt.spend.usd).toBeGreaterThan(first.answer.attempt.spend.usd);
    expect(second.answer.result?.rows?.totalRows).toBe(4);
    expect(second.answer.attempt.endedAtMs).toBeDefined();
    const third = await pressedAndFinished(lane, attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(DUNES), complete("All renewed.")] });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", attemptId, ordinal: 1 });
    expect(third.answer.attempt.budget.usd).toBeCloseTo(first.answer.attempt.budget.usd + 0.42, 8);
    expect(third.answer.attempt.spend.usd).toBeGreaterThan(second.answer.attempt.spend.usd);
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
    expect(titlesIn(third.answer.result?.rows?.previewRows)).toEqual(TITLES);
    expect((await lane.rows()).map((row) => row.attempt.attemptId)).toEqual([attemptId]);
  });

  it("a person's Stop during a carry-on stops it as usual, and Carry on then finishes the same attempt, pressing nothing twice", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const { attemptId } = first.answer.attempt;
    const second = await pressedAndFinished(lane, attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS)] });
    expect(second.ranOut).toBe(true);
    expect(second.answer.attempt).toMatchObject({ status: "stopped_by_person", attemptId });
    expect(second.answer.result?.rows?.totalRows).toBe(4);
    expect(lane.target.library.renewals[DUNES]).toBeUndefined();
    // Since t869 a Stop is finished by Carry on, the same attempt with its own record: a fresh start would press again what it pressed.
    const third = await pressedAndFinished(lane, attemptId, 0, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    expect(third.answer.attempt).toMatchObject({ status: "achieved", attemptId, ordinal: 1 });
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
    expect((await lane.rows()).map((row) => row.attempt.attemptId)).toEqual([attemptId]);
  });

  it("a judge's no in a carry-on takes the copied rows' standing away, and they stay what the result is until something replaces them", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const second = await pressedAndFinished(lane, first.answer.attempt.attemptId, 0.5, { ...PERMITTED, costUsd: 0.04, judge: [judgedNo("Two are still not renewed.")], script: [complete("Done, I think."), press(CLOCKS), press(DUNES), complete("All renewed.")] });
    expect(second.answer.attempt.status).toBe("achieved");
    expect(second.judgeCalls).toHaveLength(2);
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
    expect(titlesIn(second.answer.result?.rows?.previewRows)).toEqual(TITLES);
  });
});

describe("a press that is refused", () => {
  const expectRefused = async (lane: Lane, attemptId: string, addUsd: number, refused: string) => {
    const before = await lane.rows();
    const run = vi.fn(async () => "never");
    const answer = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId, addUsd }, run);
    expect(answer).toMatchObject({ ok: false, refused, say: expect.any(String) });
    expect(answer.ok ? "" : answer.say).not.toMatch(/[a-z]+_[a-z]+/u);
    expect(run).not.toHaveBeenCalled();
    expect(await lane.rows()).toEqual(before);
    expect(automationStudioAnswerFirstLiveAttemptsOf(lane.service).has(attemptId)).toBe(false);
  };

  it("an unknown attempt, one that reached its result, and a stopped one a later attempt at the task has followed", async () => {
    const lane = await laterAttempts(cleanups);
    const achieved = await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    await expectRefused(lane, "attempt.none", 1, "unknown_attempt");
    await expectRefused(lane, achieved.answer.attempt.attemptId, 1, "achieved");
    const stopped = await lane.attempt({ instruction: "Tell me about my loans on my library account.", script: [] });
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    await lane.attempt({ instruction: "Tell me about my loans on my library account.", script: [complete("Nothing to tell.", "You have three loans.")] });
    await expectRefused(lane, stopped.answer.attempt.attemptId, 1, "later_attempt");
  });

  it("a budget-out with nothing added, or an amount that is no amount", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const { attemptId } = first.answer.attempt;
    await expectRefused(lane, attemptId, 0, "no_budget_added");
    await expectRefused(lane, attemptId, -1, "no_budget_added");
    await expectRefused(lane, attemptId, Number.NaN, "no_budget_added");
  });

  it("an attempt still live, and two presses at once start it only once", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const { attemptId } = first.answer.attempt;
    let runs = 0;
    const run = async () => {
      runs += 1;
      return await lane.attempt({ ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    };
    const request = { projectId: lane.projectId, attemptId, addUsd: 0.4 };
    const [one, two] = await Promise.all([automationStudioAnswerFirstCarryOn(lane.service, lane.stores, request, run), automationStudioAnswerFirstCarryOn(lane.service, lane.stores, request, run)]);
    expect([one.ok, two.ok].sort()).toEqual([false, true]);
    expect(one.ok ? two : one).toMatchObject({ ok: false, refused: "live" });
    const going = one.ok ? one : two.ok ? two : undefined;
    expect((await going?.finished)?.answer.attempt.status).toBe("achieved");
    expect(runs).toBe(1);
    expect(lane.target.library.renewals).toEqual(ONCE_EACH);
  });

  it("a later attempt at the task has started: what it holds may be what this would repeat", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    await lane.attempt({ ...PERMITTED, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    await expectRefused(lane, first.answer.attempt.attemptId, 1, "later_attempt");
  });

  it("an act record that cannot be found for an attempt that acted refuses rather than pressing again", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    await lane.changeKept(({ acts: _gone, ...rest }) => rest, ALL);
    await lane.attempt({ instruction: "Tell me what is on my library account.", script: [complete("Four loans.", "Four loans.")] });
    await expectRefused(lane, first.answer.attempt.attemptId, 1, "acts_unreadable");
  });
});

describe("a press whose run never gets as far as trying", () => {
  it("a run that fails before any attempt puts the row back as it was, and the press can be made again", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const before = await lane.rows();
    const { attemptId } = first.answer.attempt;
    const pressed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId, addUsd: 1 }, async () => { throw new Error("no connection"); });
    if (!pressed.ok) throw new Error(pressed.refused);
    await expect(pressed.finished).rejects.toThrow("no connection");
    expect(await lane.rows()).toEqual(before);
    expect(automationStudioAnswerFirstLiveAttemptsOf(lane.service).has(attemptId)).toBe(false);
    const second = await pressedAndFinished(lane, attemptId, 0.4, { ...PERMITTED, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("a setup step before any model call does the same: nothing was tried, and the attempt's history stays", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...TIGHT, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const before = await lane.rows();
    const { attemptId } = first.answer.attempt;
    const pressed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId, addUsd: 1 }, () => lane.attempt({ ...PERMITTED, resolver: { timeoutMs: -5 }, script: [complete("Never asked.")] }));
    if (!pressed.ok) throw new Error(pressed.refused);
    await expect(pressed.finished).rejects.toThrow(/expected an answer, got setup_needed/u);
    expect(await lane.rows()).toEqual(before);
    expect(automationStudioAnswerFirstLiveAttemptsOf(lane.service).has(attemptId)).toBe(false);
    expect((await lane.kept(ALL))?.attempts.map((row) => row.attemptId)).toEqual([attemptId]);
    expect(lane.target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
  });
});

describe("the look before a press on the page", () => {
  it("a carried-on round looks where the page stands, with no start location", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const startLocation = "https://library.example/account";
    const first = await lane.attempt({ ...TIGHT, startLocation, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    const from = lane.seen.length;
    await pressedAndFinished(lane, first.answer.attempt.attemptId, 0.4, { ...PERMITTED, startLocation, costUsd: 0.04, script: [press(CLOCKS), press(DUNES), complete("All renewed.")] });
    const after = lane.seen.slice(from);
    expect(after.map((call) => call.toolId)).toContain(LOOK_TOOL);
    expect(after.filter((call) => call.startLocation !== undefined)).toEqual([]);
  });
});

describe("a Run again a person stopped part way (t869)", () => {
  const loans = { instruction: LOAN_TASK, permittedConsequences: ["modify_existing" as const] };
  const itemOf = (request: { inputs?: Record<string, unknown> | undefined }) => (request.inputs?.item as { title?: string } | undefined)?.title;
  /** Waits until a Stop reaches the press, as the page would answer nothing before it. */
  const answerAtTheStop = (signal: AbortSignal | undefined) => new Promise<{ status: "failed"; route: string; message: string; failure: AutomationStudioFailureRecord }>((resolve) => {
    const answer = () => resolve({ status: "failed", route: "failed", message: "Page says: nothing came back", failure: { category: "action_failed", code: "library.press_failed", retryable: true } as AutomationStudioFailureRecord });
    if (signal?.aborted) answer();
    else signal?.addEventListener("abort", answer, { once: true });
  });

  it("is finished by Carry on: the other rows once each, the first not again, a second Run again refused, and the same words after it press nothing", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    expect(target.library.renewals).toEqual(onceEach(TITLES));

    // The Run again's run presses the first row, and the person stops it there.
    over((request) => {
      if (request.nodeId !== RENEW_LOAN || itemOf(request) !== ATLAS) return undefined;
      pressLoan(target, request.inputs ?? {}, request.parameters ?? {});
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return answerAtTheStop(request.signal);
    });
    const stopped = await lane.attempt({ ...loans, runAgain: true });
    over();
    const { attemptId, taskId } = stopped.answer.attempt;
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    expect(target.presses.map((one) => one.subject)).toEqual([ATLAS]);
    expect((await lane.kept(LOAN_TASK))?.attempts.at(-1)).toMatchObject({ attemptId, askedAgain: true, stoppedByPerson: true });

    // A second Run again would start empty and press the first row again: refused, in a person's words, and nothing starts.
    const started = vi.fn(async () => "never");
    const again = await automationStudioAnswerFirstRunAgain(lane.service, lane.stores, { projectId: lane.projectId, taskId, goalWords: async () => LOAN_TASK }, started);
    expect(again).toMatchObject({ ok: false, refused: "stopped_part_way", say: expect.stringContaining("Press Carry on") });
    expect(again.ok ? "" : again.say).not.toMatch(/[a-z]+_[a-z]+/u);
    expect(started).not.toHaveBeenCalled();

    // Carry on: the same attempt and record. A careless press of the first row is refused; the other three are pressed once each.
    const second = await pressedAndFinished(lane, attemptId, 0, { ...loans, script: [pressLoanByHand("again", ATLAS), pressLoanByHand("b", BIRDS), pressLoanByHand("c", CLOCKS), pressLoanByHand("d", DUNES), complete("Renewed every loan again.")] });
    expect(second.answer.attempt).toMatchObject({ attemptId, status: "achieved" });
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    // The carry-on never runs the Flow from its start: the engine pressed only the row before the Stop.
    expect(target.presses.map((one) => one.subject)).toEqual([ATLAS]);
    const kept = await lane.kept(LOAN_TASK);
    expect(kept?.attempts.at(-1)).toMatchObject({ attemptId, askedAgain: true });
    expect(kept?.attempts.at(-1)?.stoppedByPerson).toBeUndefined();

    // The same words after it: everything carried, nothing pressed.
    const after = await lane.attempt(loans);
    expect(after.answer.attempt.status).toBe("achieved");
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(target.presses.map((one) => one.subject)).toEqual([ATLAS]);
  });

  it("that pressed nothing before the Stop can still be run again: there is nothing to press twice", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    // Stopped while it reads the list, before any press is sent: a press sent and cut off may have landed, and is held as such.
    over((request) => {
      if (request.nodeId !== READ_LOANS) return undefined;
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return answerAtTheStop(request.signal);
    });
    const stopped = await lane.attempt({ ...loans, runAgain: true });
    over();
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    expect(target.library.renewals).toEqual(onceEach(TITLES));
    const again = await automationStudioAnswerFirstRunAgain(lane.service, lane.stores, { projectId: lane.projectId, taskId: stopped.answer.attempt.taskId, goalWords: async () => LOAN_TASK }, async () => "ran");
    expect(again.ok).toBe(true);
    if (again.ok) await again.finished;
  });
});
