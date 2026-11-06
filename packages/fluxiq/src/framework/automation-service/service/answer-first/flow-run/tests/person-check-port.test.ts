// @fluxiq-test-group real-sql
// A check only a person can clear, met part way through a saved Flow's run: it is put to the person
// where it stands, waited on with no clock, and the run goes on from that step. Any other question
// (a permission, a PIN) still reaches nobody. The port alone on Core's real conversation port, then
// the run on the real engine and a real service. A lending library stands in; no model, no browser.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioConversationParkingHost } from "../../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioConversationAsk } from "../../../../../../runtime/conversations/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, automationStudioAskEffect, automationStudioConversationParkingPort, automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft, type AutomationStudioAsk, type AutomationStudioAskDraft, type AutomationStudioParkingPort } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstFlowRunAssemble, automationStudioAnswerFirstFlowRunPersonCheckPort, type AutomationStudioAnswerFirstFlowRunPorts } from "../index.ts";
import { CLOSE_PROMPT, flowRunFixture, libraryTarget, LOANS_OUTPUT, savedStep, type LibraryNodeOver } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const WAITING = "This step stopped for a person's answer, and a saved Flow's run asks nobody part way through.";
const checkAsk = (askId: string): AutomationStudioAsk => automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({ askId }), askId }, { stage: "execution" });

/** An ask as the thread holds it once opened, pending. */
function storedOf(ask: AutomationStudioAsk): AutomationStudioConversationAsk {
  return {
    askId: ask.askId, conversationId: "conversation.1", turnId: "turn.1", kind: ask.kind, status: "pending", parks: ask.parks,
    timeoutMs: ask.timeoutMs ?? null, onTimeout: ask.onTimeout ?? null, options: ask.options ? [...ask.options] : null, routes: ask.routes ?? null,
    consequences: ask.consequences ? [...ask.consequences] : null, missing: null, control: ask.control ?? null, permissionRequest: null, createdAt: 0, answer: null
  };
}

/** A person on the Flow's thread who presses Continue on a check, or never answers until the run is stopped. */
function person(answers: "continue" | "stop" | "never") {
  const opened: AutomationStudioAsk[] = [];
  const waits: { state: "started" | "ended"; waitedMs: number }[] = [];
  const awaited: { expiresAtMs?: number; signal?: AbortSignal }[] = [];
  let answered = false;
  let stops = 0;
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask, wait) => {
      awaited.push(wait);
      if (answers === "continue" || answers === "stop") {
        answered = true;
        return { askId: ask.askId, answeredAt: Date.now(), kind: "choice", value: answers === "stop" ? AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION : AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, actorId: "person" };
      }
      await new Promise<void>((resolve) => {
        if (wait.signal?.aborted) resolve();
        wait.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return undefined;
    }
  };
  const personCheck: NonNullable<AutomationStudioAnswerFirstFlowRunPorts["personCheck"]> = { port, waiting: (state, waitedMs) => { waits.push({ state, waitedMs }); }, stopped: () => { stops += 1; } };
  return { personCheck, opened, waits, awaited, answered: () => answered, stops: () => stops };
}

/** Steps 1 and 3 read the loans; step 2 presses the card, where the page shows a check until the person has cleared it. */
const threeSteps = () => [savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }), savedStep(2, RENEW_CARD, { control: "Renew" }), savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT })];

describe("the run's port", () => {
  it("waits on Core's conversation port with no clock: ten minutes pass and nothing expires, and the person's Continue is what ends it", async () => {
    vi.useFakeTimers();
    let stored: AutomationStudioConversationAsk | null = null;
    const expireAsk = vi.fn(async ({ askId }: { askId: string }) => {
      stored = { ...storedOf(checkAsk(askId)), status: "expired" };
      return stored;
    });
    const host: AutomationStudioConversationParkingHost = {
      writerFor: () => {
        throw new Error("not used: the person's thread is written through `opened` below");
      },
      getAsk: async () => stored,
      expireAsk
    };
    const thread = automationStudioConversationParkingPort({ host, projectId: "project", subject: { kind: "flow", id: "flow" } });
    const opened: AutomationStudioAsk[] = [];
    // The thread as a person reads it: what is opened is stored as it was written, and waited on through Core's own port.
    const conversation: AutomationStudioParkingPort = {
      open: (ask) => {
        opened.push(ask);
        stored = storedOf(ask);
      },
      awaitAnswer: thread.awaitAnswer!
    };
    const waits: string[] = [];
    const port = automationStudioAnswerFirstFlowRunPersonCheckPort({ port: conversation, waiting: (state) => { waits.push(state); } }, () => undefined, () => undefined)!;
    const ask = checkAsk("check.1");
    await port.open(ask);
    expect(opened).toEqual([expect.objectContaining({ control: expect.objectContaining({ kind: AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND }), timeoutMs: null, onTimeout: null })]);
    let settled = false;
    // What the engine hands it: the ask's own five minutes (`engine/automation/step-loop/ask-or-park.ts`).
    const answering = port.awaitAnswer!(ask, { expiresAtMs: Date.now() + 300_000 }).then((answer) => {
      settled = true;
      return answer;
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(settled).toBe(false);
    expect(expireAsk).not.toHaveBeenCalled();
    expect(waits).toEqual(["started"]);
    stored = { ...storedOf(opened[0]!), status: "answered", answer: { askId: ask.askId, answeredAt: Date.now(), kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, actorId: "person" } };
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await answering).toMatchObject({ kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION });
    expect(waits).toEqual(["started", "ended"]);
    // The same wait on the bare port does run out: the clock this port takes off is real.
    stored = storedOf(ask);
    const bare = thread.awaitAnswer!(ask, { expiresAtMs: Date.now() + 300_000 });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await bare).toBeUndefined();
    expect(expireAsk).toHaveBeenCalledTimes(1);
  });

  it("refuses any other parked question as it is opened, tells nobody, and lets a question nobody waits on pass", async () => {
    const asker = person("continue");
    let refused = 0;
    const port = automationStudioAnswerFirstFlowRunPersonCheckPort(asker.personCheck, () => { refused += 1; }, () => undefined)!;
    const permission: AutomationStudioAsk = { askId: "permission.1", kind: "permission", parks: true, text: "Allow deleting the card?", consequences: ["delete"], status: "pending", raisedBy: { stage: "execution" } };
    const pin: AutomationStudioAsk = { askId: "pin.1", kind: "open", parks: true, text: "Enter your PIN.", control: { name: "PIN", kind: "pin" }, status: "pending", raisedBy: { stage: "execution" } };
    await expect(port.open(permission)).rejects.toThrow(/asks a person only to clear a check/u);
    await expect(port.open(pin)).rejects.toThrow(/asks a person only to clear a check/u);
    await expect(port.awaitAnswer!(pin, {})).rejects.toThrow(/asks a person only to clear a check/u);
    await port.open({ ...permission, askId: "notice.1", parks: false });
    expect(refused).toBe(2);
    expect(asker.opened).toEqual([]);
    expect(asker.awaited).toEqual([]);
  });

  it("is no port at all where nobody can be asked, or where the thread cannot hold a run in place", () => {
    expect(automationStudioAnswerFirstFlowRunPersonCheckPort(undefined, () => undefined, () => undefined)).toBeUndefined();
    expect(automationStudioAnswerFirstFlowRunPersonCheckPort({ port: { open: () => undefined }, waiting: () => undefined }, () => undefined, () => undefined)).toBeUndefined();
  });
});

describe("a saved Flow's run that meets a check only a person can clear", () => {
  it("puts it to the person where it stands, and once they press Continue goes on from that step to the end", async () => {
    const target = libraryTarget();
    const asker = person("continue");
    target.over = ({ nodeId }) => nodeId !== RENEW_CARD || asker.answered() ? undefined : { status: "failed", route: "failed", message: "A robot check covers the page.", failure: { category: "user_intervention_required", code: "library.robot_check", retryable: false } };
    const fixture = await flowRunFixture({ target }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun({ ...fixture.ports, personCheck: asker.personCheck }, { steps: threeSteps(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(asker.opened).toHaveLength(1);
    expect(asker.opened[0]).toMatchObject({ control: { kind: AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND }, timeoutMs: null, onTimeout: null });
    // No clock reaches the person's wait.
    expect(asker.awaited).toEqual([{ signal: expect.any(AbortSignal) }]);
    expect(asker.waits.map((wait) => wait.state)).toEqual(["started", "ended"]);
    // On from that step: the first read is not run again, and the step after the check runs once.
    expect(fixture.target.reads).toBe(2);
    expect(fixture.asked).toEqual([]);
  });

  it("tells the attempt and halts the run when the person presses Stop on the check, and neither when they press Continue", async () => {
    const check = checkAsk("check.stop");
    const stopper = person("stop");
    let halts = 0;
    const stopping = automationStudioAnswerFirstFlowRunPersonCheckPort(stopper.personCheck, () => undefined, () => { halts += 1; })!;
    await stopping.open(check);
    expect(await stopping.awaitAnswer!(check, {})).toMatchObject({ kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION });
    expect(stopper.stops()).toBe(1);
    expect(halts).toBe(1);
    const continuer = person("continue");
    const continuing = automationStudioAnswerFirstFlowRunPersonCheckPort(continuer.personCheck, () => undefined, () => { halts += 1; })!;
    await continuing.open(check);
    await continuing.awaitAnswer!(check, {});
    expect(continuer.stops()).toBe(0);
    expect(halts).toBe(1);
  });

  it("a Stop on a check mid-run is told to the attempt and ends the run there as stopped", async () => {
    const target = libraryTarget();
    const asker = person("stop");
    target.over = ({ nodeId }) => nodeId !== RENEW_CARD ? undefined : { status: "failed", route: "failed", message: "A robot check covers the page.", failure: { category: "user_intervention_required", code: "library.robot_check", retryable: false } };
    const fixture = await flowRunFixture({ target }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun({ ...fixture.ports, personCheck: asker.personCheck }, { steps: threeSteps(), stepsDigest: "digest.saved" });
    expect(asker.stops()).toBe(1);
    expect(outcome).toEqual({ kind: "stopped" });
    expect(fixture.target.reads).toBe(1);
  });

  it("leaves the run waiting while nobody answers, with no timeout, until the person's Stop", async () => {
    const target = libraryTarget();
    target.over = ({ nodeId }) => nodeId !== RENEW_CARD ? undefined : { status: "failed", route: "failed", message: "A robot check covers the page.", failure: { category: "user_intervention_required", code: "library.robot_check", retryable: false } };
    const asker = person("never");
    const fixture = await flowRunFixture({ target }, cleanups);
    let ended = false;
    const running = automationStudioAnswerFirstFlowRun({ ...fixture.ports, personCheck: asker.personCheck }, { steps: threeSteps(), stepsDigest: "digest.saved" }).finally(() => { ended = true; });
    while (!asker.awaited.length) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ended).toBe(false);
    expect(asker.waits).toEqual([{ state: "started", waitedMs: 0 }]);
    expect(asker.awaited[0]?.expiresAtMs).toBeUndefined();
    expect(asker.opened[0]?.timeoutMs).toBeNull();
    expect(fixture.target.reads).toBe(1);
    fixture.stop.abort();
    expect(await running).toEqual({ kind: "stopped" });
    expect(asker.waits.map((wait) => wait.state)).toEqual(["started", "ended"]);
    expect(fixture.target.reads).toBe(1);
  });
});

describe("a check whose step has a failed route that presses something", () => {
  /** Read; close a prompt, where the check stands, and when that fails press the card instead; read again. */
  const failedRouteSteps = () => [
    savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }),
    savedStep(2, CLOSE_PROMPT, { control: "Close" }, { routing: { kind: "on_failed", to: "saved.3" } }),
    savedStep(3, RENEW_CARD, { control: "Renew" }),
    savedStep(4, READ_LOANS, { recordOutput: LOANS_OUTPUT })
  ];
  const robotCheck = { status: "failed" as const, route: "failed", message: "A robot check covers the page.", failure: { category: "user_intervention_required" as const, code: "library.robot_check", retryable: false } };
  const cardPresses = (target: ReturnType<typeof libraryTarget>) => target.presses.filter((press) => press.node === RENEW_CARD).length;
  const runOn = async (over: LibraryNodeOver, personCheck?: AutomationStudioAnswerFirstFlowRunPorts["personCheck"]) => {
    const target = libraryTarget();
    target.over = over;
    const fixture = await flowRunFixture({ target }, cleanups);
    const assembled = await automationStudioAnswerFirstFlowRunAssemble(fixture.ports, failedRouteSteps());
    if (!assembled.ok) throw new Error(`did not assemble: ${assembled.codes.join(", ")}`);
    const outcome = await automationStudioAnswerFirstFlowRun({ ...fixture.ports, ...(personCheck ? { personCheck } : {}) }, { steps: failedRouteSteps(), stepsDigest: "digest.saved" });
    return { outcome, fixture };
  };

  it("the failed route really presses: a prompt that fails on its own leads to the card", async () => {
    const { outcome, fixture } = await runOn(({ nodeId }) => nodeId === CLOSE_PROMPT ? { status: "failed", route: "failed", message: "No prompt.", failure: { category: "action_failed", code: "library.no_prompt", retryable: false } } : undefined);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(cardPresses(fixture.target)).toBe(1);
    expect(fixture.target.reads).toBe(2);
  });

  it("Stop on the check halts the run there: the failed route's press never runs, and the run reads as stopped", async () => {
    const asker = person("stop");
    const { outcome, fixture } = await runOn(({ nodeId }) => nodeId === CLOSE_PROMPT ? robotCheck : undefined, asker.personCheck);
    expect(asker.opened).toHaveLength(1);
    expect(asker.stops()).toBe(1);
    expect(outcome).toEqual({ kind: "stopped" });
    expect(cardPresses(fixture.target)).toBe(0);
    expect(fixture.target.library.renewals.card).toBeUndefined();
    expect(fixture.target.reads).toBe(1);
  });

  it("Continue on the check still goes on from that step down its success route, and presses nothing on the failed one", async () => {
    const asker = person("continue");
    const { outcome, fixture } = await runOn(({ nodeId }) => nodeId === CLOSE_PROMPT && !asker.answered() ? robotCheck : undefined, asker.personCheck);
    expect(asker.stops()).toBe(0);
    // Not `reachedEnd`: this shape never reads as reaching its end when the recovery is not needed, check or no check (the engine's unvisited-node ending).
    expect(outcome).toMatchObject({ kind: "ran", steps: [expect.objectContaining({ position: 1, ran: "passed" }), expect.objectContaining({ position: 2 }), expect.objectContaining({ position: 3, ran: "not_reached" }), expect.objectContaining({ position: 4, ran: "passed" })] });
    expect(cardPresses(fixture.target)).toBe(0);
    expect(fixture.target.reads).toBe(2);
  });
});

describe("any other question part way through a saved Flow", () => {
  const permission: AutomationStudioAskDraft = { kind: "permission", parks: true, text: "Allow renewing the card?", consequences: ["modify_existing"] };
  const pin: AutomationStudioAskDraft = { kind: "open", parks: true, text: "Enter your PIN.", control: { name: "PIN", kind: "pin" } };

  it.each([["a permission", permission], ["a PIN", pin]])("%s is never put to the person: the run stops there, as it always has", async (_name, draft) => {
    const target = libraryTarget();
    target.over = ({ nodeId }) => nodeId !== RENEW_CARD ? undefined : { status: "success", route: "success", outputs: { success: true }, effects: [automationStudioAskEffect(draft)] };
    const asker = person("continue");
    const fixture = await flowRunFixture({ target, answer: "allow" }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun({ ...fixture.ports, personCheck: asker.personCheck }, { steps: threeSteps(), stepsDigest: "digest.saved" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 2, happened: WAITING } });
    expect(asker.opened).toEqual([]);
    expect(asker.awaited).toEqual([]);
    expect(asker.waits).toEqual([]);
    expect(fixture.asked).toEqual([]);
    expect(fixture.target.reads).toBe(1);
  });
});
