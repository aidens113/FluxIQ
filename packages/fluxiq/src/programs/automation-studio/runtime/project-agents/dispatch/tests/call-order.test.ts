// The one rule assembly binds subflow inputs by, which a brief's scope reads its handed-on inputs by too (t672).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import { automationStudioProjectCallOrder } from "../call-order.ts";

const port = (id: string) => ({ id, name: id, valueType: { kind: "unknown" as const } });
function callee(key: string, inputs: string[], outputs: string[]): AutomationStudioFlowBootstrapSubflow {
  return { key, name: key, role: "utility", nodes: [], edges: [], interface: { inputs: inputs.map(port), outputs: outputs.map(port) } };
}

describe("the call order of a plan's callable subflows", () => {
  it("binds each input to the latest earlier callee handing back that name, and otherwise to the Flow's own value", () => {
    const read = callee("read_shelf", ["shelf"], ["bookPage"]);
    const reread = callee("reread_shelf", [], ["bookPage"]);
    const open = callee("open_book", ["bookPage", "reader"], []);
    const order = automationStudioProjectCallOrder([read, reread, open], new Map());
    expect(order?.map((call) => call.subflow.key)).toEqual(["read_shelf", "reread_shelf", "open_book"]);
    expect(order?.[0]?.inputs).toEqual([{ id: "shelf" }]);
    expect(order?.[2]?.inputs).toEqual([{ id: "bookPage", from: 1 }, { id: "reader" }]);
  });

  it("puts a callee after the callees its predecessors name, plan order between equals, so a later producer hands on nothing to an earlier consumer", () => {
    const open = callee("open_book", ["bookPage"], []);
    const read = callee("read_shelf", [], ["bookPage"]);
    const after = automationStudioProjectCallOrder([open, read], new Map([["open_book", ["read_shelf"]]]));
    expect(after?.map((call) => call.subflow.key)).toEqual(["read_shelf", "open_book"]);
    expect(after?.[1]?.inputs).toEqual([{ id: "bookPage", from: 0 }]);
    // With no predecessor named, plan order stands: the consumer comes first and its input is the Flow's own.
    expect(automationStudioProjectCallOrder([open, read], new Map())?.[0]?.inputs).toEqual([{ id: "bookPage" }]);
    // A predecessor outside the callees is not waited on.
    expect(automationStudioProjectCallOrder([open], new Map([["open_book", ["main"]]]))?.length).toBe(1);
  });

  it("has no order when the predecessors make a circle", () => {
    const one = callee("one", [], []);
    const two = callee("two", [], []);
    expect(automationStudioProjectCallOrder([one, two], new Map([["one", ["two"]], ["two", ["one"]]]))).toBeUndefined();
  });
});
