// Where a new frame begins (state-aware recovery plan, C2; unit D2): an
// alternative entry whose facts hold and whose `requires` are bound, the
// default otherwise, with every entry asked in one observation, and nothing
// asked of a graph that declares no entry.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { factHost, framedRun, recoveryRows, withRows } from "./recovery-paths-fixtures.ts";
import { closer, fact, line, page, pageOptions, press, type Page } from "./wiring-fixtures.ts";

/** start -> search -> cart -> pay -> done; `cart` and `pay` are alternative entries. */
function shop() {
  const cart: AutomationStudioFlowNode = { ...press("cart"), label: "Open the cart", metadata: { "fluxiq.entry": { id: "at-cart", order: 1, when: [fact("on-cart")], requires: ["query"] } } };
  const pay: AutomationStudioFlowNode = { ...press("pay"), metadata: { "fluxiq.entry": { id: "at-pay", order: 2, when: [fact("on-pay")], requires: [] } } };
  return line("graph.main", [press("search"), cart, pay]);
}

function on(...facts: string[]) {
  return (current: Page) => factHost(current, (name) => (facts.includes(name) ? "true" : "false"));
}

describe("entry selection at a new frame", () => {
  it("starts at the first alternative entry whose facts hold and whose requires are bound, asking every entry in one observation", async () => {
    const current = page();
    const { result, rows } = await withRows(() => framedRun(shop(), pageOptions(current, { inputs: { query: "socks" }, hostRuntime: on("on-cart", "on-pay")(current) })));
    const { trace, invocation } = result;

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["cart", "pay"]);
    expect(current.factBatches).toHaveLength(1);
    expect(current.factBatches[0]?.map((condition) => condition.fact)).toEqual(["on-cart", "on-pay"]);
    expect(trace.attempts[0]).toMatchObject({ nodeId: "cart", entry: { kind: "entry", id: "at-cart", evidence: [{ truth: "true", capturedAt: 1_000 }] } });
    expect(trace.attempts.filter((attempt) => attempt.entry)).toHaveLength(1);
    expect(invocation.frame.entry).toEqual({ kind: "entry", id: "at-cart" });
    expect(recoveryRows(rows)).toEqual([["entry", "succeeded", "at-cart"]]);
  });

  it("passes over an entry whose requires are not bound, and takes the default when no entry holds", async () => {
    // `at-cart` holds but needs `query`, which the frame was not given; `at-pay` does not hold.
    const current = page();
    const { result, rows } = await withRows(() => runAutomationStudioGraph(shop(), pageOptions(current, { hostRuntime: on("on-cart")(current) })));

    expect(result.status).toBe("succeeded");
    expect(current.landed).toEqual(["search", "cart", "pay"]);
    expect(result.attempts[0]).toMatchObject({ nodeId: "start", entry: { kind: "default", evidence: [] } });
    expect(recoveryRows(rows)).toEqual([]);

    // A null input is not a bound one either.
    const nulled = page();
    await runAutomationStudioGraph(shop(), pageOptions(nulled, { inputs: { query: null }, hostRuntime: on("on-cart")(nulled) }));
    expect(nulled.landed).toEqual(["search", "cart", "pay"]);
  });

  it("takes a later entry when an earlier one does not hold, and the chosen node still passes On Before", async () => {
    const current = page({ popup: true });
    const flow = shop();
    const handler = closer("h.popup", { event: "before", scope: { kind: "subflow" }, when: [fact("popup")], completionCheck: [fact("cleared")] });
    flow.nodes.push(...handler.nodes);
    flow.edges.push(...handler.edges);
    const trace = await runAutomationStudioGraph(flow, pageOptions(current, { hostRuntime: on("on-pay")(current) }));

    expect(trace.status).toBe("succeeded");
    expect(current.landed).toEqual(["dismiss", "pay"]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "pay")).toMatchObject({ entry: { kind: "entry", id: "at-pay" }, lifecycle: { event: "before", handlerId: "graph.main/h.popup" } });
  });

  it("asks nothing of a graph that declares no entry, and never chooses an entry for a run told where to start", async () => {
    const plain = page();
    const trace = await runAutomationStudioGraph(line("graph.main", [press("search"), press("cart")]), pageOptions(plain, { hostRuntime: on("on-cart")(plain) }));
    expect(trace.status).toBe("succeeded");
    expect(plain.factBatches).toEqual([]);
    expect(JSON.stringify(trace)).not.toMatch(/"entry"/u);

    const told = page();
    const partial = await runAutomationStudioGraph(shop(), pageOptions(told, { startNodeId: "search", inputs: { query: "socks" }, hostRuntime: on("on-cart", "on-pay")(told) }));
    expect(partial.status).toBe("succeeded");
    expect(told.factBatches).toEqual([]);
    expect(told.landed).toEqual(["search", "cart", "pay"]);
  });
});
