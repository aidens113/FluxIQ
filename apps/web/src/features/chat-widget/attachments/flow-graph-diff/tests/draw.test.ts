// A proposed Flow change, drawn in plain DOM: the table of what was added,
// removed and changed, the same strict reading as before, and the same refusal.

import { fake, withFakeDocument } from "@fluxiq/ui-components/testing";
import { describe, expect, it } from "vitest";
import { drawFlowGraphDiff } from "../draw";
import { parseFlowGraphDiff } from "../parse";

const ATTACHMENT = { kind: "flow-graph-diff", ref: "adaptation:a.1" };

describe("a proposed Flow change", () => {
  it("is drawn as a table of what was added, removed and changed, and where", async () => {
    await withFakeDocument(() => {
      const card = fake(drawFlowGraphDiff({
        flowId: "flow.checkout",
        added: [{ id: "node.filter", label: "Filter by price", detail: "after node.search" }],
        removed: [{ id: "edge.2" }],
        changed: [{ id: "node.search", detail: "waits for the result list" }]
      }, ATTACHMENT));
      expect(card.getAttribute("aria-label")).toBe("Proposed Flow change");
      expect(card.textContent).toContain("flow.checkout");
      const table = card.descendants().find((element) => element.getAttribute("aria-label") === "Structural changes")!;
      expect(table.getAttribute("role")).toBe("table");
      const rows = table.children;
      expect(rows).toHaveLength(4);
      expect(rows[1]!.children.map((cell) => cell.textContent)).toEqual(["Added", "Filter by price", "after node.search"]);
      expect(rows[2]!.children.map((cell) => cell.textContent)).toEqual(["Removed", "edge.2", "-"]);
      expect(rows[3]!.children.map((cell) => cell.textContent)).toEqual(["Changed", "node.search", "waits for the result list"]);
    });
  });

  it("says so when the change adds, removes and alters nothing", async () => {
    await withFakeDocument(() => {
      expect(fake(drawFlowGraphDiff({ added: [], removed: [], changed: [] }, ATTACHMENT)).textContent).toContain("This change adds, removes and alters nothing.");
    });
  });

  it("refuses a change it cannot read rather than drawing half a Flow", async () => {
    await withFakeDocument(() => {
      const refused = fake(drawFlowGraphDiff({ added: [{ id: "<script>" }] }, ATTACHMENT));
      expect(refused.textContent).toBe("This turn carries a Flow change (adaptation:a.1) that could not be read, so nothing is shown.");
      expect(refused.descendants().filter((element) => element.getAttribute("aria-label") === "Structural changes")).toHaveLength(0);
    });
  });

  it("reads strictly: an id, a label or a detail out of bounds refuses the whole change", () => {
    expect(parseFlowGraphDiff({ added: [{ id: "node.a", label: "bad\u0001text" }] })).toBeNull();
    expect(parseFlowGraphDiff({ added: [{ id: "node.a", detail: "x".repeat(301) }] })).toBeNull();
    expect(parseFlowGraphDiff({ added: Array.from({ length: 51 }, (_, index) => ({ id: `n${index}` })) })).toBeNull();
    expect(parseFlowGraphDiff({ flowId: "<b>", added: [] })).toBeNull();
    expect(parseFlowGraphDiff("nothing")).toBeNull();
    expect(parseFlowGraphDiff({ added: [{ id: "node.a" }] })).toEqual({
      flowId: null,
      added: [{ id: "node.a", label: "node.a", detail: null }],
      removed: [],
      changed: []
    });
  });
});
