// A step that could not run and whose own recorded effect is already on the
// page is passed over as satisfied by state before anything retries it
// (`../state-route.ts`, t486): no On Retry handler runs, nothing is dispatched
// again, and the page is read once. A step whose effect is not on the page
// keeps every retry it had, its handlers first, as before.
//
// Mirrors bigbox-retail `store-remembered` (run-mv62icw0, defect 3): the store
// picker is a layer over the page, the site already remembers the store, so
// "choose store" finds no target. The Flow's retry handler would close the
// layer and press "choose store" again -- a second choice of a store that was
// already chosen.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import { factHost, framedRun } from "../../lifecycle-run/tests/recovery-paths-fixtures.ts";
import { closer, fact, line, page, pageOptions, press, type Page } from "../../lifecycle-run/tests/wiring-fixtures.ts";

/** "choose store", with the effect its recording left: what the page gained, by name. */
const chooseStore = () => press("choose", "choose", { routeSignatures: { effect: { shows: "Millbrook" } } });

/** A retry handler on "choose store" that closes the layer while it is up, then lets the step go again. */
const closeAndRetry = () => closer("h.retry", { event: "retry", scope: { kind: "nodes", nodeIds: ["choose"] }, when: [fact("popup")] }, { disposition: "resume" });

/** The page's facts, plus a route state naming the store the site shows; the effect holds when that store is the one it recorded. */
function storeHost(current: Page, store: string, observed: { count: number }): AutomationStudioHostRuntimeBoundary {
  return {
    ...factHost(current),
    observeRouteState: () => {
      observed.count += 1;
      return { store };
    },
    routeEffectHolds: (effect: JsonObject, state: JsonObject) => state.store === effect.shows
  };
}

describe("a step whose own effect is already on the page", () => {
  it("is passed over as satisfied by state on its first failure, before any retry handler runs or the step is pressed again", async () => {
    const current = page({ popup: true });
    const observed = { count: 0 };
    const flow = line("graph.main", [chooseStore()], [closeAndRetry()]);
    const { trace } = await framedRun(flow, pageOptions(current, { hostRuntime: storeHost(current, "Millbrook", observed) }));

    expect(trace.status).toBe("succeeded");
    // One press, which found no target; the handler's close and a second choice never happened.
    expect(current.presses).toEqual(["choose"]);
    const choose = trace.attempts.filter((attempt) => attempt.nodeId === "choose");
    expect(choose).toHaveLength(1);
    expect(choose[0]).toMatchObject({
      status: "succeeded",
      route: "state_routed",
      skipped: { reason: "state_routed", code: "web.target.not_found", toNodeId: "done", direction: "forward" },
      stateRouting: { outcome: "effect_holds", toNodeId: "done" }
    });
    expect(choose[0]).not.toHaveProperty("lifecycle");
    expect(choose[0]).not.toHaveProperty("retry");
    expect(trace.attempts.some((attempt) => attempt.nodeId.startsWith("h.retry"))).toBe(false);
    expect(observed.count).toBe(1);
  });

  it("keeps its retry handler first when its effect is not on the page, and reads the page once for it", async () => {
    const current = page({ popup: true });
    const observed = { count: 0 };
    const flow = line("graph.main", [chooseStore()], [closeAndRetry()]);
    const { trace } = await framedRun(flow, pageOptions(current, { hostRuntime: storeHost(current, "Carden Falls", observed) }));

    expect(trace.status).toBe("succeeded");
    // The handler closed the layer and the step was retried and landed, exactly as before.
    expect(current.presses).toEqual(["choose", "dismiss", "choose"]);
    const choose = trace.attempts.filter((attempt) => attempt.nodeId === "choose");
    expect(choose.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(choose[0]).toMatchObject({ stateRouting: { outcome: "no_match" } });
    expect(choose[1]).toHaveProperty("retry");
    expect(observed.count).toBe(1);
  });

  it("keeps every retry when nothing shows its effect and no handler takes the run on, reading the page once per failure", async () => {
    const current = page({ popup: true, dismissWorks: false });
    const observed = { count: 0 };
    const flow = line("graph.main", [chooseStore()]);
    const { trace } = await framedRun(flow, pageOptions(current, { hostRuntime: storeHost(current, "Carden Falls", observed) }));

    // The default policy's first attempt plus three retries (user, 2026-10-07).
    const choose = trace.attempts.filter((attempt) => attempt.nodeId === "choose");
    expect(choose).toHaveLength(4);
    for (const attempt of choose) expect(attempt).toMatchObject({ status: "failed", stateRouting: { outcome: "no_match" } });
    expect(observed.count).toBe(4);
  });
});
