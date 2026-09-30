// What each kind of decision costs the page, now that a call reports its own
// states: executeTool calls and digest-hook calls per decision, the look a
// model asks again for, the looks withdrawn after an ignored redirect, and the
// recorded build that showed all of it (t196, `run-munneauy-de8663ed`).
//
// Every capture the web domain takes is a "Looking at the page" the person
// watching the side panel sees. A digest-hook call was one of those; so is each
// executeTool call that looks. So the two counts below are what the person saw.

// The llm barrel first: `runtime/loop-limits/` imports back into it.
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID,
  automationStudioLlmRunNodeTool,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceLoopResult,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../index.ts";
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../../../loop-limits/index.ts";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";

const SNAPSHOT = "web.output.dom-capture_snapshot";
const CLICK = "web.output.dom-click";
const NAVIGATE = "web.output.browser-navigate";
const look = (callId: string): Record<string, unknown> => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node: SNAPSHOT, parameters: {}, consequences: [] } });
const act = (callId: string, node = CLICK, handle = "h.1"): Record<string, unknown> => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters: { target: { handle } }, consequences: [] } });

type Script = Record<number, Record<string, unknown>>;
type Mode = "states_on_calls" | "digest_hook";
/** What one call meets on the fake page: a refusal, or a page that moved by itself just before it. */
type Outcome = { refused?: string; drift?: true };

type Replay = {
  result: AutomationStudioLlmEvidenceLoopResult | { threw: unknown };
  /** executeTool calls and digest-hook calls, by the iteration that made them (0 is the free first look). */
  executeByIteration: Map<number, number>;
  hookByIteration: Map<number, number>;
  /** What each decision was offered, by iteration. */
  offered: Map<number, AutomationStudioLlmEvidenceTool[]>;
  /** What each decision was shown. */
  shown: Map<number, ReadonlyArray<{ callId: string; toolId: string; value: unknown }>>;
};

/**
 * Runs a scripted build against a fake page. A look reports one state for both
 * sides (its one capture); an action that applies moves the page. In
 * `states_on_calls` mode the result reports them and no hook is given -- what a
 * `stateDigestsOnCalls` binding makes the service do -- and in `digest_hook`
 * mode a hook is given and the results report nothing, as before.
 */
async function replay(script: Script, mode: Mode, options: { outcomes?: Record<number, Outcome> } = {}): Promise<Replay> {
  let world = 0;
  let iteration = 0;
  const executeByIteration = new Map<number, number>();
  const hookByIteration = new Map<number, number>();
  const offered = new Map<number, AutomationStudioLlmEvidenceTool[]>();
  const shown = new Map<number, ReadonlyArray<{ callId: string; toolId: string; value: unknown }>>();
  const bump = (counts: Map<number, number>): void => { counts.set(iteration, (counts.get(iteration) ?? 0) + 1); };
  const tool = automationStudioLlmRunNodeTool({ nodeIds: [NAVIGATE, CLICK, SNAPSHOT], initial: { node: SNAPSHOT, parameters: {}, consequences: [] } })!;

  const executeTool = async ({ value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    bump(executeByIteration);
    const scripted = options.outcomes?.[iteration];
    if (scripted?.drift) world += 1;
    const node = String(value.node);
    const refused = scripted?.refused;
    const looks = node === SNAPSHOT;
    const before = `page.${world}`;
    if (!looks && !refused) world += 1;
    const after = `page.${world}`;
    return {
      kind: "llm_evidence_tool_execution",
      evidence: refused ? { ok: false, code: refused, node } : { ok: true, node, page: after },
      effectApplied: !looks && !refused,
      resultCode: refused ? `web.action.rejected.${refused}` : looks ? "web.inspect.succeeded" : "web.action.succeeded",
      draft: { actionId: node, input: value, effect: looks ? "observe" : "mutate", proposes: !looks },
      ...(mode === "states_on_calls" ? { stateDigests: { before, after } } : {})
    };
  };
  const decide = async (request: { iteration: number; tools: AutomationStudioLlmEvidenceTool[]; evidence: ReadonlyArray<{ callId: string; toolId: string; value: unknown }> }): Promise<unknown> => {
    iteration = request.iteration;
    offered.set(iteration, structuredClone(request.tools));
    shown.set(iteration, structuredClone([...request.evidence]));
    return script[iteration] ?? { kind: "complete", result: { done: true } };
  };
  const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 48 });
  try {
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [tool],
      decide,
      executeTool,
      propagateDecisionErrors: true,
      unusableDecisions: { maxConsecutive: limits.maxConsecutiveUnusableDecisions, stalled: () => new Error("stalled") },
      ...(mode === "digest_hook" ? { captureStateDigest: () => { bump(hookByIteration); return `page.${world}`; } } : {}),
      // The service's limits for a 48-call grant, on a fixed clock.
      ...limits.loop,
      budget: { ...limits.loop.budget, now: () => 1_790_000_000_000 },
      dryRun: false
    });
    return { result, executeByIteration, hookByIteration, offered, shown };
  } catch (thrown) {
    return { result: { threw: thrown }, executeByIteration, hookByIteration, offered, shown };
  }
}

const count = (counts: Map<number, number>, at: number): number => counts.get(at) ?? 0;
const total = (counts: Map<number, number>): number => [...counts.values()].reduce((sum, value) => sum + value, 0);
const traceOf = (run: Replay) => ("trace" in run.result ? run.result.trace : []);
const nodesOffered = (tools: AutomationStudioLlmEvidenceTool[] | undefined): unknown =>
  ((tools?.[0]?.inputSchema.properties as JsonObject | undefined)?.node as JsonObject | undefined)?.enum;

// Look, action, first re-ask, later re-asks, a redirect ignored, a withdrawn
// look, an action, and a look again.
const WITHDRAWAL_SCRIPT: Script = {
  1: act("c.1"),
  2: look("l.2"),
  3: look("l.3"),
  4: look("l.4"),
  5: look("l.5"),
  6: look("l.6"),
  7: look("l.7"),
  8: act("c.8", CLICK, "h.2"),
  9: look("l.9")
};

describe("what each kind of decision costs", () => {
  for (const mode of ["states_on_calls", "digest_hook"] as const) {
    it(`${mode}: a look, an action, a first re-ask, a later re-ask and a withdrawn look`, async () => {
      const run = await replay(WITHDRAWAL_SCRIPT, mode);
      const hookPerCall = mode === "digest_hook" ? 2 : 0;
      const rows = [
        { decision: "free first look", at: 0, execute: 1 },
        { decision: "action", at: 1, execute: 1 },
        { decision: "look", at: 2, execute: 1 },
        { decision: "first re-ask (run once more, same page)", at: 3, execute: 1 },
        { decision: "later re-ask (answered from memory)", at: 4, execute: 0 },
        { decision: "later re-ask, redirect shown after it", at: 5, execute: 0 },
        { decision: "later re-ask ignoring that redirect", at: 6, execute: 0 },
        { decision: "withdrawn look (refused)", at: 7, execute: 0 },
        { decision: "action (looks return)", at: 8, execute: 1 },
        { decision: "look again", at: 9, execute: 1 }
      ];
      console.table(rows.map((row) => ({ ...row, hook: count(run.hookByIteration, row.at), executed: count(run.executeByIteration, row.at) })));
      for (const row of rows) {
        expect(count(run.executeByIteration, row.at), `${row.decision} executeTool`).toBe(row.execute);
        expect(count(run.hookByIteration, row.at), `${row.decision} digest hook`).toBe(row.execute * hookPerCall);
      }
      expect(run.result).toMatchObject({ ok: true });
    });
  }

  it("a look asked again for the first time is a verified repeat: a step without progress, its fresh result replacing the old", async () => {
    const run = await replay(WITHDRAWAL_SCRIPT, "states_on_calls");
    const trace = traceOf(run);
    expect(trace.find((row) => row.iteration === 3)).toMatchObject({ callId: "l.3", progress: { pageState: "unchanged" } });
    const four = run.shown.get(4)!;
    expect(four.filter((entry) => entry.toolId === "core.run_node" && entry.callId.startsWith("l.")).map((entry) => entry.callId)).toEqual(["l.3"]);
    expect(four.find((entry) => entry.toolId === "core.request_check")!.value).toMatchObject({
      code: "llm_evidence_loop.looked_again_unchanged", answeredByCallId: "l.3", pageUnchanged: true, timesAsked: 2, askedAt: [2, 3]
    });
    // The later asks are answered from the fresh result.
    expect(trace.filter((row) => row.resultCode === "llm_evidence_loop.already_answered").map((row) => row.iteration)).toEqual([4, 5, 6]);
  });

  it("an ignored redirect withdraws the look from the node list until an action runs, and a look asked for anyway is refused", async () => {
    const run = await replay(WITHDRAWAL_SCRIPT, "states_on_calls");
    const trace = traceOf(run);
    // Offered in full up to the decision after the ignoring one, narrowed there, and in full again once an action ran.
    expect(nodesOffered(run.offered.get(6))).toEqual([NAVIGATE, CLICK, SNAPSHOT].sort());
    expect(nodesOffered(run.offered.get(7))).toEqual([NAVIGATE, CLICK].sort());
    expect(nodesOffered(run.offered.get(8))).toEqual([NAVIGATE, CLICK].sort());
    expect(nodesOffered(run.offered.get(9))).toEqual([NAVIGATE, CLICK, SNAPSHOT].sort());
    // The loop's own field never reaches the provider.
    expect([...run.offered.values()].flat().every((tool) => !("actionInputKey" in tool))).toBe(true);
    expect(trace.find((row) => row.iteration === 7)).toMatchObject({ decision: "unusable", resultCode: "llm_evidence_loop.look_withdrawn" });
    const feedback = run.shown.get(8)!.find((entry) => entry.toolId === "core.decision_check")!.value as JsonObject;
    expect(feedback.issueCodes).toEqual(["llm_evidence_loop.look_withdrawn"]);
    expect(String(feedback.instruction)).toContain("Looks return once an action runs");
    // The redirect says what ignoring it costs, and then that it has; the history shows the withdrawal.
    const redirectAt = (at: number) => run.shown.get(at)!.find((entry) => entry.toolId === "core.no_progress")!.value as JsonObject;
    expect(String(redirectAt(6).instruction)).toContain("Asking again for what you already hold withdraws looking until you run an action.");
    expect(redirectAt(7)).toMatchObject({ looksWithdrawn: true });
    const history = run.shown.get(7)!.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as JsonObject;
    expect((history.redirects as JsonObject)["llm_evidence_loop.looks_withdrawn"]).toEqual([6]);
  });

  it("a page that moved by itself makes the first re-ask an ordinary look, and progress", async () => {
    // Something on the page changed between the look at 2 and its re-ask at 3.
    const run = await replay({ 1: act("c.1"), 2: look("l.2"), 3: look("l.3"), 4: look("l.4") }, "states_on_calls", { outcomes: { 3: { drift: true } } });
    const trace = traceOf(run);
    expect(count(run.executeByIteration, 3)).toBe(1);
    const four = run.shown.get(4)!;
    // Both looks stay, and no note says the page is unchanged.
    expect(four.filter((entry) => entry.callId.startsWith("l.")).map((entry) => entry.callId)).toEqual(["l.2", "l.3"]);
    expect(four.some((entry) => entry.toolId === "core.request_check")).toBe(false);
    expect(trace.find((row) => row.iteration === 3)).toMatchObject({ callId: "l.3" });
    // The ask after it is answered from memory, with nothing run and no digest,
    // and it is the first step without progress: the look before it was progress.
    expect(count(run.executeByIteration, 4)).toBe(0);
    expect(trace.find((row) => row.iteration === 4)).toMatchObject({ resultCode: "llm_evidence_loop.already_answered" });
    expect(run.shown.get(5)!.find((entry) => entry.toolId === "core.request_check")!.value).toMatchObject({ stepsWithoutProgress: 1 });
  });
});

// ---------------------------------------------------------------------------
// run-munneauy-de8663ed, rebuilt.
//
// t193 lane B's first build (bigbox, 2026-09-30 05:14:48-05:15:50Z), from its
// `snapshots/flow-lane.json` (`build.evidenceLoop.steps`): 18 decisions, 18
// provider calls, ended `flow_bootstrap.evidence_repeat_without_progress`.
//
//   0 free first look, refused (not_at_start_location)   1 navigate
//   2 click refused (target_unobserved)   3 click   4 click refused
//   5 look   6 click   7 look   8-9 answered from memory   10 the same look,
//   run because Core's answer-check digest had moved   11-17 answered from
//   memory   18 an amendment that changed nothing (targets d5, d3)
//
// What the record does not say is chosen: every decision from 8 on is the
// exact request of the look at 7 (the rows say `already_answered` for each,
// which is only ever given for that request), the page does not move by itself
// (so the first re-ask finds it exactly as before), and each click names its
// own handle.
//
// **Before (Core f0dbbd6), from the record and that code.** Every call that ran
// was bracketed by two digest-hook calls, and every look asked again took one
// more for the answer check: 9 calls ran (0-7 and 10), 10 decisions were
// answer-checked (8-17), so 2 x 9 + 10 = 28 digest-hook calls -- each a whole
// page capture in the web domain, on top of the looks' own. 18 provider calls.
// ---------------------------------------------------------------------------

const MUNNEAUY: Script = {
  1: act("nav.1", NAVIGATE, "start"),
  2: act("click.2", CLICK, "h.2"),
  3: act("click.3", CLICK, "h.3"),
  4: act("click.4", CLICK, "h.4"),
  5: look("look.5"),
  6: act("click.6", CLICK, "h.6"),
  7: look("look.7"),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [8 + index, look(`asked.${8 + index}`)])),
  18: { kind: "amend_draft", amendments: [{ step: 5, change: "drop" }, { step: 3, change: "drop" }] }
};
const MUNNEAUY_OUTCOMES: Record<number, Outcome> = { 0: { refused: "not_at_start_location" }, 2: { refused: "target_unobserved" }, 4: { refused: "target_unobserved" } };
const MUNNEAUY_BEFORE = { decisions: 18, providerCalls: 18, executeTool: 9, digestHook: 28, answeredFromMemory: 9, ended: "llm_evidence_loop.repeat_without_progress" };

describe("run-munneauy-de8663ed, rebuilt", () => {
  for (const mode of ["states_on_calls", "digest_hook"] as const) {
    it(`${mode}: looks are withdrawn at 12, the looks asked for there are refused, and the build ends 3 decisions sooner`, async () => {
      const run = await replay(MUNNEAUY, mode, { outcomes: MUNNEAUY_OUTCOMES });
      const trace = traceOf(run);
      const after = {
        decisions: Math.max(...trace.map((row) => row.iteration)),
        providerCalls: run.offered.size,
        executeTool: total(run.executeByIteration),
        digestHook: total(run.hookByIteration),
        answeredFromMemory: trace.filter((row) => row.resultCode === "llm_evidence_loop.already_answered").length,
        ended: "code" in run.result ? run.result.code : "threw"
      };
      console.table({ before: MUNNEAUY_BEFORE, [`after (${mode})`]: after });

      // 0-7 as recorded; 8, the first re-ask, run once more and found the page as it was.
      expect([...run.executeByIteration.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(trace.find((row) => row.iteration === 8)).toMatchObject({ decision: "tool_call", callId: "asked.8", progress: { pageState: "unchanged" } });
      // 9-11 answered from memory, with nothing run and no digest; the redirect at 10 is ignored at 11.
      expect(trace.filter((row) => row.resultCode === "llm_evidence_loop.already_answered").map((row) => row.iteration)).toEqual([9, 10, 11]);
      const history = run.shown.get(12)!.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID)!.value as JsonObject;
      expect((history.redirects as JsonObject)["llm_evidence_loop.looks_withdrawn"]).toEqual([11]);
      // From 12 the snapshot is not offered, and the look scripted there anyway is refused, not answered.
      expect(nodesOffered(run.offered.get(11))).toContain(SNAPSHOT);
      expect(nodesOffered(run.offered.get(12))).toEqual([NAVIGATE, CLICK].sort());
      expect(trace.filter((row) => row.resultCode === "llm_evidence_loop.look_withdrawn").map((row) => row.iteration)).toEqual([12, 13, 14, 15]);
      for (const at of [9, 10, 11, 12, 13, 14, 15]) expect(count(run.executeByIteration, at), `decision ${at}`).toBe(0);
      // The build still ends as the repeat it was, at 15 instead of 18.
      expect(after).toEqual({
        decisions: 15, providerCalls: 15, executeTool: 9, digestHook: mode === "digest_hook" ? 18 : 0, answeredFromMemory: 3, ended: "llm_evidence_loop.repeat_without_progress"
      });
    });
  }
});
