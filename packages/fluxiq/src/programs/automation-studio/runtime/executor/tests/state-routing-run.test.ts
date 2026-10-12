// A step that cannot run -- its target is not on the page, or its readiness
// gate did not hold -- continues where the page is: the run reads the page
// through the host and goes on at the node whose recorded pre-state matches,
// before any recovery rung (user, 2026-10-01 and 2026-10-02; t243). The
// declared way on past a sometimes-present step is its first case, and is
// covered in `../step-skip/tests/absent-step.test.ts`.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

/** The page a fake host is on, by name. A signature is the name, and two match when the names are equal. */
type Page = { current: string; observed: number };

const signatures = (before?: string, after?: string) => ({ routeSignatures: { ...(before ? { before: { page: before } } : {}), ...(after ? { after: { page: after } } : {}) } });

function step(id: string, metadata?: AutomationStudioFlowNode["metadata"], parameters: Record<string, unknown> = {}): AutomationStudioFlowNode {
  return {
    id,
    definitionId: "builtin.policy.action",
    label: `Step ${id}`,
    parameterValues: { outputId: "activate-element", parameters: { elementId: id }, ...parameters } as NonNullable<AutomationStudioFlowNode["parameterValues"]>,
    ...(metadata ? { metadata } : {})
  };
}

function line(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `${nodes[index]!.id}.success`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: node.id, targetPortId: "in" }));
  return { schemaVersion: "0.1", flowId: "flow.state-routing", ownerKind: "routine", ownerId: "routine.test", name: "State routing", createdAt: 1, updatedAt: 1, nodes, edges };
}

function host(page: Page, extra: Partial<Host> = {}): Host {
  return {
    capabilities: [],
    observeRouteState: () => {
      page.observed += 1;
      return { page: page.current };
    },
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (recorded.page === observed.page ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 }),
    ...extra
  };
}

/**
 * Presses the element a node names. `absent` says when its target is not on
 * the page; a press that lands moves the page to `leads[id]`, when given.
 */
function dispatcher(page: Page, calls: string[], absent: (id: string, call: number) => boolean, leads: Record<string, string> = {}): Dispatcher {
  return (effect) => {
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1] ?? "?";
    calls.push(id);
    if (absent(id, calls.filter((call) => call === id).length)) {
      return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
    }
    if (leads[id]) page.current = leads[id]!;
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function inRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, ...options }));
}

const recoveryRows = () => seen.filter((event) => event.detail?.title === "Recovery started" || event.phase === "repairing");

describe("a step that cannot run continues where the page is", () => {
  it("goes on at step 3 when the page is already past step 2, and records step 2 as routed forward", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4"))]);
    const trace = await inRun(flow, { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2", { s1: "p3", s3: "p4" }) });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s1", "s2", "s3"]);
    const passed = trace.attempts[1]!;
    expect(passed).toMatchObject({
      status: "succeeded",
      route: "state_routed",
      skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "s3", direction: "forward" },
      stateRouting: { outcome: "routed", candidates: 2, matched: 1, toNodeId: "s3", direction: "forward", closeness: 1 }
    });
    expect(passed).not.toHaveProperty("failure");
    expect(passed).not.toHaveProperty("fault");
    expect(passed).not.toHaveProperty("recoveryDecision");
    expect(calls).toEqual(["s1", "s2", "s3"]);
    expect(page.observed).toBe(1);
    expect(trace.defence).toBeUndefined();
    expect(recoveryRows()).toEqual([]);
    const said = seen.find((event) => event.detail?.kind === "step" && event.detail.ref === "s2" && event.detail.status === "succeeded");
    expect(said?.detail?.title).toContain("“Step s2”");
    expect(said?.detail?.title).toContain("“Step s3”");
    // Route states and signatures stay off the trace: only counts and closeness are kept.
    expect(JSON.stringify(trace)).not.toMatch(/"page":/u);
  });

  it("goes back to a step that has not acted yet when the page has gone back", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3", "p4"))]);
    const trace = await inRun(flow, { startNodeId: "s2", hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id, call) => id === "s2" && call === 1, { s1: "p2", s2: "p3", s3: "p4" }) });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s2", "s1", "s2", "s3"]);
    expect(trace.attempts[0]).toMatchObject({ route: "state_routed", skipped: { reason: "state_routed", toNodeId: "s1", direction: "backward" }, stateRouting: { outcome: "routed", direction: "backward" } });
  });

  it("does not run an acted step again when its recorded after-state still holds", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    // s1 leaves the page where it was (an add to cart): its effect still holds.
    const flow = line([step("s1", signatures("p1", "p1")), step("s2", signatures("p2", "p3"))]);
    const trace = await inRun(flow, { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2") });

    expect(calls.filter((call) => call === "s1")).toHaveLength(1);
    const s2 = trace.attempts.filter((attempt) => attempt.nodeId === "s2");
    expect(s2.length).toBeGreaterThan(0);
    for (const attempt of s2) expect(attempt.stateRouting).toMatchObject({ outcome: "no_match", candidates: 1, matched: 0 });
    expect(s2[0]!.recoveryDecision).toBeDefined();
  });

  it("does not run an acted step again when it recorded no after-state", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    const flow = line([step("s1", signatures("p1")), step("s2", signatures("p2", "p3"))]);
    const trace = await inRun(flow, { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2") });

    expect(calls.filter((call) => call === "s1")).toHaveLength(1);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s2")?.stateRouting).toMatchObject({ outcome: "no_match", matched: 0 });
  });

  it("stops the run, naming the node and the count, on the fourth return to one node without progress", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    // The page bounces back to s1's starting page whatever s1 does.
    const flow = line([step("s1", signatures("p1", "p2")), step("s2", signatures("p2", "p3")), step("s3", signatures("p3"))]);
    const trace = await inRun(flow, { startNodeId: "s2", hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2") });

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("s2");
    expect(trace.message).toContain("s1");
    expect(trace.message).toContain("4 times");
    expect(trace.message).toContain("limit of 3");
    // Route 1 (nothing acted), route 2 (s1 had acted: progress), then returns 1-3 are allowed and return 4 stops.
    expect(calls.filter((call) => call === "s1")).toHaveLength(5);
    const last = trace.attempts.at(-1)!;
    expect(last).toMatchObject({ nodeId: "s2", status: "failed", stateRouting: { outcome: "guard_stopped", toNodeId: "s1" } });
    expect(recoveryRows()).toEqual([]);
  });

  it("observes nothing and runs the ladder unchanged when no node recorded a pre-state", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    const flow = line([step("s1"), step("s2"), step("s3")]);
    const trace = await inRun(flow, { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s2") });

    expect(page.observed).toBe(0);
    const s2 = trace.attempts.find((attempt) => attempt.nodeId === "s2")!;
    expect(s2).toMatchObject({ status: "failed", stateRouting: { outcome: "no_pre_states", candidates: 0, matched: 0 } });
    expect(s2.recoveryDecision).toBeDefined();
    expect(recoveryRows().length).toBeGreaterThan(0);
  });

  // W22 (run `run-mut4fvkm-e2fc03e6`, t289-E): a forward route took the run
  // from s6 past a sometimes-present s7 and the join m8 its optional shape meets
  // at, straight to s9; s9, the last step, succeeded, and the run was ended
  // `failed` for the two nodes it never attempted -- with no End node, the end
  // asks that every node was visited, and the page had made those two needless.
  describe("a forward route past some steps, to a step that completes the Flow", () => {
    const wShape = (stray = false): AutomationStudioFlowDocument => {
      const nodes = [step("s5", signatures("p1", "p2")), step("s6", signatures("p2", "p3")), step("s7", signatures("p3", "p3")), { id: "m8", definitionId: "builtin.control.merge" }, step("s9", signatures("p4", "p5")), ...(stray ? [step("stray")] : [])];
      const edge = (source: string, port: string, target: string, targetPort = "in") => ({ id: `${source}.${port}`, sourceNodeId: source, sourcePortId: port, targetNodeId: target, targetPortId: targetPort });
      const edges = [edge("s5", "success", "s6"), edge("s6", "success", "s7"), edge("s7", "success", "m8", "branches"), edge("s7", "failed", "m8", "branches"), { id: "m8.next", sourceNodeId: "m8", targetNodeId: "s9", targetPortId: "in" }, ...(stray ? [edge("s5", "failed", "stray")] : [])];
      return { ...line([]), nodes, edges };
    };

    it("ends succeeded: the steps the route passed over count as visited", async () => {
      const page: Page = { current: "p1", observed: 0 };
      const calls: string[] = [];
      // s5's press lands where s9 starts: s6's target is gone, and so is the banner s7 would dismiss.
      const trace = await inRun(wShape(), { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s6", { s5: "p4", s9: "p5" }) });

      expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s5", "s6", "s9"]);
      expect(trace.attempts[1]).toMatchObject({ skipped: { reason: "state_routed", toNodeId: "s9", direction: "forward" } });
      expect(trace.status).toBe("succeeded");
      expect(trace.currentNodeId).toBe("s9");
      expect(trace.message).toBeUndefined();
    });

    it("still ends failed when a node no route passed over was never reached", async () => {
      const page: Page = { current: "p1", observed: 0 };
      const calls: string[] = [];
      // s5's recovery, never needed: it is not between s6 and s9, so no route went past it.
      const trace = await inRun(wShape(true), { hostRuntime: host(page), effectDispatcher: dispatcher(page, calls, (id) => id === "s6", { s5: "p4", s9: "p5" }) });

      expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["s5", "s6", "s9"]);
      expect(trace.status).toBe("failed");
      expect(trace.message).toContain("before the Flow visited every node");
    });
  });

  it("routes without dispatching when a readiness gate judged the step's state and it did not hold", async () => {
    const page: Page = { current: "p1", observed: 0 };
    const calls: string[] = [];
    const gated = step("s2", signatures("p2", "p3"), { readyState: { conditions: [{ kind: "exists", selector: "#s2" }] } });
    const flow = line([step("s1", signatures("p1", "p2")), gated, step("s3", signatures("p3", "p4"))]);
    const trace = await inRun(flow, {
      hostRuntime: host(page, { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: false, checkedConditionCount: 1, message: "Not there." }) }),
      effectDispatcher: dispatcher(page, calls, () => false, { s1: "p3", s3: "p4" })
    });

    expect(trace.status).toBe("succeeded");
    expect(calls).toEqual(["s1", "s3"]);
    expect(trace.attempts[1]).toMatchObject({
      nodeId: "s2",
      status: "succeeded",
      route: "state_routed",
      skipped: { reason: "state_routed", code: "executor.ready_state.not_shown", toNodeId: "s3", direction: "forward" },
      readiness: { satisfied: false }
    });
    expect(recoveryRows()).toEqual([]);
  });

  describe("a step whose own effect is already on the page", () => {
    /** Signatures plus the step's effect: what the page gained, by name. */
    const withEffect = (before: string, after: string, shows: string) => ({ routeSignatures: { before: { page: before }, after: { page: after }, effect: { shows } } });
    /** The fake host's effect test: the page's name contains what the effect shows. */
    const effectHost = (page: Page): Host => host(page, { routeEffectHolds: (effect, observed) => String(observed.page).includes(String(effect.shows)) });

    // Mirrors bigbox-retail `store-remembered`: opening the picker leaves a
    // layer in front of the page, the site has already chosen the store, so
    // "choose store" finds no target, and the layer means no later step's
    // pre-state matches. The step's own effect -- the chosen store's name --
    // is on the page, so the run goes on along its success edge.
    it("goes on past a step the site already did, along its success edge", async () => {
      const page: Page = { current: "home", observed: 0 };
      const calls: string[] = [];
      const flow = line([
        { ...step("n1", signatures("home", "home+layer")), label: "open store picker" },
        { ...step("n2", withEffect("home+layer", "home+layer:Millbrook", "Millbrook")), label: "choose store" },
        { ...step("n3", signatures("home")), label: "type search" }
      ]);
      const trace = await inRun(flow, { hostRuntime: effectHost(page), effectDispatcher: dispatcher(page, calls, (id) => id === "n2", { n1: "home+layer:Millbrook" }) });

      expect(trace.status).toBe("succeeded");
      expect(calls).toEqual(["n1", "n2", "n3"]);
      expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["n1", "n2", "n3"]);
      expect(trace.attempts[1]).toMatchObject({
        status: "succeeded",
        route: "state_routed",
        skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "n3", direction: "forward" },
        stateRouting: { outcome: "effect_holds", toNodeId: "n3", direction: "forward" }
      });
      expect(trace.attempts[1]).not.toHaveProperty("failure");
      expect(page.observed).toBe(1);
      expect(recoveryRows()).toEqual([]);
      const said = seen.find((event) => event.detail?.kind === "step" && event.detail.ref === "n2" && event.detail.status === "succeeded");
      expect(said?.detail?.title).toContain("“choose store”");
      expect(said?.detail?.title).toContain("“type search”");
      expect(JSON.stringify(trace)).not.toMatch(/"(page|shows)":/u);
    });

    // The out-of-stock twin: "add to cart" is absent, its effect is not on the
    // page and no later pre-state matches, so the ladder runs as it always did.
    it("runs the ladder unchanged when the effect does not hold and nothing matches", async () => {
      const page: Page = { current: "product", observed: 0 };
      const calls: string[] = [];
      const flow = line([
        { ...step("n1", signatures("product", "product")), label: "open product" },
        { ...step("n2", withEffect("product", "product+Added to cart", "Added to cart")), label: "add to cart" },
        { ...step("n3", signatures("product+Added to cart")), label: "go to cart" }
      ]);
      const trace = await inRun(flow, { hostRuntime: effectHost(page), effectDispatcher: dispatcher(page, calls, (id) => id === "n2") });

      // The ladder's own course, as it ran before effects existed: the default's three retries (t355), then the continuation rule.
      expect(calls).toEqual(["n1", "n2", "n2", "n2", "n2", "n3"]);
      const n2 = trace.attempts.filter((attempt) => attempt.nodeId === "n2");
      expect(n2).toHaveLength(4);
      for (const attempt of n2) {
        expect(attempt).toMatchObject({ status: "failed", route: "failed", stateRouting: { outcome: "no_match", candidates: 2, matched: 0 } });
        expect(attempt.recoveryDecision).toBeDefined();
      }
      expect(recoveryRows().length).toBeGreaterThan(0);
    });
  });
});
