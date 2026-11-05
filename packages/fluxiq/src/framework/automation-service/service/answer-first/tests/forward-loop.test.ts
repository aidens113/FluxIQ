// @fluxiq-test-group real-sql
// The first row by hand, then the written loop on the rest, through the real service (t869).
//
// Paid run `run-mw37vz9n-a77a02c2` did this: it read the rows, opened and saved the first by hand, wrote a loop that
// opens a row, sets its Save to on and goes back, went to another page to see the saved items, and asked for the loop
// by its first step. Nothing reached the other rows, and it did them by hand at about a dollar. The target here is the
// same shape: a list, a page per row, and a state on that page that a press toggles, so a second press shows as undone.
// Setting a state that is already set presses nothing, as the page's check does (`content/actions/check.ts`). A step
// that asks to be reached first moves the page to the list, as the web domain's replay does (`node-run/reach-page/`).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, READ_LOANS, RENEW_CARD, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CONSEQUENCES = ["modify_existing"];
const OPEN = "open-its-page";
const SET_ON = "set-renewed-on";
const ELSEWHERE = "elsewhere";

/** Where the target stands, and what was done to it. */
type Site = { at: string; on: Set<string>; presses: Record<string, number>; opened: string[]; backs: number; reached: number; failSetOn: readonly string[]; failBack: readonly string[]; failRead: boolean; rowsAnswered: boolean };

const replayAnswer = (evidence: JsonObject, over: Partial<AutomationStudioLlmEvidenceToolExecutionResult> = {}): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence, effectApplied: true, resultCode: "core.replay.replayed", draft: { actionId: RENEW_LOAN, effect: "mutate", proposes: true }, ...over
});

const notRun = (reason?: string): Partial<AutomationStudioLlmEvidenceToolExecutionResult> => ({ effectApplied: false, resultCode: "core.replay.failed", ...(reason ? { resultReason: reason } : {}) });

function siteFault(site: Site) {
  return (call: { toolId: string; value: JsonObject }, library: FakeLibrary): AutomationStudioLlmEvidenceToolExecutionResult | undefined => {
    if (call.value.node === RENEW_CARD && (call.value.parameters as JsonObject).title === ELSEWHERE) {
      site.at = ELSEWHERE;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true };
    }
    if (call.value.replay !== "step") return undefined;
    if (call.value.reach === true) {
      site.reached += 1;
      site.at = "list";
    }
    if (call.value.node === READ_LOANS) {
      if (site.at !== "list" || site.failRead) return replayAnswer({ ok: false, code: "core.replay.unreproducible", said: "the list never appeared" }, { effectApplied: false, resultCode: "core.replay.unreproducible" });
      const rows = library.loans.map((loan) => ({ ...loan }));
      return replayAnswer({ ok: true, said: "read", readRows: { rows: rows.map((row) => ({ title: row.title })) } }, site.rowsAnswered ? { outputs: { records: rows } } : {});
    }
    const row = String((call.value.item as JsonObject | undefined)?.title);
    if (call.value.node === RENEW_CARD) {
      if (site.failBack.includes(site.at)) return replayAnswer({ ok: false, said: "the way back did not run" }, notRun());
      site.backs += 1;
      site.at = "list";
      return replayAnswer({ ok: true, said: "the step ran again" });
    }
    const named = String((call.value.parameters as JsonObject).title);
    if (named === OPEN) {
      if (site.at !== "list") return replayAnswer({ ok: false, said: "the step did not run" }, { effectApplied: false, resultCode: "core.replay.unreproducible", resultReason: "row_control_not_found" });
      site.opened.push(row);
      site.at = row;
      return replayAnswer({ ok: true, said: "the step ran again" });
    }
    if (named === SET_ON) {
      if (site.failSetOn.includes(row)) return replayAnswer({ ok: false, said: "the step did not run" }, notRun("target_ambiguous"));
      if (site.at === "list" || site.at === ELSEWHERE) return replayAnswer({ ok: false, said: "the step did not run (target_not_found)" }, { effectApplied: false, resultCode: "core.replay.unreproducible" });
      if (!site.on.has(site.at)) {
        site.on.add(site.at);
        site.presses[site.at] = (site.presses[site.at] ?? 0) + 1;
      }
      return replayAnswer({ ok: true, said: "the step ran again", changed: ["Renewed"] });
    }
    return undefined;
  };
}

type Run = { from: "the loop's first step" | "the list"; failSetOn?: readonly string[]; failBack?: readonly string[]; failRead?: boolean; rowsAnswered?: boolean };

async function firstRowByHandThenTheLoop(input: Run) {
  const library = fakeLibrary();
  const site: Site = { at: "list", on: new Set(), presses: {}, opened: [], backs: 0, reached: 0, failSetOn: input.failSetOn ?? [], failBack: input.failBack ?? [], failRead: input.failRead ?? false, rowsAnswered: input.rowsAnswered ?? true };
  const attempt = await scriptedAttempt({
    library,
    instruction: "Renew every loan on my library account.",
    permittedConsequences: ["modify_existing"],
    fault: siteFault(site),
    script: [
      runNode("read", READ_LOANS),
      runNode("first", RENEW_LOAN, { title: library.loans[0]!.title }, CONSEQUENCES),
      toolCall("flow-read", "core.run_node", { node: READ_LOANS, parameters: {}, consequences: [], write: true }),
      toolCall("flow-open", "core.run_node", { node: RENEW_LOAN, parameters: { title: OPEN }, consequences: [], write: true }),
      toolCall("flow-set-on", "core.run_node", { node: RENEW_LOAN, parameters: { title: SET_ON }, consequences: CONSEQUENCES, write: true }),
      toolCall("flow-back", "core.run_node", { node: RENEW_CARD, parameters: {}, consequences: [], write: true }),
      { kind: "amend_draft", amendments: [{ step: 5, change: "repeat", through: 7, over: 4, most: 3 }] },
      // The model looks at another page before it runs the loop, as the paid run looked at the saved items.
      runNode("look-elsewhere", RENEW_CARD, { title: ELSEWHERE }),
      toolCall("forward", "core.run_flow", { from: input.from === "the list" ? 4 : 5 }),
      complete("Renewed what could be renewed.")
    ]
  }, cleanups);
  const asked = attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision").at(-1);
  const told = asked?.context.evidenceLoop?.evidence.find((entry) => entry.callId === "forward")?.value as JsonObject | undefined;
  const loopCalls = library.calls.filter((call) => call.value.replay === "step" && call.value.item !== undefined);
  return { attempt, library, site, told, loopCalls };
}

const FIRST = "Atlas of Rivers";
const MIDDLE = "Birds of the Coast";
const LAST = "Clockmaking";

describe("the first row by hand, then the loop that opens a row, sets a state and goes back", () => {
  it("asked for by the loop's first step from another page: the list is read on its page, each other row is pressed once, the first never", async () => {
    const { attempt, library, site, told, loopCalls } = await firstRowByHandThenTheLoop({ from: "the loop's first step" });
    expect(site.opened).toEqual([MIDDLE, LAST]);
    expect(site.presses).toEqual({ [MIDDLE]: 1, [LAST]: 1 });
    expect(library.renewals).toEqual({ [FIRST]: 1 });
    expect(loopCalls.some((call) => (call.value.item as JsonObject).title === FIRST)).toBe(false);
    expect(site.reached).toBe(1);
    expect(told).toMatchObject({ ok: true, passed: true, rows: { done: 2, skipped: 1, failed: 0 } });
    expect(library.calls.some((call) => call.value.replay === "reset")).toBe(false);
    expect(attempt.answered.status).toBe("answered");
    expect(attempt.scriptRanOut).toBe(false);
  });

  it("each act of a forward run names the row it was on, in the row's own words", async () => {
    const { attempt } = await firstRowByHandThenTheLoop({ from: "the loop's first step" });
    if (attempt.answered.status !== "answered") throw new Error("no answer");
    const said = (attempt.answered.result?.acts ?? []).map((act) => act.what);
    expect(said.some((what) => what.endsWith(`: ${MIDDLE}`))).toBe(true);
    expect(said.some((what) => what.endsWith(`: ${LAST}`))).toBe(true);
    // Nothing a page minted for the row is in the line: a person reads a listing, not a handle.
    expect(said.join("\n")).not.toMatch(/https?:|handle|row_/iu);
  });

  it("asked for by its list, from another page: the list says this is not its page, and is read once more on its page", async () => {
    const { site, told } = await firstRowByHandThenTheLoop({ from: "the list" });
    expect(site.reached).toBe(1);
    expect(site.presses).toEqual({ [MIDDLE]: 1, [LAST]: 1 });
    expect(told).toMatchObject({ passed: true, rows: { done: 2, skipped: 1, failed: 0 } });
  });

  it("a middle row's step fails: its pass ends and comes back by its own step, it is named, nothing lands on it, and the rest still run", async () => {
    const { attempt, site, told } = await firstRowByHandThenTheLoop({ from: "the loop's first step", failSetOn: [MIDDLE] });
    expect(site.opened).toEqual([MIDDLE, LAST]);
    expect(site.presses).toEqual({ [LAST]: 1 });
    expect(site.backs).toBe(2);
    expect(told).toMatchObject({ ok: true, passed: false, rows: { done: 1, skipped: 1, failed: 1 }, rowsNotDone: [MIDDLE] });
    expect(String(told?.instruction)).toContain(`"${MIDDLE}"`);
    expect(String(told?.instruction)).not.toMatch(/core\.|target_ambiguous/u);
    expect(told?.stoppedAt).toBeUndefined();
    expect(attempt.answered.status).toBe("answered");
    expect(attempt.scriptRanOut).toBe(false);
  });

  it("a middle row saved, whose way back failed: it is done and not named, and the next row goes to the list itself", async () => {
    const { site, told } = await firstRowByHandThenTheLoop({ from: "the loop's first step", failBack: [MIDDLE] });
    expect(site.presses).toEqual({ [MIDDLE]: 1, [LAST]: 1 });
    expect(site.reached).toBe(2);
    expect(told).toMatchObject({ passed: true, rows: { done: 2, skipped: 1, failed: 0 } });
    expect(told?.rowsNotDone).toBeUndefined();
  });

  it("a list that answers no rows sends none of the loop: nothing lasting goes out with no row, the model is told, and the task goes on", async () => {
    const { attempt, library, site, told, loopCalls } = await firstRowByHandThenTheLoop({ from: "the loop's first step", rowsAnswered: false });
    expect(site.opened).toEqual([]);
    expect(site.presses).toEqual({});
    expect(library.renewals).toEqual({ [FIRST]: 1 });
    expect(loopCalls).toEqual([]);
    expect(told).toMatchObject({ ok: true, passed: false, stoppedAt: 5 });
    expect(String(told?.instruction)).toMatch(/answered no rows/u);
    expect(attempt.answered.status).toBe("answered");
    expect(attempt.scriptRanOut).toBe(false);
  });

  it("a list that cannot be read at all stops there, with what ran told, and the task goes on", async () => {
    const { attempt, site, told } = await firstRowByHandThenTheLoop({ from: "the loop's first step", failRead: true });
    expect(site.opened).toEqual([]);
    expect(told).toMatchObject({ ok: true, passed: false, stoppedAt: 4 });
    expect(attempt.answered.status).toBe("answered");
  });
});
