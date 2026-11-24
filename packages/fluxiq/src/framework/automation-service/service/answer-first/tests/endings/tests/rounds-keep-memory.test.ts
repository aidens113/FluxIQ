// @fluxiq-test-group real-sql
// A fresh round keeps what the run learned (t1014). Loop detection's last rung ends a round that keeps repeating
// itself, and the next round used to start with an empty evidence window: the model lost what it had read and found,
// and read it again (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
// EVERYTHING"). Now the fresh round is shown every earlier call, with what it was asked, how it came back and what it
// found, beside the note's tried list, with no page view, from the page as it stands.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt } from "../../fake-library.ts";
import { laterAttempts, readLoans } from "../../later-attempts.ts";
import { automationStudioAnswerFirstCarryOn } from "../../../index.ts";
import { expectReached, keptAttempt, noWaiting } from "../support.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID } from "../../../earlier-rounds/index.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

type Entry = { toolId: string; value: JsonObject };
const windowOf = (request: AutomationStudioLlmTaskRequest): Entry[] => (request.context.evidenceLoop?.evidence ?? []) as Entry[];
const noteOf = (request: AutomationStudioLlmTaskRequest): JsonObject | undefined => windowOf(request).find((entry) => entry.toolId === "core.attempt_note")?.value;
const PAGE_TEXT = "a page text that must not travel";
const failing: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_not_found" }, effectApplied: false, resultCode: "web.action.rejected.target_not_found", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "dispatch" } };

describe("a fresh round after loop detection's last rung", () => {
  it("starts with what the earlier round read, tried and found, and the tried list, from the page as it stands", async () => {
    const library = fakeLibrary();
    library.shelf = PAGE_TEXT;
    let firstRead = true;
    let fresh: AutomationStudioLlmTaskRequest | undefined;
    let callsBeforeLastDecision = 0;
    let callsAtFresh = 0;
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      if (!noteOf(request)) {
        callsBeforeLastDecision = library.calls.length;
        if (firstRead) {
          firstRead = false;
          return runNode("read.first", READ_LOANS, { first: true }, [], {});
        }
        return runNode("read.stuck", READ_LOANS, { from: "the wrong list" }, [], {});
      }
      if (!fresh) {
        fresh = request;
        callsAtFresh = library.calls.length;
        return runNode("read", READ_LOANS, {}, [], { add: true });
      }
      return complete("Listed.");
    };
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
      library,
      before: noWaiting(),
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.from === "the wrong list" ? failing : undefined,
      script: Array.from({ length: 80 }, () => decide)
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // It was loop detection's last rung that ended the first round.
    expect(Object.values(answer.attempt.loopsCaught).reduce((sum, each) => sum + each.changeApproach, 0)).toBeGreaterThanOrEqual(1);
    expect(fresh).toBeDefined();
    const window = windowOf(fresh!);

    // The note, then what the earlier round did and found, then the round's own evidence.
    expect(window[0]?.toolId).toBe("core.attempt_note");
    expect(window[1]?.toolId).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID);
    const earlier = window[1]!.value;
    const calls = earlier.calls as JsonObject[];
    // The read it made, with its rows, as found.
    const read = calls.find((call) => (call.asked as JsonObject | undefined)?.parameters !== undefined && ((call.asked as JsonObject).parameters as JsonObject).first === true);
    expect(read).toMatchObject({ did: READ_LOANS, found: { read: { extracted: expect.arrayContaining([expect.objectContaining({ title: "Atlas of Rivers" })]) } } });
    // What it tried, and what came back.
    const tried = calls.filter((call) => ((call.asked as JsonObject | undefined)?.parameters as JsonObject | undefined)?.from === "the wrong list");
    expect(tried.length).toBeGreaterThanOrEqual(1);
    expect(tried.every((call) => call.outcome === "web.action.rejected.target_not_found")).toBe(true);
    // Every earlier call is there, numbered in order, and no page view travels.
    expect(calls.map((call) => call.n)).toEqual(calls.map((_, index) => index + 1));
    expect(JSON.stringify(earlier)).not.toContain(PAGE_TEXT);
    expect(JSON.stringify(fresh!.context.evidenceLoop?.evidence ?? []).split(PAGE_TEXT).length - 1).toBeLessThanOrEqual(1);

    // The note still carries the tried list and what the loop stopped on, in Core's words only.
    const note = noteOf(fresh!)!;
    const told = note.tried as JsonObject;
    expect((told.tried as JsonObject[]).some((entry) => entry.toolId === "core.run_node" && entry.outcome === "failed")).toBe(true);
    expect(told.loopStopped).toBeDefined();
    expect(JSON.stringify(note)).not.toContain("the wrong list");

    // The page was never navigated: between the first round's last decision and the fresh round's first, only that
    // decision's own call and the fresh round's look in place ran, and nothing ever reset the site.
    const between = library.calls.slice(callsBeforeLastDecision, callsAtFresh);
    expect(between.filter((call) => call.toolId !== LOOK_TOOL && (call.value.parameters as JsonObject | undefined)?.from !== "the wrong list")).toEqual([]);
    expect(between.some((call) => call.toolId === LOOK_TOOL)).toBe(true);
    expect(library.calls.filter((call) => call.value.replay === "reset")).toEqual([]);

    const kept = await keptAttempt(attempt.service, attempt.projectId, attempt.flowId);
    expect(kept?.tried.approaches).toBeGreaterThanOrEqual(1);
  });
});

// A carried-on attempt (Add budget and carry on, after its process ended) is the same attempt going on: its first round
// is a fresh round too, and starts with what the earlier segment did and found, from the trail held across the restart.
describe("a carried-on attempt's first round", () => {
  const TITLES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dune Walks"];
  const PERMITTED = { instruction: "Renew every loan on my library account and list them.", taskProcessing: { process: {} }, permittedConsequences: ["modify_existing" as const] };
  const press = (title: string) => runNode(`renew.${title.replace(/\W+/gu, "-")}`, RENEW_LOAN, { title }, ["modify_existing"], { add: true });

  it("starts with what the earlier segment read and pressed, and no page view", async () => {
    const lane = await laterAttempts(cleanups, { titles: TITLES });
    const first = await lane.attempt({ ...PERMITTED, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true, script: [readLoans(), press("Atlas of Rivers"), press("Birds of the Coast")] });
    const pressed = await automationStudioAnswerFirstCarryOn(lane.service, lane.stores, { projectId: lane.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.4 }, () => lane.attempt({ ...PERMITTED, costUsd: 0.04, script: [press("Clockmaking"), press("Dune Walks"), complete("All renewed.")] }));
    if (!pressed.ok) throw new Error(`refused: ${pressed.refused}`);
    const second = await pressed.finished;
    const window = windowOf(second.decisions[0]!);
    expect(window[0]?.toolId).toBe("core.attempt_note");
    expect(window[1]?.toolId).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID);
    const calls = window[1]!.value.calls as JsonObject[];
    // The read of the earlier segment, with its rows, and the two presses it made, with how they came back.
    expect(calls.some((call) => call.did === READ_LOANS && JSON.stringify(call.found ?? {}).includes("Atlas of Rivers"))).toBe(true);
    const presses = calls.filter((call) => call.did === RENEW_LOAN);
    expect(presses.map((call) => ((call.asked as JsonObject).parameters as JsonObject).title)).toEqual(expect.arrayContaining(["Atlas of Rivers", "Birds of the Coast"]));
    expect(presses.every((call) => typeof call.outcome === "string")).toBe(true);
    expect(calls.every((call) => (call.found as JsonObject | undefined)?.page === undefined || (call.found as JsonObject).page === "core.view_not_carried")).toBe(true);
  });
});
