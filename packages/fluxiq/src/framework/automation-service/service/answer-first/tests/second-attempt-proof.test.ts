// @fluxiq-test-group real-sql
// The second attempt, through the real service, the real engine and a scripted model, on a lending
// library that counts presses (t870). Both attempts share one data directory. The first is written the
// way the plan says: read the list, the first row by hand, the step made a repeat over the list with a
// `$row` binding, a forward run on the rest. What the second attempt finds is what that really left.
// Provider-free: the model and the judge are scripts, and only they decide anything a real model would.
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAutomationStudioSavedState } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstSavedStateOf, automationStudioAnswerFirstStepsDigest } from "../index.ts";
import { judgeReply } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { LOANS_OUTPUT, savedStep } from "./fake-library-engine.ts";
import { complete, READ_LOANS, RENEW_CARD, RENEW_LOAN } from "./fake-library.ts";
import { readLoans, toldTo } from "./later-attempts.ts";
import { BOTH_TASK, honestFirstAttempt, honestFirstAttemptWithCard, LOAN_STEP, LOAN_TASK, onceEach, PERMITTED, READ_STEP, repeatOverRows } from "./honest-attempts.ts";
import { ATLAS, BIRDS, CLOCKS, DUNES, forwardFrom, pressCardByHand, pressLoanByHand, siteLane, TITLES, writeStep } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const again = { instruction: LOAN_TASK, ...PERMITTED };
const NEW_CARD_NAME = "Renew library card";
const LENGTHEN = "Extend";
const writeCardStep = (control: string) => writeStep(RENEW_CARD, { control });
const writeLoanStep = (control: string) => writeStep(RENEW_LOAN, { title: ATLAS, control });
/** The opening look of the attempt's first round takes the next number, so a step written after it comes after that. */
const putInPlaceOf = (old: number, shown: number) => ({ kind: "amend_draft", amendments: [{ step: old, change: "drop" }, { step: shown, change: "reorder", to: old }] });

describe("the Flow holds", () => {
  it("the saved draft is really a row-bound repeat, the engine's For Each drives it, and attempts 2 and 3 cost the same small amount", async () => {
    const { lane, target } = await siteLane(cleanups);
    const first = await lane.attempt(honestFirstAttempt());
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    expect(target.library.renewals).toEqual(onceEach());
    // By hand and by the walker: the engine has not run yet.
    expect(target.presses).toEqual([]);
    const byHand = target.library.calls.filter((call) => call.value.node === RENEW_LOAN);
    expect(byHand.map((call) => (call.value.item as { title?: string } | undefined)?.title ?? (call.value.parameters as { title?: string }).title)).toEqual([...TITLES]);
    expect(byHand.map((call) => call.value.replay)).toEqual([undefined, "step", "step", "step"]);

    // The shape t861 never proved: a repeat over the read, with the row bound.
    const steps = (await lane.kept(LOAN_TASK))?.best?.steps ?? [];
    expect(steps.map((step) => [step.position, step.actionId, step.disposition])).toEqual([[1, "library.look", "taken"], [READ_STEP, READ_LOANS, "kept"], [LOAN_STEP, RENEW_LOAN, "kept"]]);
    const press = steps[2]!;
    expect(press.routing).toEqual({ kind: "repeat", through: press.id, over: steps[1]!.id });
    expect(press.input.parameters).toMatchObject({ title: { $state: { path: "item.title" } } });

    const second = await lane.attempt(again);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(second.decisions).toEqual([]);
    expect(second.judgeCalls).toHaveLength(1);
    expect(second.answer.result).toMatchObject({ kind: "rows", source: "flow", label: "confirmed", timesChecked: 1 });
    expect(second.answer.result?.rows?.previewRows.map((row) => row.title)).toEqual([...TITLES]);
    expect(second.answer.result?.acts.map((act) => act.state)).toEqual(["landed", "landed", "landed", "landed"]);
    // The For Each handed each pass its row, and the binding resolved to that row: neither comes from anywhere else.
    expect(target.presses.map((one) => [one.subject, (one.item as { title?: string }).title, one.title])).toEqual(TITLES.map((title) => [title, title, title]));
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(target.reads).toBe(1);

    // The numbers: seven model calls and 0.65 of a cent to work it out, two calls and 0.15 of a cent to run it.
    expect(first.answer.attempt.spend).toMatchObject({ calls: 7, usd: expect.closeTo(0.0065, 8) });
    expect(second.answer.attempt.spend).toMatchObject({ calls: 2, usd: expect.closeTo(0.0015, 8) });
    expect(second.answer.attempt.spend.calls).toBeLessThan(first.answer.attempt.spend.calls);
    expect(second.answer.attempt.spend.usd).toBeLessThan(first.answer.attempt.spend.usd);

    const third = await lane.attempt(again);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(third.decisions).toEqual([]);
    expect(third.answer.attempt.spend.calls).toBe(second.answer.attempt.spend.calls);
    expect(third.answer.attempt.spend.usd).toBeCloseTo(second.answer.attempt.spend.usd, 8);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 3));

    const kept = await lane.kept(LOAN_TASK);
    expect(kept?.best?.provenWhole).toBe(true);
    const saved = automationStudioAnswerFirstSavedStateOf(kept);
    expect(saved).toMatchObject({ state: "ready", flowId: "flow.loans" });
    expect(parseAutomationStudioSavedState(saved).ok).toBe(true);
  });
});

describe("the Flow breaks", () => {
  it("at a step after the rows: the model is told the step and why, repairs it, and no row is pressed again by the walker after the engine", async () => {
    const { lane, target, site } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttemptWithCard());
    expect(target.library.renewals).toEqual({ ...onceEach(), card: 1 });
    const CARD_STEP = 4;
    site.cardControl = NEW_CARD_NAME;
    const callsBefore = target.library.calls.length;
    const second = await lane.attempt({
      instruction: BOTH_TASK, ...PERMITTED,
      script: [writeCardStep(NEW_CARD_NAME), putInPlaceOf(CARD_STEP, 6), forwardFrom(READ_STEP), complete("Renewed every loan and the card.")]
    });
    const told = toldTo(second.decisions[0])!;
    expect(told.flowRun).toMatchObject({ stoppedAt: CARD_STEP, happened: expect.stringMatching(/control was not found.*Fix that step, then run forward/su) });
    expect(JSON.stringify(told.flowRun)).not.toContain("Elm Street");
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair", ordinal: 2 });
    expect(second.answer.result?.source).toBe("both");
    // One each this attempt: the engine did the rows and the walker the card.
    expect(target.library.renewals).toEqual({ ...onceEach(TITLES, 2), card: 2 });
    expect(target.presses.map((one) => one.subject)).toEqual([...TITLES]);
    const walked = target.library.calls.slice(callsBefore).filter((call) => call.value.replay === "step" && (call.value.node === RENEW_LOAN || call.value.node === RENEW_CARD));
    expect(walked.map((call) => call.value.node)).toEqual([RENEW_CARD]);
    expect(second.answer.result?.acts).toHaveLength(5);
    expect(second.answer.result?.acts.every((act) => act.state === "landed")).toBe(true);
    expect((await lane.kept(BOTH_TASK))?.best?.provenWhole).toBe(false);

    const third = await lane.attempt({ instruction: BOTH_TASK, ...PERMITTED });
    expect(third.decisions).toEqual([]);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(target.library.renewals).toEqual({ ...onceEach(TITLES, 3), card: 3 });
    expect(automationStudioAnswerFirstSavedStateOf(await lane.kept(BOTH_TASK))).toMatchObject({ state: "ready" });
  });

  it("at the row's own step: the repair is forward on the rows, exactly once each, and attempt 3 runs the repaired Flow whole", async () => {
    const { lane, target, site } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    site.loanControl = LENGTHEN;
    const second = await lane.attempt({
      ...again,
      script: [writeLoanStep(LENGTHEN), { kind: "amend_draft", amendments: [{ step: LOAN_STEP, change: "drop" }, { step: 5, change: "reorder", to: LOAN_STEP }] }, repeatOverRows(LOAN_STEP, READ_STEP), forwardFrom(READ_STEP), complete("Renewed every loan.")]
    });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: LOAN_STEP });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair" });
    expect(target.presses).toEqual([]);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    const third = await lane.attempt(again);
    expect(third.decisions).toEqual([]);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(target.presses.map((one) => one.subject)).toEqual([...TITLES]);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 3));
  });

  it("and the repair does not work: the model carries on by hand to the result, the acts exact, and the task keeps the Flow the table says", async () => {
    const { lane, target, site } = await siteLane(cleanups);
    const first = await lane.attempt(honestFirstAttempt());
    site.loanControl = LENGTHEN;
    const second = await lane.attempt({
      ...again,
      script: [
        writeLoanStep("Prolong"),
        { kind: "amend_draft", amendments: [{ step: LOAN_STEP, change: "drop" }, { step: 5, change: "reorder", to: LOAN_STEP }] },
        repeatOverRows(LOAN_STEP, READ_STEP),
        forwardFrom(READ_STEP),
        ...TITLES.map((title, at) => pressLoanByHand(`hand.${at}`, title, LENGTHEN, {})),
        complete("Renewed every loan by hand.")
      ]
    });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(second.answer.result).toMatchObject({ source: "both", label: "confirmed" });
    expect(target.presses).toEqual([]);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    // Both confirmed, and the kept one just broke on the site as it stands: the next one is kept, and it has proven nothing whole.
    const kept = await lane.kept(LOAN_TASK);
    expect(kept?.best?.attemptId).toBe(second.answer.attempt.attemptId);
    expect(kept?.best?.attemptId).not.toBe(first.answer.attempt.attemptId);
    expect(kept?.best).toMatchObject({ label: "confirmed", provenWhole: false });
    expect(automationStudioAnswerFirstSavedStateOf(kept)).toMatchObject({ state: "partly_works", trust: "unproven" });
  });
});

describe("lasting acts across attempts", () => {
  /** Two rows done and two the target would not do yet, then the purse: a call held at four cents and billed at a tenth of one. */
  const twoOfFour = (site: { busy: Set<string> }) => {
    site.busy.add(CLOCKS);
    site.busy.add(DUNES);
    return { ...honestFirstAttempt(), costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true, script: honestFirstAttempt().script.slice(0, -1) };
  };

  it("a budget-out that did two of four: the same words do the other two and never the first two, and a further ask after an achieved one does all four again", async () => {
    const { lane, target, site } = await siteLane(cleanups);
    const first = await lane.attempt(twoOfFour(site));
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(target.library.renewals).toEqual({ [ATLAS]: 1, [BIRDS]: 1 });
    site.busy.clear();

    const second = await lane.attempt(again);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(target.presses.map((one) => one.subject)).toEqual([CLOCKS, DUNES]);
    expect(target.library.renewals).toEqual(onceEach());
    // All four are the task's: two carried and two made.
    expect(second.answer.result?.acts).toHaveLength(4);

    const third = await lane.attempt(again);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(target.presses.slice(2).map((one) => one.subject)).toEqual([...TITLES]);
  });

  it("three of one control, as asked: exactly three across a broken run and its repair", async () => {
    const TASK = "Renew the card three times on my library account.";
    const { lane, target, over } = await siteLane(cleanups);
    const first = await lane.attempt({ instruction: TASK, ...PERMITTED, script: [pressCardByHand("c1"), pressCardByHand("c2"), pressCardByHand("c3"), complete("Renewed it three times.")] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(target.library.renewals.card).toBe(3);
    let cardCalls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      cardCalls += 1;
      return cardCalls === 1 ? undefined : { status: "failed", route: "failed", message: "Not now.", failure: { category: "target_not_found", code: "library.not_now", retryable: false, stage: "target_resolution", effect: "unacted" } };
    });
    const FIRST_CARD_STEP = 2;
    const second = await lane.attempt({ instruction: TASK, ...PERMITTED, script: [forwardFrom(FIRST_CARD_STEP), complete("Renewed it three times.")] });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: FIRST_CARD_STEP + 1 });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair" });
    // One by the engine, then two by the walker from the first of the three, and its third pass only checks.
    expect(target.presses).toHaveLength(1);
    expect(target.library.renewals.card).toBe(6);
    expect(target.library.calls.filter((call) => call.value.replay === "verify" && call.value.node === RENEW_CARD)).toHaveLength(1);
  });
});

describe("a count carried across attempts", () => {
  it("three of one control, cut off by the purse after two: the same words press the third and no more", async () => {
    const TASK = "Renew the card three times on my library account.";
    const { lane, target } = await siteLane(cleanups);
    const first = await lane.attempt({ instruction: TASK, ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true, script: [pressCardByHand("c1"), pressCardByHand("c2")] });
    expect(first.answer.attempt.status).toBe("budget_out");
    expect(target.library.renewals.card).toBe(2);
    const second = await lane.attempt({ instruction: TASK, ...PERMITTED });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(target.presses).toHaveLength(1);
    expect(target.library.renewals.card).toBe(3);
  });
});

describe("limits on a saved Flow's run go on to the result", () => {
  const onlyTheRun = (attempt: { providersResolved: number; asked: readonly { taskKind: string }[] }) => {
    // Nothing asked for a second provider, and no model call of any other kind: a run's recovery and its result check are both unreached.
    expect(attempt.providersResolved).toBe(1);
    expect([...new Set(attempt.asked.map((request) => request.taskKind))].filter((kind) => kind !== "evidence_tool_decision" && kind !== "loop_verification")).toEqual([]);
  };

  it("the step bound, really tripped through the service: every attempt of a step counts, and a saved Flow of twelve steps here takes twenty-five each", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    let reads = 0;
    over(({ nodeId }) => {
      if (nodeId !== READ_LOANS) return undefined;
      reads += 1;
      return reads % 25 === 0 ? undefined : { status: "failed", route: "failed", message: "Not yet.", failure: { category: "target_not_found", code: "library.not_yet", retryable: true, stage: "target_resolution", effect: "unacted" } };
    });
    const steps = Array.from({ length: 12 }, (_, at) => savedStep(at + 1, READ_LOANS, { recordOutput: LOANS_OUTPUT, retry: { maxAttempts: 25, backoffMs: [0] } }));
    await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.long", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }), LOAN_TASK);
    const second = await lane.attempt({ ...again, script: [complete("Listed them.")] });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ happened: expect.stringMatching(/as many steps as it is allowed/u) });
    // Maximum step count exceeded at the engine's 250: ten steps finished, and the eleventh was on its last attempt.
    expect(reads).toBe(250);
    expect(target.reads).toBe(10);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    onlyTheRun(second);
  });

  it("the run's deadline: the attempt carries on, by hand, to the result", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    const flow = await lane.service.getFlow(lane.projectId, "flow.loans");
    await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow!, executionDefaults: { timeoutMs: 400 } } });
    over(({ nodeId }) => nodeId === READ_LOANS ? new Promise(() => undefined) : undefined);
    const second = await lane.attempt({ ...again, script: [readLoans("again", {}), complete("Listed them.")] });
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: READ_STEP, happened: expect.stringMatching(/time this Flow is allowed/u) });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(second.answer.result?.rows?.totalRows).toBe(4);
    expect(target.presses).toEqual([]);
    onlyTheRun(second);
  });

  it("a judge cut off by its deadline is not judged, and the attempt goes on to its result", async () => {
    const { lane, target } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    // The check's own two minutes, shortened: nothing else in here waits exactly that long.
    const wallClock = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((run: () => void, ms?: number, ...rest: unknown[]) => wallClock(run, ms === 120_000 ? 150 : ms, ...rest)) as unknown as typeof setTimeout);
    const second = await lane.attempt({ ...again, judge: [new Promise(() => undefined), judgeReply("yes")], script: [complete("Renewed every loan and listed them.")] });
    expect(second.judgeCalls).toHaveLength(2);
    expect(second.decisions).toHaveLength(1);
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ happened: expect.stringMatching(/not accepted as the result yet/u) });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    expect(second.answer.result).toMatchObject({ label: "confirmed", timesChecked: 1 });
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    onlyTheRun(second);
  });

  it("a whole run that holds asks for no provider beyond the attempt's own", async () => {
    const { lane } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    const second = await lane.attempt(again);
    onlyTheRun(second);
  });
});
