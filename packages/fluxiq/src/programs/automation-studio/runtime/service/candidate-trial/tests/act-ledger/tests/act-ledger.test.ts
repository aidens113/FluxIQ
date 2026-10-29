import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowArtifact } from "../../../../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../../../../executor/index.ts";
import { automationStudioTrialActLedger } from "../../../index.ts";
import { runLibraryHolds } from "./library-holds-loop.ts";

// The per-pass act ledger (t796, debug `run-mvtdn37t-e1e4d0a7`): for every pass of a repeat and the run outside one,
// what each step that does a lasting act, and each step a guard can route past, did on that pass -- including the
// passes it has no attempt on, which the trial's step list never names.

const banner = "close the library banner";

describe("a guarded act step in a loop", () => {
  it("is not run, guarded, on every pass the banner was absent, and so is the wait that follows it", async () => {
    const { graph, trace } = await runLibraryHolds();
    expect(trace.status).toBe("succeeded");
    const ledger = automationStudioTrialActLedger(trace, graph);
    const guarded = [1, 2, 3].map((pass) => ({ pass, status: "not_run", why: "guarded", after: banner }));
    expect(ledger).toEqual([
      { nodeId: "hold", definitionId: "builtin.policy.action", label: "place a hold", lasting: true, guard: { nodeId: "banner", label: banner }, repeat: { nodeId: "each", passes: 3 }, passes: guarded },
      { nodeId: "settle", definitionId: "builtin.timing.wait", label: "wait for the hold to settle", lasting: false, guard: { nodeId: "banner", label: banner }, repeat: { nodeId: "each", passes: 3 }, passes: guarded }
    ]);
  });

  it("ran, its act changed, on the pass the banner showed and was closed, numbered as the feedback numbers its step", async () => {
    const { graph, trace } = await runLibraryHolds([2]);
    const hold = automationStudioTrialActLedger(trace, graph).find((entry) => entry.nodeId === "hold")!;
    expect(hold.passes.map(({ pass, status }) => [pass, status])).toEqual([[1, "not_run"], [2, "ran"], [3, "not_run"]]);
    expect(hold.passes[1]).toEqual({ pass: 2, step: expect.any(Number), status: "ran", act: "changed" });
    const settle = automationStudioTrialActLedger(trace, graph).find((entry) => entry.nodeId === "settle")!;
    // A step that does no lasting act says no act when it ran.
    expect(settle.passes[1]).toEqual({ pass: 2, step: expect.any(Number), status: "ran" });
  });
});

// One step per outcome, outside any repeat: each a domain press that declares a lasting consequence.
const outcomes = ["changed", "unseen", "held", "absent", "already", "otherRow", "covered", "failed", "unreached"] as const;
const graph = {
  nodes: outcomes.map((id) => ({ id, label: `press ${id}`, definitionId: "library.press", metadata: { declaredConsequences: ["modify_existing"], bootstrapSymbolicKey: `k-${id}` } })),
  edges: []
} as unknown as AutomationStudioFlowArtifact;
const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace>): AutomationStudioNodeAttemptTrace => ({ attemptId: `a-${nodeId}`, nodeId, definitionId: "library.press", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra });
const failure = (code: string) => ({ category: "action_failed" as const, code, retryable: false });
const trace: AutomationStudioGraphExecutionTrace = {
  status: "failed", startedAt: 1, values: {}, effects: [],
  attempts: [
    attempt("changed", {}),
    attempt("unseen", { effectCheck: { result: "not_landed", checkedAt: 2 } }),
    attempt("held", { status: "failed", failure: failure("library.action.failed"), stateHeld: { rung: "skip_satisfied_node", route: "success" } }),
    attempt("absent", { route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } }),
    attempt("already", { skipped: { reason: "already_in_state", code: "executor.already_in_state", row: "the second book" } }),
    attempt("otherRow", { status: "failed", route: "failed", failure: failure("library.target.not_found"), outputs: { result: { result: { resolution: { refusedBecause: "other-record" } } } } }),
    attempt("covered", { status: "failed", route: "failed", failure: failure("library.action.target_covered") }),
    attempt("failed", { status: "failed", route: "failed", failure: failure("library.action.failed") })
  ]
};

describe("each outcome a lasting step's pass can have", () => {
  const ledger = automationStudioTrialActLedger(trace, graph);
  const pass = (id: string) => ledger.find((entry) => entry.nodeId === id)?.passes;

  it("tracks every lasting step, with its plan key and no repeat outside one", () => {
    expect(ledger.map((entry) => entry.nodeId)).toEqual([...outcomes]);
    expect(ledger[0]).toMatchObject({ nodeId: "changed", label: "press changed", key: "k-changed", lasting: true });
    expect(ledger.every((entry) => entry.repeat === undefined && entry.passes.length === 1 && entry.passes[0]!.pass === undefined)).toBe(true);
  });

  it("says ran, with its act: changed when it landed, no_change_seen when nothing landed, already_in_state when the page already showed it", () => {
    expect(pass("changed")).toEqual([{ step: 1, status: "ran", act: "changed" }]);
    expect(pass("unseen")).toEqual([{ step: 2, status: "ran", act: "no_change_seen" }]);
    expect(pass("held")).toEqual([{ step: 3, status: "ran", act: "already_in_state" }]);
  });

  it("says skipped: absent, or already in its asked state with the row it ran on", () => {
    expect(pass("absent")).toEqual([{ step: 4, status: "skipped", why: "absent" }]);
    expect(pass("already")).toEqual([{ step: 5, row: "the second book", status: "skipped", why: "already_in_state" }]);
  });

  it("says refused for another row's control or a covering layer, and failed by its code otherwise", () => {
    expect(pass("otherRow")).toEqual([{ step: 6, status: "refused", why: "other_row" }]);
    expect(pass("covered")).toEqual([{ step: 7, status: "refused", why: "covered" }]);
    expect(pass("failed")).toEqual([{ step: 8, status: "failed", code: "library.action.failed" }]);
  });

  it("says not run, unreached, for a lasting step the run never got to", () => {
    expect(pass("unreached")).toEqual([{ status: "not_run", why: "unreached" }]);
  });
});

describe("a pass that stopped before its guard", () => {
  it("says the act step unreached on that pass, guarded on the passes the banner was skipped", async () => {
    const { graph: loop, trace: run } = await runLibraryHolds();
    // The same run, cut at the third pass's open, which failed: the banner and the hold were never reached on it.
    const third = run.attempts.findIndex((each, index) => each.nodeId === "open" && run.attempts.slice(0, index).filter((earlier) => earlier.nodeId === "open").length === 2);
    const cut: AutomationStudioGraphExecutionTrace = { ...run, status: "failed", attempts: [...run.attempts.slice(0, third), { ...run.attempts[third]!, status: "failed", route: "failed", failure: failure("library.action.failed") }] };
    const hold = automationStudioTrialActLedger(cut, loop).find((entry) => entry.nodeId === "hold")!;
    expect(hold.passes).toEqual([
      { pass: 1, status: "not_run", why: "guarded", after: banner },
      { pass: 2, status: "not_run", why: "guarded", after: banner },
      { pass: 3, status: "not_run", why: "unreached" }
    ]);
  });

  it("puts nothing in the ledger for a loop that ran no passes", async () => {
    const { graph: loop, trace: run } = await runLibraryHolds();
    const firstBody = run.attempts.findIndex((each) => each.nodeId === "each");
    const none: AutomationStudioGraphExecutionTrace = { ...run, attempts: [...run.attempts.slice(0, firstBody), { ...run.attempts[firstBody]!, route: "done" }] };
    expect(automationStudioTrialActLedger(none, loop)).toEqual([]);
  });
});
