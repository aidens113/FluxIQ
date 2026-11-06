// @fluxiq-test-group real-sql
// A Core restart, through the real service with a scripted model (t870): a new service over the
// same data knows nothing of what the old one was doing, so nothing it finds unfinished may read as
// still going, and carrying it on must never press blind. The old service is left as a killed
// process leaves one: nobody stops it, and it writes nothing more until the test is over.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstAttemptsRead, AutomationStudioAnswerFirstAttemptsUnreadable, automationStudioAnswerFirstCarryOn, automationStudioAnswerFirstLiveAttemptsOf } from "../index.ts";
import { pendingAsk } from "./endings/support.ts";
import { complete, LOOK_TOOL, READ_LOANS, RENEW_CARD, RENEW_LOAN, runNode, toolCall, type FakeLibraryFault } from "./fake-library.ts";
import { laterAttempts, readLoans, toldTo } from "./later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"];
const [ATLAS, BIRDS, CLOCKS, DUNES] = TITLES as [string, string, string, string];
const ALL = "Renew every loan on my library account and list them.";
const PERMITTED = { instruction: ALL, permittedConsequences: ["modify_existing" as const] };
const press = (title: string) => runNode(`renew.${title.replace(/\W+/gu, "-")}`, RENEW_LOAN, { title }, ["modify_existing"], { add: true });

type Lane = Awaited<ReturnType<typeof laterAttempts>>;

/** A target that answers nothing for one call until told to. */
function hanging(on: (call: { toolId: string; value: JsonObject }) => boolean) {
  let reached = (): void => undefined;
  let release = (): void => undefined;
  const hit = new Promise<void>((resolve) => { reached = resolve; });
  const held = new Promise<AutomationStudioLlmEvidenceToolExecutionResult>((resolve) => {
    release = () => resolve({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "gone" }, effectApplied: false });
  });
  const fault: FakeLibraryFault = (call) => {
    if (!on(call)) return undefined;
    reached();
    return held;
  };
  return { fault, hit, release };
}

const reads = (lane: Lane) => automationStudioAnswerFirstAttemptsRead(lane.service, lane.stores);

/** Stops what the old service was left doing, so the test can clean up after it. */
const abandon = (lane: Lane, hang: { release: () => void } | undefined, going: Promise<unknown>) => {
  cleanups.unshift(async () => {
    lane.service.buildCancellation.cancel(lane.projectId, "flow.loans");
    hang?.release();
    await going.catch(() => undefined);
  });
};

describe("a Core that restarted", () => {
  it("hung mid-press: the row reads interrupted, the act may have landed, and carrying on looks first and reaches the result", async () => {
    const hang = hanging((call) => call.value.node === RENEW_LOAN && (call.value.parameters as JsonObject).title === BIRDS);
    const old = await laterAttempts(cleanups, { titles: TITLES, fault: hang.fault });
    const going = old.attempt({ ...PERMITTED, costUsd: 0.01, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    abandon(old, hang, going);
    await hang.hit;
    // In the old service it is still going, and reads so.
    const stillGoing = await reads(old).latest(old.projectId, "flow.loans");
    expect(stillGoing?.attempt.status).toBe("working");
    // A press on it there starts nothing, and changes nothing.
    const run = vi.fn(async () => "never");
    expect(await automationStudioAnswerFirstCarryOn(old.service, old.stores, { projectId: old.projectId, attemptId: stillGoing!.attempt.attemptId, addUsd: 1 }, run)).toMatchObject({ ok: false, refused: "live" });
    expect(run).not.toHaveBeenCalled();
    expect((await old.rows()).at(-1)).toEqual(stillGoing);

    const callsBefore = old.target.library.calls.length;
    const fresh = await laterAttempts(cleanups, { restart: old.restart() });
    const row = await reads(fresh).latest(fresh.projectId, "flow.loans");
    expect(row?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted" });
    expect(row?.attempt.endedAtMs).toBeUndefined();
    expect(row?.steps?.length).toBeGreaterThan(0);
    expect(row?.result?.rows?.totalRows).toBe(4);
    // Rewritten once, in the store, and through `get` and `list` the same.
    expect((await fresh.rows()).at(-1)?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted" });
    const attemptId = row!.attempt.attemptId;
    expect((await reads(fresh).get(fresh.projectId, "flow.loans", attemptId))?.attempt.status).toBe("waiting_for_person");
    expect((await reads(fresh).list(fresh.projectId, "flow.loans")).map((each) => each.attempt.status)).toEqual(["waiting_for_person"]);

    // The act it hung on is on the record as may have landed, in both places it is kept.
    const held = (await fresh.memory.get(fresh.projectId, row!.attempt.taskId))?.acts;
    expect(held?.attemptId).toBe(attemptId);
    const states = (acts: readonly { state: string; rowIdentity?: string; what?: string }[] | undefined) => acts?.map((act) => act.state).sort();
    expect(states(held?.data.acts)).toEqual(["landed", "may_have_landed"]);
    expect(states((await fresh.actsOn())?.acts)).toEqual(["landed", "may_have_landed"]);

    const pressed = await automationStudioAnswerFirstCarryOn(fresh.service, fresh.stores, { projectId: fresh.projectId, attemptId, addUsd: 0 }, () => fresh.attempt({ ...PERMITTED, costUsd: 0.01, script: [press(BIRDS), toolCall("look.after.refusal", LOOK_TOOL, {}), press(BIRDS), press(CLOCKS), press(DUNES), complete("All renewed.")] }));
    if (!pressed.ok) throw new Error(pressed.refused);
    const answered = await pressed.finished;
    const after = answered.answer.attempt;
    expect(after).toMatchObject({ status: "achieved", attemptId, ordinal: 1, startedAtMs: row!.attempt.startedAtMs });
    expect(fresh.target.library.renewals).toEqual(Object.fromEntries(TITLES.map((title) => [title, 1])));
    expect(answered.answer.result?.rows?.totalRows).toBe(4);
    expect(toldTo(answered.decisions[0])?.carriedOn).toBe(true);
    expect(toldTo(answered.decisions[0])?.acts).toMatchObject({ acts: expect.arrayContaining([expect.objectContaining({ state: "landed" }), expect.objectContaining({ state: "may_have_landed" })]) });

    // Looked at before the row it hung on was pressed again.
    const since = fresh.target.library.calls.slice(callsBefore);
    const look = since.findIndex((call) => call.toolId === LOOK_TOOL);
    const again = since.findIndex((call) => call.value.node === RENEW_LOAN && (call.value.parameters as JsonObject).title === BIRDS);
    expect(look).toBeGreaterThanOrEqual(0);
    expect(look).toBeLessThan(again);
    expect(answered.answer.result?.acts).toHaveLength(4);
  });

  it("a look that fails holds the press back: the row it hung on is never pressed blind", async () => {
    const hang = hanging((call) => call.value.node === RENEW_LOAN && (call.value.parameters as JsonObject).title === ATLAS);
    const old = await laterAttempts(cleanups, { titles: TITLES, fault: hang.fault });
    const going = old.attempt({ ...PERMITTED, costUsd: 0.01, script: [readLoans(), press(ATLAS)] });
    abandon(old, hang, going);
    await hang.hit;
    const callsBefore = old.target.library.calls.length;
    let looksRefused = 1;
    const fresh = await laterAttempts(cleanups, {
      restart: old.restart(),
      fault: (call) => (call.toolId === LOOK_TOOL && looksRefused-- > 0 ? { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "unreadable" }, effectApplied: false, failure: { category: "target_not_found", code: "library.unreadable", retryable: false, stage: "dispatch" } } : undefined)
    });
    const row = await reads(fresh).latest(fresh.projectId, "flow.loans");
    const pressed = await automationStudioAnswerFirstCarryOn(fresh.service, fresh.stores, { projectId: fresh.projectId, attemptId: row!.attempt.attemptId, addUsd: 0 }, () => fresh.attempt({
      ...PERMITTED, costUsd: 0.01,
      script: [
        press(ATLAS),
        (request) => {
          // Refused, before anything went out.
          expect(fresh.target.library.calls.slice(callsBefore).filter((call) => call.value.node === RENEW_LOAN)).toEqual([]);
          expect(JSON.stringify(request.context.evidenceLoop?.evidence)).toMatch(/look/iu);
          return runNode("look.again", READ_LOANS, { recordOutput: undefined as unknown as JsonObject }, [], {});
        },
        complete("Stopped short.")
      ]
    }));
    if (!pressed.ok) throw new Error(pressed.refused);
    const answered = await pressed.finished;
    expect(fresh.target.library.renewals[ATLAS]).toBeUndefined();
    expect(answered.answer.attempt.attemptId).toBe(row!.attempt.attemptId);
  });

  it("a row waiting on a permission question reads interrupted too", async () => {
    const old = await laterAttempts(cleanups);
    const going = old.attempt({ instruction: "Renew the card on my library account.", script: [runNode("card", RENEW_CARD, {}, ["send_or_publish"], { add: true })] });
    abandon(old, undefined, going);
    await pendingAsk(old.service, old.projectId, "flow.loans");
    let waiting;
    for (let tries = 0; tries < 400 && waiting?.attempt.status !== "waiting_for_person"; tries += 1) {
      waiting = (await old.rows()).at(-1);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(waiting?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "permission" });
    // Live in the old service, so reading it there changes nothing.
    expect((await reads(old).latest(old.projectId, "flow.loans"))?.attempt).toMatchObject({ waitingFor: "permission" });
    const fresh = await laterAttempts(cleanups, { restart: old.restart() });
    expect((await reads(fresh).latest(fresh.projectId, "flow.loans"))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted" });
  });

  it("a saved Flow's run cut off mid-press: the row was written when its first step went out, and it is never run from its start again", async () => {
    let held = (): void => undefined;
    const old = await laterAttempts(cleanups, { titles: TITLES });
    const instruction = "List every loan on my library account and renew the card.";
    const card = runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true });
    await old.attempt({ instruction, permittedConsequences: ["modify_existing"], script: [readLoans(), card, complete("Done.")] });
    const pressesBefore = old.target.presses.length;
    let hit = (): void => undefined;
    const reached = new Promise<void>((resolve) => { hit = resolve; });
    old.target.over = ({ nodeId }) => {
      if (nodeId !== RENEW_CARD) return undefined;
      hit();
      return new Promise((resolve) => { held = () => resolve({ status: "failed", route: "failed", message: "Gone.", failure: { category: "action_failed", code: "library.gone", retryable: false } }); });
    };
    // A person's Run again, so the saved Flow presses the card again: the same words would carry it and never reach it (t869).
    const going = old.attempt({ instruction, permittedConsequences: ["modify_existing"], runAgain: true });
    abandon(old, { release: () => held() }, going);
    await reached;
    for (let tries = 0; tries < 400 && (await old.rows()).at(-1)?.attempt.status !== "working"; tries += 1) await new Promise((resolve) => setTimeout(resolve, 25));
    const readsSoFar = old.target.reads;

    const fresh = await laterAttempts(cleanups, { restart: old.restart() });
    delete fresh.target.over;
    const row = await reads(fresh).latest(fresh.projectId, "flow.loans");
    expect(row?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted", ordinal: 2 });
    const pressed = await automationStudioAnswerFirstCarryOn(fresh.service, fresh.stores, { projectId: fresh.projectId, attemptId: row!.attempt.attemptId, addUsd: 0 }, () => fresh.attempt({ instruction, permittedConsequences: ["modify_existing"], script: [complete("Listed, and the card is renewed.")] }));
    if (!pressed.ok) throw new Error(pressed.refused);
    const answered = await pressed.finished;
    expect(answered.answer.attempt).toMatchObject({ status: "achieved", attemptId: row!.attempt.attemptId, path: "run_flow_then_explore" });
    // Nothing ran again: no read, and no press past the one it hung on.
    expect(fresh.target.reads).toBe(readsSoFar);
    expect(fresh.target.presses).toHaveLength(pressesBefore);
    expect(fresh.target.library.renewals.card).toBe(1);
  });

  it("a new attempt's opening sweeps too, and carries what the interrupted one did", async () => {
    const hang = hanging((call) => call.value.node === RENEW_LOAN && (call.value.parameters as JsonObject).title === BIRDS);
    const old = await laterAttempts(cleanups, { titles: TITLES, fault: hang.fault });
    const going = old.attempt({ ...PERMITTED, costUsd: 0.01, script: [readLoans(), press(ATLAS), press(BIRDS)] });
    abandon(old, hang, going);
    await hang.hit;
    const fresh = await laterAttempts(cleanups, { restart: old.restart() });
    const second = await fresh.attempt({ ...PERMITTED, costUsd: 0.01, script: [press(ATLAS), complete("Stopped short.")] });
    const rows = await fresh.rows();
    expect(rows[0]?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted", ordinal: 1 });
    expect(second.answer.attempt.ordinal).toBe(2);
    // It carried the act that landed, so it was not pressed again.
    expect(fresh.target.library.renewals[ATLAS]).toBe(1);
  });
});

describe("what is live", () => {
  it("a throw at the opening leaves nothing live", async () => {
    const lane = await laterAttempts(cleanups);
    const live = automationStudioAnswerFirstLiveAttemptsOf(lane.service);
    const claim = vi.spyOn(live, "claim");
    const release = vi.spyOn(live, "release");
    const session = vi.spyOn(lane.service, "startRuntimeSession").mockRejectedValue(new Error("no session"));
    await expect(lane.attempt({ script: [complete("Never.")] })).rejects.toThrow();
    session.mockRestore();
    expect(claim).toHaveBeenCalledTimes(1);
    const attemptId = claim.mock.calls[0]?.[0] as string;
    expect(release).toHaveBeenCalledWith(attemptId);
    expect(live.has(attemptId)).toBe(false);
  });

  it("shows as working before its first look or model call, and dying there reads as cut off", async () => {
    const hang = hanging((call) => call.toolId === LOOK_TOOL);
    const old = await laterAttempts(cleanups, { titles: TITLES, fault: hang.fault });
    const going = old.attempt({ ...PERMITTED, script: [complete("Never.")] });
    abandon(old, hang, going);
    await hang.hit;
    expect((await reads(old).latest(old.projectId, "flow.loans"))?.attempt.status).toBe("working");

    const fresh = await laterAttempts(cleanups, { restart: old.restart() });
    expect((await reads(fresh).latest(fresh.projectId, "flow.loans"))?.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "interrupted" });
  });

  it("a setup refusal leaves nothing live, and no row", async () => {
    const lane = await laterAttempts(cleanups);
    const live = automationStudioAnswerFirstLiveAttemptsOf(lane.service);
    const claim = vi.spyOn(live, "claim");
    await expect(lane.attempt({ resolver: { timeoutMs: -5 }, script: [complete("Never.")] })).rejects.toThrow(/setup_needed/u);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(live.has(claim.mock.calls[0]?.[0] as string)).toBe(false);
    expect(await lane.rows()).toEqual([]);
  });

  it("an attempt that reached its result stays what it is through every read", async () => {
    const lane = await laterAttempts(cleanups);
    await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    const before = await lane.rows();
    expect((await reads(lane).list(lane.projectId, "flow.loans"))).toEqual(before);
    expect(await lane.rows()).toEqual(before);
  });

  it("a store that cannot be read answers as the store does, and a press on it starts nothing", async () => {
    const lane = await laterAttempts(cleanups);
    const { answer } = await lane.attempt({ script: [readLoans(), complete("Listed.")] });
    await writeFile(path.join(lane.stores.flows.flowDirectory(lane.projectId, "flow.loans"), "answer-attempts.json"), "{ not json");
    await expect(reads(lane).list(lane.projectId, "flow.loans")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptsUnreadable);
    await expect(reads(lane).latest(lane.projectId, "flow.loans")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstAttemptsUnreadable);
    const run = vi.fn(async () => "never");
    expect(await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId: answer.attempt.attemptId, addUsd: 1 }, run)).toMatchObject({ ok: false, refused: "unreadable" });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("a check only a person can clear, with nobody to ask", () => {
  it("is unchanged: it stays waiting for that person, through a read, a restart and a press", async () => {
    let checks = 1;
    const check = (call: { value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult => ({
      kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "needs_person" }, effectApplied: false, personNeeded: true,
      draft: { actionId: String(call.value.node), input: call.value, effect: "observe", proposes: true, ranWith: { node: String(call.value.node), parameters: {} } }
    });
    const lane = await laterAttempts(cleanups, { fault: (call) => (call.value.parameters as JsonObject | undefined)?.second === true && checks-- > 0 ? check(call) : undefined });
    Object.defineProperty(lane.service.conversations, "available", { value: false });
    const { answer } = await lane.attempt({ script: [readLoans(), runNode("read.checked", READ_LOANS, { second: true }, [], {}), complete("Never asked.")] });
    expect(answer.attempt).toMatchObject({ status: "waiting_for_person", waitingFor: "person_only_check" });
    const before = await lane.rows();
    expect(await reads(lane).list(lane.projectId, "flow.loans")).toEqual(before);
    const fresh = await laterAttempts(cleanups, { restart: lane.restart() });
    expect(await reads(fresh).list(fresh.projectId, "flow.loans")).toEqual(before);
    const run = vi.fn(async () => "never");
    const pressed = await automationStudioAnswerFirstCarryOn(fresh.service, fresh.stores, { projectId: fresh.projectId, attemptId: answer.attempt.attemptId, addUsd: 1 }, run);
    expect(pressed).toMatchObject({ ok: false, refused: "waiting_for_person" });
    expect(run).not.toHaveBeenCalled();
    expect(await fresh.rows()).toEqual(before);
  });
});
