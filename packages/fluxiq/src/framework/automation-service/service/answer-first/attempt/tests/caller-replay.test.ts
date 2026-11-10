// @fluxiq-test-group real-sql
// A caller's options over a saved Flow (fluxnode-plan P2b, N5-N7), through the real service with a
// scripted model and the lending library (`../../tests/later-attempts.ts`): a budget of nothing is
// replay only, the scope holds over the replay and the start, the rounds that repair a Flow run it
// with this run's inputs, and a person's press in the panel goes on under the options the attempt kept.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAutomationStudioTaskAttemptResult } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstCallerOptions } from "../../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstCarryOn } from "../../index.ts";
import { LOANS_OUTPUT } from "../../tests/fake-library-engine.ts";
import { complete, READ_LOANS, RENEW_CARD, runNode, toolCall } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans, toldTo } from "../../tests/later-attempts.ts";
import { drivenBy } from "./caller-driven.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

type Options = AutomationStudioAnswerFirstCallerOptions;

const LIST = "List every loan on my library account.";
const KEY = "library.loans:spec-1";
const START = "https://library.example/account";
const threeLoans: NonNullable<Options["check"]> = (summary) => summary.rows?.totalRows === 3 || "expected the three loans";

/** One lane whose generations take `options.now`, which a test changes between attempts. */
async function drivenLane(first: Options | undefined) {
  const lane = await laterAttempts(cleanups);
  const options: { now: Options | undefined } = { now: first };
  drivenBy(lane.service, () => options.now);
  return { lane, options };
}

describe("a budget of nothing is replay only", () => {
  it("with a saved Flow and the caller's check, the Flow is replayed to the result at no model cost", async () => {
    const { lane, options } = await drivenLane({ taskKey: KEY, check: threeLoans });
    const first = await lane.attempt({ instruction: LIST, script: [readLoans(), complete("Listed.")] });
    expect(first.answer.attempt.status).toBe("achieved");

    options.now = { taskKey: KEY, check: threeLoans, budgetUsd: 0 };
    const second = await lane.attempt({ instruction: LIST });
    expect(second.asked).toHaveLength(0);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", budget: { usd: 0 }, spend: { calls: 0, usd: 0 } });
    expect(second.answer.confirmedBy).toBe("check");
    expect(second.answer.result?.rows?.totalRows).toBe(3);
  });

  it("with a saved Flow only a judge could confirm, the replay ends budget_out with what it read, and no model is asked", async () => {
    const { lane, options } = await drivenLane({ taskKey: KEY, check: threeLoans });
    await lane.attempt({ instruction: LIST, script: [readLoans(), complete("Listed.")] });

    options.now = { taskKey: KEY, budgetUsd: 0 };
    const readsBefore = lane.target.reads;
    const second = await lane.attempt({ instruction: LIST });
    expect(second.asked).toHaveLength(0);
    expect(second.answer.attempt).toMatchObject({ status: "budget_out", path: "run_flow", spend: { calls: 0 } });
    expect(second.answer.result).toMatchObject({ kind: "rows", label: "unverified" });
    expect(second.answer.result?.rows?.totalRows).toBe(3);
    expect(lane.target.reads).toBe(readsBefore + 1);
  });

  it("with no saved Flow, the attempt ends budget_out at once, with its empty best, and no model is asked", async () => {
    const { lane } = await drivenLane({ taskKey: KEY, check: threeLoans, budgetUsd: 0 });
    const only = await lane.attempt({ instruction: LIST, script: [readLoans(), complete("Listed.")] });
    expect(only.asked).toHaveLength(0);
    expect(only.answer.attempt).toMatchObject({ status: "budget_out", path: "explore", spend: { calls: 0 } });
    expect(only.answer.result).toMatchObject({ kind: "partial", label: "unverified" });
    expect(lane.target.library.calls.filter((call) => call.value.node === READ_LOANS)).toHaveLength(0);
  });
});

describe("the scope over a saved Flow and its start", () => {
  it("a saved step outside the scope keeps the Flow from running, nobody is asked, and the rounds reach the result another way", async () => {
    const card = runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true });
    const { lane, options } = await drivenLane({ taskKey: KEY, check: threeLoans });
    const first = await lane.attempt({ instruction: LIST, permittedConsequences: ["modify_existing"], script: [readLoans(), card, complete("Listed, and renewed the card.")] });
    expect(first.answer.attempt.status).toBe("achieved");
    expect(lane.target.library.renewals).toEqual({ card: 1 });
    const kept = await lane.kept();
    expect(kept?.best?.steps.some((step) => step.ranWith?.node === RENEW_CARD)).toBe(true);

    // The request still permits a change; the scope, which is the grant, does not.
    options.now = { taskKey: KEY, check: threeLoans, scope: { permittedConsequences: [] } };
    const readsBefore = lane.target.reads;
    const second = await lane.attempt({ instruction: LIST, permittedConsequences: ["modify_existing"], script: [readLoans("again"), complete("Listed.")] });
    expect(lane.target.presses.filter((press) => press.node === RENEW_CARD)).toEqual([]);
    expect(lane.target.library.renewals).toEqual({ card: 1 });
    expect(lane.target.reads).toBe(readsBefore);
    expect(JSON.stringify(toldTo(second.decisions[0]))).toContain("an act this task may not do (modify_existing)");
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 2, taskId: first.answer.attempt.taskId });
    expect(second.answer.result?.rows?.totalRows).toBe(3);
  });

  it("a start off the scope's sites is refused as invalid input before anything is asked, run or written; one on them runs", async () => {
    const { lane } = await drivenLane({ taskKey: KEY, check: threeLoans, scope: { permittedConsequences: [], sites: ["library.example"] } });
    await expect(lane.attempt({ instruction: LIST, startLocation: "https://elsewhere.example/account", script: [readLoans(), complete("Listed.")] })).rejects.toThrow(/expected an answer, got setup_needed/u);
    expect(lane.target.library.calls).toEqual([]);
    expect(await lane.rows()).toEqual([]);

    const on = await lane.attempt({ instruction: LIST, startLocation: START, script: [readLoans(), complete("Listed.")] });
    expect(on.answer.attempt.status).toBe("achieved");
  });
});

describe("the rounds that repair a Flow run its saved steps with this run's inputs", () => {
  it("a bound step run again by a round takes the new value, not the one the Flow was learned with", async () => {
    const read = (callId: string, shape: string): JsonObject => runNode(callId, READ_LOANS, { shape, recordOutput: LOANS_OUTPUT }, [], { add: true });
    const { lane, options } = await drivenLane({ taskKey: KEY, check: threeLoans, inputs: { shape: "plain" } });
    await lane.attempt({ instruction: LIST, script: [read("read", "plain"), complete("Listed.")] });
    const saved = (await lane.kept())?.best?.steps.find((step) => step.ranWith?.node === READ_LOANS);
    expect((saved?.ranWith?.parameters as JsonObject | undefined)?.shape).toEqual({ $state: { path: "shape", fallback: "plain" } });

    // The engine's read fails, so the rounds repair from it, running the saved read again.
    lane.target.over = ({ nodeId }) => (nodeId === READ_LOANS ? { status: "failed", route: "failed", message: "Page says: closed for stocktaking", failure: { category: "target_not_found", code: "library.closed", retryable: false } } : undefined);
    options.now = { taskKey: KEY, check: threeLoans, inputs: { shape: "fancy" } };
    const from = lane.target.library.calls.length;
    const second = await lane.attempt({ instruction: LIST, script: [toolCall("again", "core.run_flow", { from: saved?.position ?? 1 }), complete("Listed.")] });
    const rerun = lane.target.library.calls.slice(from).filter((call) => call.value.node === READ_LOANS && call.value.replay === "step");
    expect(rerun.length).toBeGreaterThan(0);
    expect(rerun.map((call) => (call.value.parameters as JsonObject).shape)).toEqual(rerun.map(() => "fancy"));
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair" });
  });
});

describe("a person's press in the panel goes on under the options the attempt kept", () => {
  it("Run again keeps the caller's task key, judge, budget, scope and inputs, and replays the task's Flow", async () => {
    const given: Options = { taskKey: KEY, judge: "off", budgetUsd: 7, model: "claude-haiku-5-5", scope: { permittedConsequences: [], sites: ["library.example"] }, inputs: { shape: "plain" } };
    const { lane, options } = await drivenLane(given);
    const first = await lane.attempt({ instruction: LIST, startLocation: START, script: [readLoans(), complete("Listed.")] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", checkingOff: true });

    // The panel's press brings no options of its own.
    options.now = undefined;
    const again = await lane.attempt({ instruction: LIST, startLocation: START, runAgain: true });
    expect(again.answer.attempt).toMatchObject({ status: "achieved", checkingOff: true, taskId: first.answer.attempt.taskId, ordinal: 2, path: "run_flow", budget: { usd: 7 } });
    expect(again.answer.confirmedBy).toBe("none");
    expect(again.judgeCalls).toHaveLength(0);
    expect(checkAutomationStudioTaskAttemptResult(again.answer.attempt, again.answer.result)).toEqual({ ok: true });
    const kept = await lane.kept();
    const { check: _no, ...written } = given;
    expect(kept?.attempts.map((attempt) => attempt.caller)).toEqual([written, written]);
  });

  it("Carry on goes on under the attempt's own options: its judge stays off, so no judge is asked", async () => {
    const { lane, options } = await drivenLane({ taskKey: KEY, judge: "off" });
    const first = await lane.attempt({ instruction: LIST, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true, script: [readLoans()] });
    expect(first.answer.attempt.status).toBe("budget_out");

    options.now = undefined;
    const pressed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.4 }, () => lane.attempt({ instruction: LIST, costUsd: 0.04, script: [complete("Listed.")] }));
    if (!pressed.ok) throw new Error(`refused: ${pressed.refused}`);
    const after = await pressed.finished;
    expect(after.answer.attempt).toMatchObject({ status: "achieved", checkingOff: true, attemptId: first.answer.attempt.attemptId, taskId: first.answer.attempt.taskId });
    expect(after.answer.confirmedBy).toBe("none");
    expect(after.judgeCalls).toHaveLength(0);
    expect(after.answer.result?.rows?.totalRows).toBe(3);
  });
});
