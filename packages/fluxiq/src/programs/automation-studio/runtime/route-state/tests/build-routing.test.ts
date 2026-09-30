// What a Flow build's routing costs the page, per decision, before and after it
// read its route states off its calls (t196-wL2).
//
// Every `observeRouteState` call is a whole page capture in the web domain: a
// "Looking at the page" the person watching the side panel sees. Before, the
// build's routing asked for one at build start and again before every decision
// whose shown evidence count had grown. Now a call may report the route state
// of the page it left (`routeState`), and the host is asked only where no call
// left a current one.
//
// "Before" is measured, not assumed: `startBuildRoutingBeforeWL2` below is the
// rule as it stood (Core `route-state.ts` at t196's merge base), run on the same
// loop, the same script and the same fake page as the new one.

// The llm barrel first: `runtime/loop-limits/` imports back into it.
import {
  automationStudioLlmRunNodeTool,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceCompletionCheck,
  type AutomationStudioLlmEvidenceLoopResult,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../llm/index.ts";
import { replayRecordedRun, type RecordedRunName } from "../../llm/decision-context/tests/recorded-runs.ts";
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../../loop-limits/index.ts";
import { buildAutomationStudioFlowBootstrapRoutingContext, type AutomationStudioFlowBootstrapRoutingContext } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { observeAutomationStudioRouteState, startAutomationStudioBuildRouting } from "../index.ts";

const SNAPSHOT = "web.output.dom-capture_snapshot";
const CLICK = "web.output.dom-click";
const NAVIGATE = "web.output.browser-navigate";
const START = "https://store.test/start";
const look = (callId: string): Record<string, unknown> => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node: SNAPSHOT, parameters: {}, consequences: [] } });
const act = (callId: string, node = CLICK, handle = "h.1"): Record<string, unknown> => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters: { target: { handle } }, consequences: [] } });
const routeStateOf = (world: number): JsonObject => ({ page: { path: `/page/${world}` } });

/** The build routing as it stood before t196-wL2: captured at start, and before every decision whose shown count grew. */
async function startBuildRoutingBeforeWL2(input: { hostRuntime: AutomationStudioHostRuntimeBoundary; projectId: string; flowId: string }) {
  const observations: Array<{ seen: string; state: JsonObject }> = [];
  const start = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId });
  if (start.ok) observations.push({ seen: "where a run starts, before any step runs", state: start.state });
  let observedEvidence = 0;
  return {
    context: () => buildAutomationStudioFlowBootstrapRoutingContext({
      current: "The Flow is blank: it has no routes and no subflows yet.",
      flowInputs: [],
      statePaths: input.hostRuntime.routeStatePaths ?? [],
      observations,
      ...(start.ok ? {} : { stateUnavailable: start.reason })
    }),
    observing: <T extends { evidence: ReadonlyArray<{ toolId: string }>; signal?: AbortSignal | undefined }, R>(decide: (input: T) => Promise<R>) => async (decision: T): Promise<R> => {
      if (start.ok && decision.evidence.length > observedEvidence) {
        observedEvidence = decision.evidence.length;
        const explored = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(decision.signal ? { signal: decision.signal } : {}) });
        if (explored.ok) observations.push({ seen: `after exploring with ${decision.evidence.at(-1)?.toolId ?? "a tool"}`, state: explored.state });
      }
      return await decide(decision);
    }
  };
}

type Script = Record<number, Record<string, unknown>>;
type Routing = "before" | "after";
/** What one decision's call meets: a refusal, a result that reports no route state, a call that throws. */
type Outcome = { refused?: string; unreported?: true; throws?: true };
type Build = {
  result: AutomationStudioLlmEvidenceLoopResult | { threw: unknown };
  /**
   * `observeRouteState` calls, by the decision they were made for: "start" is
   * the build start, N every capture after decision N-1 was answered and before
   * decision N was made (1 includes the free first look).
   */
  captures: Map<number | "start", number>;
  /** The routing context each decision was shown. */
  contexts: Map<number, AutomationStudioFlowBootstrapRoutingContext>;
  /** Shown evidence entries, per decision. */
  shown: Map<number, number>;
  /** Decisions whose previous decision (or the free first look, for 1) ran at least one call. */
  afterCalls: Set<number>;
  decisions: number;
};

/**
 * Runs a scripted build through the real evidence loop, dry run on, against a
 * fake page that moves when an action applies and goes back to the start on a
 * replay's reset. A result reports the digests either side (as the web domain
 * does since t196) and, unless told otherwise, the route state it left; a host
 * capture returns the same route state, so the two agree by construction.
 */
async function build(script: Script, routing: Routing, options: {
  outcomes?: Record<number, Outcome>;
  checks?: Record<number, string>;
  reportsRouteState?: boolean;
  freeFirstLook?: boolean;
  start?: "now" | "first_look";
} = {}): Promise<Build> {
  let world = 0;
  let iteration = 0;
  let bucket: number | "start" = "start";
  const captures = new Map<number | "start", number>();
  const contexts = new Map<number, AutomationStudioFlowBootstrapRoutingContext>();
  const shown = new Map<number, number>();
  const afterCalls = new Set<number>();
  const hostRuntime: AutomationStudioHostRuntimeBoundary = {
    capabilities: ["route-state"],
    routeStatePaths: [{ path: "state.page.path", description: "The page's path." }],
    observeRouteState: () => { captures.set(bucket, (captures.get(bucket) ?? 0) + 1); return routeStateOf(world); }
  };
  const target = { hostRuntime, projectId: "p.1", flowId: "f.1" };
  const now = routing === "after" ? await startAutomationStudioBuildRouting({ ...target, flowInputs: [], start: options.start ?? "first_look" }) : undefined;
  const old = routing === "before" ? await startBuildRoutingBeforeWL2(target) : undefined;
  bucket = 1;
  const reports = (outcome: Outcome | undefined) => (options.reportsRouteState ?? true) && !outcome?.unreported;

  const executeTool = async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    afterCalls.add(iteration + 1);
    const outcome = options.outcomes?.[iteration];
    if (outcome?.throws) throw new Error("the call threw");
    const before = `page.${world}`;
    const reported = (): { routeState?: JsonObject } => (reports(outcome) ? { routeState: routeStateOf(world) } : {});
    // A dry-run call: the reset, then each proposed step again.
    if (value.replay === "reset") {
      world = 0;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, replay: "reset" }, effectApplied: true, resultCode: "core.replay.replayed", stateDigests: { before, after: `page.${world}` }, ...reported() };
    }
    if (value.replay === "step") {
      world += 1;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, replay: "step", replayed: true }, effectApplied: true, resultCode: "core.replay.replayed", stateDigests: { before, after: `page.${world}` }, ...reported() };
    }
    const node = String(value.node);
    const refused = outcome?.refused;
    const looks = node === SNAPSHOT;
    if (!looks && !refused) world += 1;
    return {
      kind: "llm_evidence_tool_execution",
      evidence: refused ? { ok: false, code: refused, node } : { ok: true, node, page: `page.${world}` },
      effectApplied: !looks && !refused,
      resultCode: refused ? `web.action.rejected.${refused}` : looks ? "web.inspect.succeeded" : "web.action.succeeded",
      stateDigests: { before, after: `page.${world}` },
      draft: {
        actionId: node,
        input: value,
        effect: looks ? "observe" : "mutate",
        proposes: !looks,
        ...(refused ? {} : { ranWith: { node, parameters: (value.parameters ?? {}) as JsonObject, consequences: [] }, ...(looks ? {} : { replay: { from: { location: START } } }) })
      },
      ...reported()
    };
  };
  const decide = async (request: { iteration: number; evidence: ReadonlyArray<{ callId: string; toolId: string; value: unknown }>; signal?: AbortSignal | undefined }): Promise<unknown> => {
    iteration = request.iteration;
    shown.set(iteration, request.evidence.length);
    contexts.set(iteration, (now ?? old)!.context());
    bucket = iteration + 1;
    return script[iteration] ?? { kind: "complete", result: { done: true } };
  };
  const checkCompletion = (): AutomationStudioLlmEvidenceCompletionCheck => {
    const code = options.checks?.[iteration];
    return code ? { ok: false, issueCodes: [code], feedback: { code, instruction: "Fix it." } } : { ok: true };
  };
  const tool = automationStudioLlmRunNodeTool({ nodeIds: [NAVIGATE, CLICK, SNAPSHOT], ...(options.freeFirstLook === false ? {} : { initial: { node: SNAPSHOT, parameters: {}, consequences: [] } }) })!;
  const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 48 });
  let result: Build["result"];
  try {
    result = await runAutomationStudioLlmEvidenceLoop({
      tools: [tool],
      decide: now ? now.observing(decide) : old!.observing(decide),
      executeTool: now ? now.recording(executeTool) : executeTool,
      checkCompletion,
      propagateDecisionErrors: true,
      unusableDecisions: { maxConsecutive: limits.maxConsecutiveUnusableDecisions, stalled: () => new Error("stalled") },
      ...limits.loop,
      budget: { ...limits.loop.budget, now: () => 1_790_000_000_000 }
    });
  } catch (thrown) {
    result = { threw: thrown };
  }
  return { result, captures, contexts, shown, afterCalls, decisions: Math.max(0, ...shown.keys()) };
}

const at = (run: Build, key: number | "start"): number => run.captures.get(key) ?? 0;
const total = (run: Build): number => [...run.captures.values()].reduce((sum, value) => sum + value, 0);
const statesOf = (context: AutomationStudioFlowBootstrapRoutingContext | undefined) => context?.situations.map((situation) => situation.state);
const isSubsequence = (part: readonly unknown[], whole: readonly unknown[]): boolean => {
  let from = 0;
  for (const item of part) {
    const found = whole.findIndex((candidate, index) => index >= from && JSON.stringify(candidate) === JSON.stringify(item));
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
};
const traceOf = (run: Build) => ("trace" in run.result ? run.result.trace : []);

// ---------------------------------------------------------------------------
// One of each kind of decision.
//
//   0 free first look   1 action   2 look   3 the same look (first re-ask: run
//   once more)   4 the same look (answered from memory)   5 amendment
//   6 action whose result reports no route state   7 completion, refused by
//   the check, dry run replays the draft   8 completion, accepted
// ---------------------------------------------------------------------------

const KINDS: Script = {
  1: act("c.1"),
  2: look("l.2"),
  3: look("l.3"),
  4: look("l.4"),
  5: { kind: "amend_draft", amendments: [{ step: 1, change: "keep", settings: { amended: 5 } }] },
  6: act("c.6", CLICK, "h.6"),
  7: { kind: "complete", result: { done: 7 } },
  8: { kind: "complete", result: { done: 8 } }
};
const KINDS_OPTIONS = { outcomes: { 6: { unreported: true as const } }, checks: { 7: "recorded.check_refused" } };
// Which decision's cost each row is: what it ran is paid for before the decision after it.
const KIND_ROWS: Array<{ kind: string; paidAt: number | "start" }> = [
  { kind: "build start", paidAt: "start" },
  { kind: "free first look (before decision 1)", paidAt: 1 },
  { kind: "action (1)", paidAt: 2 },
  { kind: "look (2)", paidAt: 3 },
  { kind: "first re-ask, run once more (3)", paidAt: 4 },
  { kind: "answered from memory (4)", paidAt: 5 },
  { kind: "amendment (5)", paidAt: 6 },
  { kind: "action reporting no route state (6)", paidAt: 7 },
  { kind: "completion refused, dry run replays (7)", paidAt: 8 }
];

describe("route-state captures per decision type", () => {
  it("before: one at build start and one before every decision whose shown count grew; after: one only where the newest call reported none", async () => {
    const before = await build(KINDS, "before", KINDS_OPTIONS);
    const after = await build(KINDS, "after", KINDS_OPTIONS);
    const unreported = await build(KINDS, "after", { ...KINDS_OPTIONS, reportsRouteState: false });
    const rows = KIND_ROWS.map((row) => ({ ...row, before: at(before, row.paidAt), after: at(after, row.paidAt), "after, no call reports": at(unreported, row.paidAt) }));
    console.table(rows);
    console.table({ before: { total: total(before), decisions: before.decisions }, after: { total: total(after), decisions: after.decisions }, "after, no call reports": { total: total(unreported), decisions: unreported.decisions } });

    // The same build either way.
    expect(traceOf(before).map((row) => [row.iteration, row.decision, row.resultCode])).toEqual(traceOf(after).map((row) => [row.iteration, row.decision, row.resultCode]));
    expect(traceOf(after).find((row) => row.iteration === 4)).toMatchObject({ resultCode: "llm_evidence_loop.already_answered" });
    expect(after.result).toMatchObject({ ok: true });
    // Before: the old trigger exactly -- the start, then each decision whose shown count passed the highest seen.
    let highest = 0;
    for (const [decision, count] of before.shown) {
      expect(at(before, decision), `before, decision ${decision}`).toBe(count > highest ? 1 : 0);
      highest = Math.max(highest, count);
    }
    expect(at(before, "start")).toBe(1);
    // After, calls reporting: only the decision after the one call that reported nothing.
    expect(Object.fromEntries(rows.map((row) => [row.kind, row.after]))).toEqual(Object.fromEntries(rows.map((row) => [row.kind, row.paidAt === 7 ? 1 : 0])));
    // After, no call reporting: the start, captured right after the free look, then one per decision a call ran before.
    for (const decision of unreported.shown.keys()) {
      expect(at(unreported, decision), `unreported, decision ${decision}`).toBe(unreported.afterCalls.has(decision) ? 1 : 0);
    }
    expect(at(unreported, "start")).toBe(0);
    // Answered from memory, and the amendment, ran nothing: no capture in either after run.
    for (const run of [after, unreported]) expect([at(run, 5), at(run, 6)]).toEqual([0, 0]);
  });

  it("when the call and the capture agree, each decision is shown every state the old rule showed it, in order, and the old rule's misses besides", async () => {
    const before = await build(KINDS, "before", KINDS_OPTIONS);
    for (const reportsRouteState of [true, false]) {
      const after = await build(KINDS, "after", { ...KINDS_OPTIONS, reportsRouteState });
      for (const decision of before.contexts.keys()) {
        const label = `decision ${decision}, calls report: ${reportsRouteState}`;
        // Equal while the old rule still saw every call (its shown count kept growing, 1-6).
        if (decision <= 6) expect(statesOf(after.contexts.get(decision)), label).toEqual(statesOf(before.contexts.get(decision)));
        else expect(isSubsequence(statesOf(before.contexts.get(decision))!, statesOf(after.contexts.get(decision))!), label).toBe(true);
      }
      // Decision 6 ran an action the old rule never observed: its shown count did not grow at 7.
      expect(statesOf(before.contexts.get(7))).toHaveLength(2);
      expect(statesOf(after.contexts.get(7))).toEqual([...statesOf(before.contexts.get(7))!, { "state.page.path": "/page/2" }]);
      const first = after.contexts.get(1)!;
      expect(first.situations[0]).toEqual({ seen: "where a run starts, before any step runs", state: before.contexts.get(1)!.situations[0]!.state });
      expect(first.stateUnavailable).toBeUndefined();
      // Labels name the call that left the state.
      expect(after.contexts.get(8)!.situations.slice(1).map((situation) => situation.seen)).toEqual(after.contexts.get(8)!.situations.slice(1).map(() => "after exploring with core.run_node"));
    }
    console.table({ before: before.contexts.get(8)!.situations.map((situation) => situation.seen), after: (await build(KINDS, "after", KINDS_OPTIONS)).contexts.get(8)!.situations.map((situation) => situation.seen) });
  });

  it("a build written in one reply keeps its eager start capture", async () => {
    let captures = 0;
    const routing = await startAutomationStudioBuildRouting({ hostRuntime: { capabilities: [], observeRouteState: () => { captures += 1; return routeStateOf(0); } }, projectId: "p.1", flowId: "f.1", flowInputs: [] });
    expect(captures).toBe(1);
    expect(routing.context().situations.map((situation) => situation.seen)).toEqual(["where a run starts, before any step runs"]);
  });

  it("a host that observes no state is never deferred to: the context says so, and a call's route state is not read", async () => {
    const routing = await startAutomationStudioBuildRouting({ hostRuntime: { capabilities: [] }, projectId: "p.1", flowId: "f.1", flowInputs: [], start: "first_look" });
    const executeTool = routing.recording(async (_call: { callId: string; toolId: string }) => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, routeState: routeStateOf(3) }));
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    await routing.observing(async (_decision: { signal?: AbortSignal }) => undefined)({});
    expect(routing.context().situations).toEqual([]);
    expect(routing.context().stateUnavailable).toBe("The host observes no state here, so only inputs.* can be tested.");
  });

  it("with no free first look, the start is captured before the first call moves the page, and one capture serves the first decision", async () => {
    const run = await build({ 1: act("c.1"), 2: { kind: "complete", result: { done: 2 } } }, "after", { freeFirstLook: false, reportsRouteState: false });
    expect([at(run, "start"), at(run, 1), at(run, 2)]).toEqual([0, 1, 1]);
    const shownAt2 = statesOf(run.contexts.get(2))!;
    expect(shownAt2).toHaveLength(2);
    expect(shownAt2[0]).toEqual(statesOf(run.contexts.get(1))![0]);
    expect(run.contexts.get(1)!.situations.map((situation) => situation.seen)).toEqual(["where a run starts, before any step runs"]);
    expect(run.contexts.get(2)!.situations.map((situation) => situation.seen)).toEqual(["where a run starts, before any step runs", "after exploring with core.run_node"]);
  });

  it("a call that throws reports nothing, so the decision after it captures", async () => {
    const run = await build({ 1: act("c.1"), 2: act("c.2", CLICK, "h.2"), 3: { kind: "complete", result: { done: 3 } } }, "after", { outcomes: { 1: { throws: true } } });
    expect([at(run, "start"), at(run, 1), at(run, 2), at(run, 3)]).toEqual([0, 0, 1, 0]);
  });
});

// ---------------------------------------------------------------------------
// Recorded builds.
//
// The three builds `../../llm/decision-context/tests/recorded-runs.ts` rebuilds
// from their logs, through the real loop: what each decision was shown, and
// which calls each decision ran. The old trigger is computed from the shown
// counts exactly as the old rule read them; the new one from the calls.
// ---------------------------------------------------------------------------

describe("route-state captures per recorded build", () => {
  const RUNS: RecordedRunName[] = ["bigbox-run6", "crossborder", "everything-store-run4"];
  it("before and after, for the three recorded builds", async () => {
    const rows: Record<string, { decisions: number; before: number; afterReported: number; afterUnreported: number; callsBeforeUnseen: number }> = {};
    for (const name of RUNS) {
      const replay = await replayRecordedRun(name);
      const decisions = replay.shown.map((entry) => entry.iteration);
      // A decision is preceded by calls when the one before it (the free look, for the first) ran any.
      const ranCalls = new Map(replay.rebuilt.map((line) => [Number(/^D(\d+)/.exec(line)![1]), line.split(" | ").slice(1).some((event) => !event.startsWith("check "))] as const));
      let highest = 0;
      let before = 1; // the build start
      // Decisions a call ran before that the old rule did not observe: the state that call left was never shown.
      let callsBeforeUnseen = 0;
      for (const { iteration, evidence } of replay.shown) {
        if (evidence.length > highest) before += 1;
        else if (ranCalls.get(iteration - 1) === true) callsBeforeUnseen += 1;
        highest = Math.max(highest, evidence.length);
      }
      expect(ranCalls.get(0), `${name} opens with a free first look`).toBe(true);
      // Unreported: the start once, right after the free look (it serves decision 1), then one per decision a call ran before.
      const afterUnreported = 1 + decisions.filter((decision) => decision > 1 && ranCalls.get(decision - 1) === true).length;
      // Reported: every call in these builds is a domain call or a dry-run call, so each would carry its own.
      rows[name] = { decisions: decisions.length, before, afterReported: 0, afterUnreported, callsBeforeUnseen };
    }
    console.table(rows);
    // The old trigger is a high-water mark on the shown count. While the window was capped it stopped
    // growing once the window was full and missed most of the states these builds reached; with every
    // evidence entry shown (2026-09-30) it grows with the evidence, and still misses a call whose
    // evidence did not add an entry.
    expect(rows).toEqual({
      "bigbox-run6": { decisions: 37, before: 15, afterReported: 0, afterUnreported: 17, callsBeforeUnseen: 7 },
      crossborder: { decisions: 22, before: 12, afterReported: 0, afterUnreported: 11, callsBeforeUnseen: 2 },
      "everything-store-run4": { decisions: 48, before: 29, afterReported: 0, afterUnreported: 32, callsBeforeUnseen: 6 }
    });
  });

  // run-munneauy-de8663ed, as `../../llm/decision-handlers/tests/state-digest-cost.test.ts` rebuilds it (script and outcomes copied from there).
  it("run-munneauy-de8663ed, rebuilt: before and after through the real routing", async () => {
    const script: Script = {
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
    const outcomes: Record<number, Outcome> = { 0: { refused: "not_at_start_location" }, 2: { refused: "target_unobserved" }, 4: { refused: "target_unobserved" } };
    const before = await build(script, "before", { outcomes });
    const after = await build(script, "after", { outcomes });
    const unreported = await build(script, "after", { outcomes, reportsRouteState: false });
    console.table({
      before: { decisions: before.decisions, captures: total(before) },
      after: { decisions: after.decisions, captures: total(after) },
      "after, no call reports": { decisions: unreported.decisions, captures: total(unreported) }
    });
    expect(traceOf(after).map((row) => [row.iteration, row.resultCode])).toEqual(traceOf(before).map((row) => [row.iteration, row.resultCode]));
    expect([total(before), total(after), total(unreported)]).toEqual([12, 0, 9]);
    expect(total(unreported)).toBe(1 + [...unreported.shown.keys()].filter((decision) => decision > 1 && unreported.afterCalls.has(decision)).length);
    for (const decision of before.contexts.keys()) expect(isSubsequence(statesOf(before.contexts.get(decision))!, statesOf(after.contexts.get(decision))!), `decision ${decision}`).toBe(true);
  });
});
