import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { automationSelectionDisclosureKey } from "../useSelectionDisclosure";

describe("a folder the person collapsed stays collapsed", () => {
  it("treats the selection, not the node array, as the thing that changed", () => {
    // The effect ran on every change of the `nodes` array identity, and that
    // array is rebuilt on each project-data revision. So a folder collapsed
    // around the current selection reopened by itself on the next refresh --
    // seconds later, with nothing the person did to explain it.
    const source = readFileSync(new URL("../useSelectionDisclosure.ts", import.meta.url), "utf8");
    expect(source).toContain("if (revealedRef.current === key) return;");
    expect(source).toContain("if (!containers.length) return;");
    // Still keyed on `nodes`, because the reveal has to happen on the refresh
    // that finally brings the selected object into the tree.
    expect(source).toContain("[activeViewId, nodes, selection, store]");
  });

  it("calls the same selection in the same view the same thing", () => {
    expect(automationSelectionDisclosureKey({ kind: "flow", id: "flow.1" }, "flow-nodes"))
      .toBe(automationSelectionDisclosureKey({ kind: "flow", id: "flow.1" }, "flow-nodes"));
  });

  it("calls a different object, or the same object in another view, something else", () => {
    const base = automationSelectionDisclosureKey({ kind: "flow", id: "flow.1" }, "flow-nodes");
    expect(automationSelectionDisclosureKey({ kind: "flow", id: "flow.2" }, "flow-nodes")).not.toBe(base);
    expect(automationSelectionDisclosureKey({ kind: "flow", id: "flow.1" }, "flow-settings")).not.toBe(base);
    expect(automationSelectionDisclosureKey({ kind: "subflow" as never, id: "flow.1" }, "flow-nodes")).not.toBe(base);
    expect(automationSelectionDisclosureKey(null, "flow-nodes")).not.toBe(base);
  });
});
