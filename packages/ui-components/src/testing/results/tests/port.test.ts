import { describe, expect, it } from "vitest";
// The contract's real parsers, by path because this package does not depend on it
// (`../../../chat/ports/results.ts` says why). A test may load them; the source never does.
import {
  checkAutomationStudioTaskAttemptResult,
  parseAutomationStudioSavedState,
  parseAutomationStudioTaskAttempt,
  parseAutomationStudioTaskResult
} from "../../../../../contracts/src/task-attempts/index.ts";
import type { ChatTaskAttempt, ChatTaskOutcome } from "../../../chat/ports/index.ts";
import { createFakeChatResultsPort, fakeTaskOutcomes } from "../index.ts";

const QUERY = { projectId: "project-1" };

describe("fakeTaskOutcomes", () => {
  it("are records Core's own parsers accept, so what is built on them reads the real thing", () => {
    for (const [name, outcome] of Object.entries(fakeTaskOutcomes())) {
      expect(parseAutomationStudioTaskAttempt(outcome.attempt), name).toEqual({ ok: true, attempt: outcome.attempt });
      if (outcome.result) expect(parseAutomationStudioTaskResult(outcome.result), name).toEqual({ ok: true, result: outcome.result });
      if (outcome.saved) expect(parseAutomationStudioSavedState(outcome.saved), name).toEqual({ ok: true, saved: outcome.saved });
      if (outcome.comparedTo) expect(parseAutomationStudioTaskAttempt(outcome.comparedTo), name).toEqual({ ok: true, attempt: outcome.comparedTo });
    }
  });

  it("tell the truth between records: they pass the contract's check, and only a confirmed result is achieved", () => {
    for (const [name, outcome] of Object.entries(fakeTaskOutcomes())) {
      expect(checkAutomationStudioTaskAttemptResult(outcome.attempt as ChatTaskAttempt, outcome.result), name).toEqual({ ok: true });
      if (outcome.attempt.status === "achieved") expect(outcome.result?.label, name).toBe("confirmed");
    }
  });

  it("cover every status, every wait, every result kind, every label and every saved state", () => {
    const outcomes: ChatTaskOutcome[] = Object.values(fakeTaskOutcomes());
    expect(new Set(outcomes.map((outcome) => outcome.attempt.status))).toEqual(new Set(["working", "waiting_for_person", "achieved", "budget_out", "stopped_by_person"]));
    expect(new Set(outcomes.flatMap(({ attempt }) => (attempt.status === "waiting_for_person" ? [attempt.waitingFor] : [])))).toEqual(new Set(["permission", "person_only_check", "stuck_in_a_loop", "model_key_locked", "interrupted"]));
    expect(new Set(outcomes.flatMap((outcome) => outcome.result?.kind ?? []))).toEqual(new Set(["rows", "done_on_site", "plain_answer", "partial"]));
    expect(new Set(outcomes.flatMap((outcome) => outcome.result?.label ?? []))).toEqual(new Set(["confirmed", "refuted", "unverified"]));
    expect(new Set(outcomes.flatMap((outcome) => outcome.saved?.state ?? []))).toEqual(new Set(["ready", "partly_works", "notes_only", "needs_you"]));
  });

  it("are fresh on each read", () => {
    expect(fakeTaskOutcomes().rowsChecked).not.toBe(fakeTaskOutcomes().rowsChecked);
    expect(fakeTaskOutcomes().rowsChecked.attempt.loopsCaught.cycle).not.toBe(fakeTaskOutcomes().rowsChecked.attempt.loopsCaught.near_repeat);
  });
});

describe("createFakeChatResultsPort", () => {
  it("reads a thread's outcomes oldest first, and a thread with none as an empty list", async () => {
    const { rowsChecked, secondAttemptFromSaved } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [rowsChecked, secondAttemptFromSaved] }] });
    expect(await port.readThread({ ...QUERY, conversationId: "thread-1" })).toEqual({ ok: true, value: { outcomes: [rowsChecked, secondAttemptFromSaved] } });
    expect(await port.readThread({ ...QUERY, conversationId: "thread-2" })).toEqual({ ok: true, value: { outcomes: [] } });
  });

  it("reads an attempt from a thread or alone, a copy each time, and says when it cannot find one", async () => {
    const { rowsChecked, working } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [rowsChecked] }], outcomes: [working] });
    const read = await port.readAttempt({ ...QUERY, attemptId: "attempt-deals-1" });
    expect(read).toEqual({ ok: true, value: rowsChecked });
    expect(read.ok && read.value).not.toBe(rowsChecked);
    expect(await port.readAttempt({ ...QUERY, attemptId: "attempt-jobs-1" })).toEqual({ ok: true, value: working });
    expect(await port.readAttempt({ ...QUERY, attemptId: "nope" })).toEqual({ ok: false, sentence: "That attempt could not be found.", code: "failed" });
  });

  it("exports rows through the host's download", async () => {
    const saved: Array<[string, string, string]> = [];
    const port = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().budgetOutPartial], download: (fileName, contentType, body) => saved.push([fileName, contentType, body]) });
    const target = { ...QUERY, runId: "run-listings-1", datasetId: "listings" };
    expect(await port.exportRows({ ...target, format: "csv" })).toEqual({ ok: true, value: { fileName: "listings.csv" } });
    expect(await port.exportRows({ ...target, format: "json" })).toEqual({ ok: true, value: { fileName: "listings.json" } });
    expect(saved[0]).toEqual(["listings.csv", "text/csv", "Title,City\nCorner flat,Leeds\nGarden room,York\nTop floor,Hull"]);
    expect(saved[1]?.[1]).toBe("application/json");
    expect(JSON.parse(saved[1]?.[2] ?? "")).toHaveLength(3);
    expect(port.downloads).toHaveLength(2);
    expect(await port.exportRows({ ...target, datasetId: "other", format: "csv" })).toEqual({ ok: false, sentence: "Those rows could not be found.", code: "failed" });
    expect(saved).toHaveLength(2);
  });

  it("runs again as a new working attempt, from the saved Flow when there is one, and spends nothing", async () => {
    const { rowsChecked, plainAnswerChecked } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [rowsChecked, plainAnswerChecked] }] });
    const again = await port.runAgain({ ...QUERY, taskId: "task-deals" });
    if (!again.ok) throw new Error("expected a new attempt");
    const read = await port.readAttempt({ ...QUERY, attemptId: again.value.attemptId });
    if (!read.ok) throw new Error("expected to read it");
    expect(read.value.attempt).toMatchObject({ taskId: "task-deals", ordinal: 2, path: "run_flow", flowId: "flow-deals", status: "working", spend: { usd: 0, calls: 0 } });
    expect(parseAutomationStudioTaskAttempt(read.value.attempt as ChatTaskAttempt).ok).toBe(true);
    const noFlow = await port.runAgain({ ...QUERY, taskId: "task-hours" });
    const noFlowRead = noFlow.ok ? await port.readAttempt({ ...QUERY, attemptId: noFlow.value.attemptId }) : noFlow;
    expect(noFlowRead.ok && noFlowRead.value.attempt.path).toBe("explore");
    expect(await port.runAgain({ ...QUERY, taskId: "nope" })).toEqual({ ok: false, sentence: "That task could not be found.", code: "failed" });
  });

  it("adds budget and carries the same attempt on, keeping what it got", async () => {
    const { budgetOutPartial } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ outcomes: [budgetOutPartial] });
    const query = { ...QUERY, attemptId: "attempt-listings-1" };
    expect(await port.addBudgetAndCarryOn({ ...query, addUsd: 2.5 })).toEqual({ ok: true, value: { attemptId: "attempt-listings-1", budgetUsd: 7.5 } });
    const read = await port.readAttempt(query);
    if (!read.ok) throw new Error("expected to read it");
    expect(read.value.attempt.status).toBe("working");
    expect(read.value.attempt.budget).toEqual({ usd: 7.5 });
    expect(read.value.attempt.spend).toEqual(budgetOutPartial.attempt.spend);
    expect(read.value.attempt.endedAtMs).toBeUndefined();
    expect(read.value.result).toEqual(budgetOutPartial.result);
    expect(parseAutomationStudioTaskAttempt(read.value.attempt as ChatTaskAttempt).ok).toBe(true);
    expect(checkAutomationStudioTaskAttemptResult(read.value.attempt as ChatTaskAttempt, read.value.result)).toEqual({ ok: true });
    expect(budgetOutPartial.attempt.status).toBe("budget_out");
  });

  it("refuses to carry on what has not run out, what it cannot find, and an amount that is none", async () => {
    const { rowsChecked, budgetOutPartial } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ outcomes: [rowsChecked, budgetOutPartial] });
    expect(await port.addBudgetAndCarryOn({ ...QUERY, attemptId: "attempt-deals-1", addUsd: 1 })).toEqual({ ok: false, sentence: "That attempt has not run out of budget.", code: "refused" });
    expect(await port.addBudgetAndCarryOn({ ...QUERY, attemptId: "nope", addUsd: 1 })).toEqual({ ok: false, sentence: "That attempt could not be found.", code: "failed" });
    for (const addUsd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await port.addBudgetAndCarryOn({ ...QUERY, attemptId: "attempt-listings-1", addUsd })).toEqual({ ok: false, sentence: "Add an amount above zero.", code: "invalid_request" });
    }
  });

  it("answers a failure it is told to, once, and records what it was asked", async () => {
    const port = createFakeChatResultsPort({ outcomes: [fakeTaskOutcomes().working] });
    port.failNext("readAttempt", { ok: false, sentence: "FluxIQ could not be reached.", code: "unreachable" });
    const query = { ...QUERY, attemptId: "attempt-jobs-1" };
    expect(await port.readAttempt(query)).toEqual({ ok: false, sentence: "FluxIQ could not be reached.", code: "unreachable" });
    expect((await port.readAttempt(query)).ok).toBe(true);
    expect(port.calls).toEqual([{ method: "readAttempt", query }, { method: "readAttempt", query }]);
  });

  it("does not hand out what a test can change behind it", async () => {
    const { working } = fakeTaskOutcomes();
    const port = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [working] }] });
    const first = await port.readThread({ ...QUERY, conversationId: "thread-1" });
    if (first.ok) first.value.outcomes[0]!.attempt.status = "achieved";
    const second = await port.readThread({ ...QUERY, conversationId: "thread-1" });
    expect(second.ok && second.value.outcomes[0]?.attempt.status).toBe("working");
  });
});
