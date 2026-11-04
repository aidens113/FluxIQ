// @fluxiq-test-group real-sql
// A lasting act is not repeated when the engine's detached candidate run retries a step or is cut off,
// including when the act may have landed (t870). Each case goes through the real service to the
// attempt's end and counts real presses on the target.
//
// What the engine does, read from `engine/automation/`: a run's node keeps Core's default policy, the
// first attempt and three retries at 250 ms, 1 s and 2 s (`retry-policy.ts`, `step-loop/failed-attempt.ts`;
// `runAutomationStudioDetachedCandidate` sets no override). Whether a failure is retried is asked of the
// fault each time (`defensive/assess.ts`): a node whose step declared a consequence retries only a failure
// that states `effect: "unacted"`. Anything else is held back: a failure that may be retried becomes
// `actUncertain`, the effect check runs, and with no host to answer it the run stops as Outcome uncertain.
// One that may not be retried simply stops the run. Neither calls the node again.
//
// Provider-free: the model and the judge are scripts. What a look "shows" is read by the script, never
// by Core: Core only knows that a look ran.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/runtime";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstStepsDigest } from "../index.ts";
import { judgedNo } from "./endings/support.ts";
import { pressCard, pressLoan, savedStep, type LibraryNodeOver } from "./fake-library-engine.ts";
import { complete, LOOK_TOOL, RENEW_CARD, RENEW_LOAN, runNode, toolCall } from "./fake-library.ts";
import { toldTo } from "./later-attempts.ts";
import { CARD_TASK, cardFirstAttempt, honestFirstAttempt, LOAN_STEP, LOAN_TASK, onceEach, PERMITTED, READ_STEP } from "./honest-attempts.ts";
import { ATLAS, BIRDS, CLOCKS, DUNES, forwardFrom, ON_THE_CARD, pressCardByHand, RENEW, siteLane, TITLES, type Lane, type LibrarySays } from "./library-site.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CARD_STEP = 2;
const LOOK_FIRST = "attempt.act_look_first";
const ALREADY_DONE = "attempt.act_already_done";
const card = { instruction: CARD_TASK, ...PERMITTED };
const loans = { instruction: LOAN_TASK, ...PERMITTED };
const look = (callId = "look") => toolCall(callId, LOOK_TOOL, {});
const failed = (failure: JsonObject, message = "Page says: something went wrong on Elm Street 4") => ({ status: "failed" as const, route: "failed", message, failure: { category: "action_failed", code: "library.press_failed", ...failure } as AutomationStudioFailureRecord });
const shortRuns = async (lane: Lane) => {
  const flow = await lane.service.getFlow(lane.projectId, "flow.loans");
  await lane.service.saveFlow({ projectId: lane.projectId, flow: { ...flow!, executionDefaults: { timeoutMs: 400 } } });
};
/** Keeps what each decision was shown, since an assertion thrown inside a script reads as the model's call failing, and the rounds would go on. */
const shownTo = () => {
  const shown: string[] = [];
  const toldAll: (JsonObject | undefined)[] = [];
  return {
    shown, toldAll,
    then: (next: JsonObject | (() => JsonObject)) => (request: AutomationStudioLlmTaskRequest): JsonObject => {
      shown.push(JSON.stringify(request.context.evidenceLoop?.evidence ?? []));
      toldAll.push(toldTo(request));
      return typeof next === "function" ? next() : next;
    }
  };
};
const itemOf = (request: { inputs?: Record<string, unknown> | undefined }) => (request.inputs?.item as { title?: string } | undefined)?.title;
const passesIn = (lane: Lane, from: number) => lane.target.library.calls.slice(from).filter((call) => call.value.replay === "step" && call.value.node === RENEW_LOAN).map((call) => (call.value.item as { title: string }).title);
const actStates = (told: JsonObject | undefined) => ((told?.acts as { acts: { state: string; lookedSince?: boolean }[] }).acts);
/** A saved Flow of one press, written as an earlier attempt could have left it. */
const keepCardStep = async (lane: Lane, parameters: JsonObject, consequences?: string[]) => {
  await lane.attempt(cardFirstAttempt());
  const steps = [savedStep(CARD_STEP, RENEW_CARD, { control: ON_THE_CARD, ...parameters }, { ...(consequences ? { consequences } : {}), label: "Renew card" })];
  await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.kept", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }), CARD_TASK);
};
/** Waits until a Stop reaches the press, as the page would answer nothing before it. */
const answerAtTheStop = (signal: AbortSignal | undefined) => new Promise<ReturnType<typeof failed>>((resolve) => {
  const answer = () => resolve(failed({ retryable: true }));
  if (signal?.aborted) answer();
  else signal?.addEventListener("abort", answer, { once: true });
});

describe("(a) the press failed before it acted", () => {
  it("the engine retries it, it presses once in the end, and the attempt reaches its result", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    let calls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      return calls === 1 ? failed({ retryable: true, effect: "unacted", stage: "dispatch" }) : undefined;
    });
    const second = await lane.attempt(card);
    expect(calls).toBe(2);
    expect(target.presses).toHaveLength(1);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(target.library.renewals.card).toBe(2);
  });

  it("the policy is the default's: four calls of the node, over about three and a quarter seconds, and then the rounds carry on", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    const at: number[] = [];
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      at.push(Date.now());
      return failed({ retryable: true, effect: "unacted", stage: "dispatch" });
    });
    const second = await lane.attempt({ ...card, script: [pressCardByHand("again", ON_THE_CARD, {}), complete("Renewed the card.")] });
    expect(at).toHaveLength(4);
    expect(at.at(-1)! - at[0]!).toBeGreaterThanOrEqual(3_200);
    expect(target.presses).toEqual([]);
    expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: CARD_STEP });
    expect(target.library.renewals.card).toBe(2);
    expect(second.answer.attempt.status).toBe("achieved");
  });
});

describe("(b) the press landed and the answer is an error or was thrown: the classic double act", () => {
  const answers: Array<[string, () => ReturnType<typeof failed>, boolean]> = [
    ["a retryable error that says nothing of what happened", () => failed({ retryable: true }), true],
    ["a retryable error found after acting", () => failed({ retryable: true, stage: "confirmation" }), true],
    ["a retryable error stated as ambiguous", () => failed({ retryable: true, effect: "ambiguous" }), true],
    ["an error that may not be retried", () => failed({ retryable: false }), false],
    // The native runtime turns a throw into a failed answer that holds only its message.
    ["a throw", () => { throw new Error("The line went dead on Elm Street 4"); }, false]
  ];
  for (const [what, answer, uncertain] of answers) {
    it(`${what}: the engine's own guard stops it, with one call of the node and one press`, async () => {
      const { lane, target, over } = await siteLane(cleanups);
      await lane.attempt(cardFirstAttempt());
      let calls = 0;
      over(({ nodeId }) => {
        if (nodeId !== RENEW_CARD) return undefined;
        calls += 1;
        pressCard(target);
        return answer();
      });
      const said = lane.said.length;
      const second = await lane.attempt({ ...card, script: [complete("The page shows it renewed.")] });
      // Never asked again: the engine stopped first, so the gate was never reached a second time.
      expect(calls).toBe(1);
      expect(lane.said.slice(said).some((line) => /Outcome uncertain/u.test(line))).toBe(uncertain);
      expect(target.library.renewals.card).toBe(2);
      expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: CARD_STEP });
      expect(JSON.stringify(toldTo(second.decisions[0])?.flowRun)).not.toContain("Elm Street");
      expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
      expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_explore" });
    });
  }

  it("where a host's check says it did not land, the engine does go again, and the gate is what stops the press: nothing is sent, and it reads as done until a judge says no", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    lane.service.bindHostRuntime({ capabilities: [], actLanded: async () => "not_landed" as const });
    let calls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      return failed({ retryable: true });
    });
    const told = shownTo();
    const second = await lane.attempt({ ...card, judge: [judgedNo("The card was not renewed.")], script: [told.then(pressCardByHand("refused", ON_THE_CARD, {})), look("sees.nothing"), pressCardByHand("by.hand", ON_THE_CARD, {}), complete("Renewed the card.")] });
    // The retry reached the gate, which answered it without sending: the node's door was reached once. It is "too little", on the safe side.
    expect(calls).toBe(1);
    expect(target.presses).toEqual([]);
    expect(second.judgeCalls).toHaveLength(2);
    expect(actStates(told.toldAll[0])).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(target.library.renewals.card).toBe(2);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("known limit: a target that says nothing happened is believed by the engine and the record alike, so a press that landed and says `unacted` presses again", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    let calls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      if (calls > 1) return undefined;
      pressCard(target);
      return failed({ retryable: true, effect: "unacted" });
    });
    await lane.attempt(card);
    expect(calls).toBe(2);
    expect(target.library.renewals.card).toBe(3);
  });
});

describe("a press whose step declared nothing", () => {
  it("the target's own `ambiguous` holds the act: the engine does not repeat it, and a repair's by-hand press waits for a look", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await keepCardStep(lane, {});
    let calls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      pressCard(target);
      return failed({ retryable: true, effect: "ambiguous" });
    });
    site.blind = true;
    const told = shownTo();
    const second = await lane.attempt({ ...card, script: [
      runNode("again", RENEW_CARD, { control: ON_THE_CARD }, [], {}),
      told.then(() => {
        site.blind = false;
        return complete("The page shows it renewed.");
      })
    ] });
    expect(calls).toBe(1);
    expect(target.library.renewals.card).toBe(2);
    expect(told.shown[0]).toContain(LOOK_FIRST);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("known limit: with no word from the target, the engine repeats a step that declared nothing, since nothing says it acts", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await keepCardStep(lane, {});
    let calls = 0;
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      if (calls > 1) return undefined;
      pressCard(target);
      return failed({ retryable: true });
    });
    await lane.attempt(card);
    expect(calls).toBe(2);
    expect(target.library.renewals.card).toBe(3);
  });
});

describe("(c) the press landed and the answer is lost to the run's deadline", () => {
  it("it is on the persisted record before it is sent and stays may-have-landed; a by-hand press and a forward run are refused until a look; after one that shows it landed, it is not pressed", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    await shortRuns(lane);
    const seen: { onRecord?: unknown } = {};
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      return (async () => {
        seen.onRecord = (await lane.actsOn())?.acts.map((act) => act.state);
        pressCard(target);
        return await new Promise<never>(() => undefined);
      })();
    });
    site.blind = true;
    const told = shownTo();
    const second = await lane.attempt({ ...card, script: [
      told.then(runNode("blind", RENEW_CARD, { control: ON_THE_CARD }, ["modify_existing"], {})),
      told.then(() => {
        site.blind = false;
        return look("sees.it");
      }),
      told.then(forwardFrom(CARD_STEP)),
      complete("The page shows it renewed.")
    ] });
    expect(seen.onRecord).toEqual(["may_have_landed"]);
    expect(actStates(told.toldAll[0])).toEqual([expect.objectContaining({ state: "may_have_landed", lookedSince: false })]);
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(told.shown[2]).toContain('"renewed":2');
    // One press in this attempt: the engine's, whose answer never came. The forward run only checked.
    expect(target.presses).toHaveLength(1);
    expect(target.library.renewals.card).toBe(2);
    expect(target.library.calls.filter((call) => call.value.node === RENEW_CARD && call.value.replay === "step")).toEqual([]);
    expect(target.library.calls.filter((call) => call.value.node === RENEW_CARD && call.value.replay === "verify")).toHaveLength(1);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("after a look that shows it did not land, it is pressed once, and a second press is refused as done", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    await shortRuns(lane);
    // Sent, and the page never took it.
    over(({ nodeId }) => nodeId === RENEW_CARD ? new Promise(() => undefined) : undefined);
    const told = shownTo();
    const second = await lane.attempt({ ...card, script: [
      told.then(pressCardByHand("refused", ON_THE_CARD, {})),
      told.then(look("sees.nothing")),
      pressCardByHand("once", ON_THE_CARD, {}),
      pressCardByHand("twice", ON_THE_CARD, {}),
      told.then(complete("Renewed the card."))
    ] });
    expect(told.shown[0]).toContain('"renewed":1');
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(told.shown[2]).toContain(ALREADY_DONE);
    expect(target.library.renewals.card).toBe(2);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });
});

describe("what a look can and cannot do", () => {
  const landedAndLost = async () => {
    const parts = await siteLane(cleanups);
    await parts.lane.attempt(cardFirstAttempt());
    await shortRuns(parts.lane);
    parts.over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      pressCard(parts.target);
      return new Promise(() => undefined);
    });
    return parts;
  };

  it("the round's own opening look opens nothing: a careless model's first press is refused and sent nowhere, and one that then reads the page and stops presses nothing", async () => {
    const { lane, target } = await landedAndLost();
    const told = shownTo();
    const second = await lane.attempt({ ...card, script: [
      told.then(pressCardByHand("careless", ON_THE_CARD, {})),
      told.then(look("reads.it")),
      told.then(complete("The page shows it renewed."))
    ] });
    // The opening look had run, and said two.
    expect(told.shown[0]).toContain('"renewed":2');
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(told.shown[2]).toContain('"renewed":2');
    expect(target.presses).toHaveLength(1);
    expect(target.library.renewals.card).toBe(2);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("known limit: a look after the refusal opens it, and from there pressing is the model's own reading, since Core does not read what a look shows", async () => {
    const { lane, target } = await landedAndLost();
    const told = shownTo();
    await lane.attempt({ ...card, script: [
      pressCardByHand("careless", ON_THE_CARD, {}),
      look("reads.it"),
      told.then(pressCardByHand("all.the.same", ON_THE_CARD, {})),
      complete("Renewed the card.")
    ] });
    // Refused and told, shown two, and it pressed all the same.
    expect(told.shown[0]).toContain(LOOK_FIRST);
    expect(told.shown[0]).toContain('"renewed":2');
    expect(target.library.renewals.card).toBe(3);
  });

  it("a held row stays out of a forward run whatever was looked at", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    await shortRuns(lane);
    over((request) => {
      if (request.nodeId !== RENEW_LOAN || itemOf(request) !== BIRDS) return undefined;
      pressLoan(target, request.inputs ?? {}, request.parameters ?? {});
      return new Promise(() => undefined);
    });
    const from = target.library.calls.length;
    await lane.attempt({ ...loans, script: [look("first"), look("second"), forwardFrom(READ_STEP), complete("Renewed every loan.")] });
    expect(passesIn(lane, from)).not.toContain(BIRDS);
    expect(target.library.renewals[BIRDS]).toBe(2);
  });

  it("a process that died mid-press behaves the same: its first press is refused whatever looks came before", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    let reached = (): void => undefined;
    const pressed = new Promise<void>((resolve) => { reached = resolve; });
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      pressCard(target);
      reached();
      return new Promise(() => undefined);
    });
    const abandoned = lane.attempt(card);
    await pressed;
    const restarted = await siteLane(cleanups, { site, restart: lane.restart() });
    const told = shownTo();
    // The saved Flow sends nothing and reads as done; a judge's no is what brings a model to it by hand.
    await restarted.lane.attempt({ ...card, judge: [judgedNo("The card was not renewed.")], script: [look("opening"), told.then(pressCardByHand("careless", ON_THE_CARD, {})), told.then(complete("Renewed."))] });
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(target.library.renewals.card).toBe(2);
    expect(target.presses).toHaveLength(1);
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    await abandoned.catch(() => undefined);
  });
});

describe("(d) a verification failure after an answered press", () => {
  const CHECKED = { expectedState: { conditions: [{ text: "Renewed" }], mode: "all", timeoutMs: 1 } };

  it("a repair's retry is not told it already happened for ever, and does not press blind", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await keepCardStep(lane, CHECKED, ["modify_existing"]);
    lane.service.bindHostRuntime({ capabilities: [], expectationEvaluator: async () => ({ passed: false, checkedConditionCount: 1, message: "It did not show." }) });
    let calls = 0;
    // It answered success, and the page did not take it.
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      calls += 1;
      return { status: "success", route: "success", outputs: { success: true } };
    });
    site.blind = true;
    const told = shownTo();
    const second = await lane.attempt({ ...card, script: [
      told.then(pressCardByHand("blind", ON_THE_CARD, {})),
      told.then(() => {
        site.blind = false;
        return look("sees.nothing");
      }),
      told.then(pressCardByHand("after.a.look", ON_THE_CARD, {})),
      complete("Renewed the card.")
    ] });
    // One call of the node: a lasting act rejected after answering success is not made again by the engine.
    expect(calls).toBe(1);
    expect(actStates(told.toldAll[0])).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(told.shown[2]).toContain('"renewed":1');
    expect(target.library.renewals.card).toBe(2);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed" })]);
    expect(second.answer.attempt.status).toBe("achieved");
  });
});

describe("(e) the same on a repeat over rows: other rows go ahead, and only the row in doubt waits", () => {
  const onBirds = (lane: Lane, answer: () => ReturnType<typeof failed> | Promise<never>): LibraryNodeOver => (request) => {
    if (request.nodeId !== RENEW_LOAN || itemOf(request) !== BIRDS) return undefined;
    pressLoan(lane.target, request.inputs ?? {}, request.parameters ?? {});
    return answer();
  };
  const cases: Array<[string, () => ReturnType<typeof failed> | Promise<never>]> = [
    ["an error", () => failed({ retryable: true })],
    ["a throw", () => { throw new Error("The line went dead."); }],
    ["the run's deadline", () => new Promise<never>(() => undefined)]
  ];
  for (const [what, answer] of cases) {
    it(`the answer lost to ${what}: a forward run does the rows not reached, never the one in doubt and never the one done`, async () => {
      const { lane, target, over } = await siteLane(cleanups);
      await lane.attempt(honestFirstAttempt());
      if (what.includes("deadline")) await shortRuns(lane);
      over(onBirds(lane, answer));
      const from = target.library.calls.length;
      const second = await lane.attempt({ ...loans, script: [forwardFrom(READ_STEP), complete("Renewed every loan.")] });
      expect(toldTo(second.decisions[0])?.flowRun).toMatchObject({ stoppedAt: LOAN_STEP });
      expect(target.presses.map((one) => one.subject)).toEqual([ATLAS, BIRDS]);
      expect(passesIn(lane, from)).toEqual([CLOCKS, DUNES]);
      expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
      expect(second.answer.result?.acts.map((act) => act.state).sort()).toEqual(["landed", "landed", "landed", "may_have_landed"]);
      expect(second.answer.attempt.status).toBe("achieved");
    });
  }

  it("a by-hand press by a printed handle: the row done is refused whatever shape it was pressed in, and the row in doubt goes once after a look", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    // Sent for Birds, and the page never took it.
    over((request) => request.nodeId === RENEW_LOAN && itemOf(request) === BIRDS ? failed({ retryable: true }) : undefined);
    const byHandle = (title: string, callId: string) => () => {
      const handle = [...site.handles].filter(([, row]) => row === title).at(-1)![0];
      return runNode(callId, RENEW_LOAN, { target: { handle } }, ["modify_existing"], {});
    };
    const told = shownTo();
    const second = await lane.attempt({ ...loans, script: [
      forwardFrom(READ_STEP),
      byHandle(ATLAS, "atlas.again"),
      told.then(byHandle(BIRDS, "birds.refused")),
      told.then(look("sees.nothing")),
      byHandle(BIRDS, "birds.once"),
      byHandle(BIRDS, "birds.twice"),
      told.then(complete("Renewed every loan."))
    ] });
    expect(told.shown[0]).toContain(ALREADY_DONE);
    expect(told.shown[1]).toContain(LOOK_FIRST);
    expect(told.shown[2]).toContain(ALREADY_DONE);
    // Atlas by the engine, the last two by the walker, and Birds, which the engine never landed, once by hand.
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("the row in doubt: a by-hand press is refused until a look, a forward run leaves it out before and after one, and it goes once by hand when the look shows it did not land", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    // Sent for Birds, and the page never took it.
    over((request) => request.nodeId === RENEW_LOAN && itemOf(request) === BIRDS ? failed({ retryable: true }) : undefined);
    const birds = (callId: string) => runNode(callId, RENEW_LOAN, { title: BIRDS, control: RENEW }, ["modify_existing"], {});
    site.blind = true;
    const from = target.library.calls.length;
    const told = shownTo();
    const second = await lane.attempt({ ...loans, script: [
      birds("blind"),
      told.then(() => {
        site.blind = false;
        return forwardFrom(READ_STEP);
      }),
      told.then(birds("once")),
      birds("twice"),
      told.then(complete("Renewed every loan."))
    ] });
    expect(told.shown[0]).toContain(LOOK_FIRST);
    // The walker's own read is the look; the row in doubt was left out all the same, and the rows not reached went.
    expect(passesIn(lane, from)).toEqual([CLOCKS, DUNES]);
    expect(told.shown[2]).toContain(ALREADY_DONE);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(target.library.calls.slice(from).filter((call) => call.value.node === RENEW_LOAN && call.value.replay === undefined).map((call) => (call.value.parameters as { title?: string }).title)).toEqual([BIRDS]);
    expect(second.answer.attempt.status).toBe("achieved");
  });

  it("a by-hand press with the same values as a row the run pressed is refused, across the engine's binding", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    over((request) => request.nodeId === RENEW_LOAN && itemOf(request) === BIRDS ? failed({ retryable: false, category: "target_not_found", effect: "unacted" }) : undefined);
    const told = shownTo();
    await lane.attempt({ ...loans, script: [runNode("atlas", RENEW_LOAN, { title: ATLAS, control: RENEW }, ["modify_existing"], {}), told.then(complete("Done."))] });
    expect(told.shown[0]).toContain(ALREADY_DONE);
    expect(target.library.renewals[ATLAS]).toBe(2);
  });

  describe("a by-hand press by a handle no read printed, which the domain can say something of before it is sent", () => {
    /** The run presses Atlas and fails on Birds, whose press never acted; the press by hand names `t12` on the row given, with what the domain says of it. */
    const pressByHandle = async (title: string, says: LibrarySays) => {
      const { lane, target, site, over } = await siteLane(cleanups);
      await lane.attempt(honestFirstAttempt());
      over((request) => request.nodeId === RENEW_LOAN && itemOf(request) === BIRDS ? failed({ retryable: false, category: "target_not_found", effect: "unacted" }) : undefined);
      // The web domain's rows print no handles today: its press names a control the record cannot tie to a row until the answer.
      site.handles.set("t12", title);
      site.says = (call) => (call.value.parameters as { target?: { handle?: string } } | undefined)?.target?.handle === "t12" ? says(call) : undefined;
      const told = shownTo();
      await lane.attempt({ ...loans, script: [runNode("by.hand", RENEW_LOAN, { target: { handle: "t12" } }, ["modify_existing"], {}), told.then(complete("Done."))] });
      return { told, target };
    };

    it("by the address it would run with, and the words of its control: refused, on a row the run pressed", async () => {
      const { told, target } = await pressByHandle(ATLAS, () => ({ target: `${RENEW} ${ATLAS}`, wouldRunWith: { title: ATLAS, control: RENEW } }));
      expect(told.shown[0]).toContain(ALREADY_DONE);
      expect(target.library.renewals[ATLAS]).toBe(2);
    });

    it("by the words of its control alone: refused", async () => {
      const { told, target } = await pressByHandle(ATLAS, () => ({ target: `${RENEW} ${ATLAS}` }));
      expect(told.shown[0]).toContain(ALREADY_DONE);
      expect(target.library.renewals[ATLAS]).toBe(2);
    });

    it("by the row's words its fingerprint holds, on a control named the same on every row: refused", async () => {
      const { told, target } = await pressByHandle(ATLAS, () => ({ target: RENEW, wouldRunWith: { element: { label: RENEW, context: { within: { words: `${ATLAS} due soon` } } } } }));
      expect(told.shown[0]).toContain(ALREADY_DONE);
      expect(target.library.renewals[ATLAS]).toBe(2);
    });

    it("the same control on a row not pressed goes: its words fit that row", async () => {
      const { told, target } = await pressByHandle(BIRDS, () => ({ target: `${RENEW} ${BIRDS}`, wouldRunWith: { element: { label: RENEW, context: { within: { words: BIRDS } } } } }));
      expect(told.shown[0]).not.toContain(ALREADY_DONE);
      expect(target.library.renewals[BIRDS]).toBe(2);
    });

    it("a control with no row's words stays admitted on a row not pressed, though its fingerprint is the one the run pressed", async () => {
      const { told, target } = await pressByHandle(BIRDS, () => ({ target: RENEW, wouldRunWith: { element: { label: RENEW } } }));
      expect(told.shown[0]).not.toContain(ALREADY_DONE);
      expect(target.library.renewals[BIRDS]).toBe(2);
    });

    it("known limit: a control with no row's words and no address is admitted on a row the run pressed, since nothing says which row it is on", async () => {
      const { told, target } = await pressByHandle(ATLAS, () => ({ target: RENEW, wouldRunWith: { element: { label: RENEW } } }));
      expect(told.shown[0]).not.toContain(ALREADY_DONE);
      expect(target.library.renewals[ATLAS]).toBe(3);
    });

    it("a domain that cannot say goes as it did: a handle it cannot resolve is admitted, and nothing stops", async () => {
      const { told, target } = await pressByHandle(BIRDS, () => undefined);
      expect(told.shown[0]).not.toContain(ALREADY_DONE);
      expect(target.library.renewals[BIRDS]).toBe(2);
    });

  });

  it("a press by a new handle on a control with no row, which already landed by hand: refused by the same whole form", async () => {
    const { lane, target, site } = await siteLane(cleanups);
    site.says = (call) => (call.value.parameters as { target?: { handle?: string } } | undefined)?.target?.handle === "t7" ? { target: ON_THE_CARD, wouldRunWith: { control: ON_THE_CARD } } : undefined;
    const told = shownTo();
    await lane.attempt({ ...card, script: [pressCardByHand("first", ON_THE_CARD), runNode("again", RENEW_CARD, { target: { handle: "t7" } }, ["modify_existing"], {}), told.then(complete("Renewed the card."))] });
    expect(told.shown[0]).toContain(ALREADY_DONE);
    expect(target.library.renewals.card).toBe(1);
  });
});

describe("(f) a Flow run cut off by a Stop mid-press, then a new ask with the same words", () => {
  it("not pressed twice, on one press", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    over(({ nodeId, signal }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      pressCard(target);
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return answerAtTheStop(signal);
    });
    const stopped = await lane.attempt(card);
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    expect(target.library.renewals.card).toBe(2);
    over();
    const after = await lane.attempt(card);
    expect(target.library.renewals.card).toBe(2);
    expect(target.presses).toHaveLength(1);
    expect(after.answer.attempt.status).toBe("achieved");
    expect(after.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    // Its one step was refused as already done, so nothing went out: the judge's yes says the task is done, and nothing of the Flow.
    expect(after.answer.attempt.liveSteps).toBe(0);
    expect((await lane.kept(CARD_TASK))?.best?.provenWhole).toBe(false);
  });

  it("not pressed twice, on a repeat: the row done and the one in doubt stay as they are, and the rest go", async () => {
    const { lane, target, over } = await siteLane(cleanups);
    await lane.attempt(honestFirstAttempt());
    over((request) => {
      if (request.nodeId !== RENEW_LOAN || itemOf(request) !== BIRDS) return undefined;
      pressLoan(target, request.inputs ?? {}, request.parameters ?? {});
      lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
      return answerAtTheStop(request.signal);
    });
    const stopped = await lane.attempt(loans);
    expect(stopped.answer.attempt.status).toBe("stopped_by_person");
    over();
    const after = await lane.attempt(loans);
    expect(target.presses.map((one) => one.subject)).toEqual([...TITLES]);
    expect(target.library.renewals).toEqual(onceEach(TITLES, 2));
    expect(after.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow" });
    expect(DUNES).toBe(target.presses.at(-1)?.subject);
  });

  it("not pressed twice when the process dies mid-press: what is on the record was written before it was sent", async () => {
    const { lane, target, site, over } = await siteLane(cleanups);
    await lane.attempt(cardFirstAttempt());
    let reached = (): void => undefined;
    const pressed = new Promise<void>((resolve) => { reached = resolve; });
    over(({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      pressCard(target);
      reached();
      return new Promise(() => undefined);
    });
    // Nobody stops it: as a killed process leaves one, it writes nothing more.
    const abandoned = lane.attempt(card);
    await pressed;
    const restarted = await siteLane(cleanups, { site, restart: lane.restart() });
    const after = await restarted.lane.attempt({ ...card, script: [complete("Renewed.")] });
    expect(target.library.renewals.card).toBe(2);
    expect(after.answer.attempt.status).toBe("achieved");
    expect(after.answer.result?.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    // The old one goes when the test does, as its process would have.
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    await abandoned.catch(() => undefined);
  });
});
