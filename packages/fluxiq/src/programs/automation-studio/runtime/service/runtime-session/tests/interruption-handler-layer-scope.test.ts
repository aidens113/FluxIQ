// P6 (t796): a learned handler is scoped by the layer, not by the step it was
// first met at. A help panel that covers the Check-out button on one page of an
// archive site covers it on the next page too; one handler per layer answers both.

import { describe, expect, it } from "vitest";
import type { AutomationStudioClearedLayer } from "../../../executor/index.ts";
import { automationStudioInterruptionHandlerPatch } from "../interruption-handler.ts";
import { inRunRepairGraph } from "./in-run-repair-fixture.ts";

const PANEL: AutomationStudioClearedLayer = { kind: "dialog", control: "Close help", name: "Archive help panel", controlName: "Close help panel", wayOut: "way-out.1c2d", wayOutDefinitionId: "test.output.press" };

describe("a handler learned for a closed layer", () => {
  it("is scoped to the part, not to the step the layer was first met at", () => {
    const patch = automationStudioInterruptionHandlerPatch({ graph: inRunRepairGraph(), nodeId: "read", layer: PANEL, handle: "t3" });
    expect(patch?.scope).toEqual({ kind: "subflow", inherit: false });
    expect(patch?.when).toEqual([{ fact: "dialog", op: "visible", value: "Archive help panel" }]);
  });

  it("a handler learned at one step covers the same layer at another step", () => {
    const graph = inRunRepairGraph();
    const learned = automationStudioInterruptionHandlerPatch({ graph, nodeId: "read", layer: PANEL, handle: "t3" });
    if (!learned) throw new Error("Nothing was learned at the first step.");
    graph.nodes.push({ id: "h.help", definitionId: "builtin.control.handler", parameterValues: { event: learned.event, scope: learned.scope, when: learned.when } });
    // The same layer met at the other step is already answered; one handler per layer in the part.
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "open", layer: PANEL, handle: "t3" })).toBeUndefined();
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "read", layer: PANEL, handle: "t3" })).toBeUndefined();
    // A different layer still gets its own.
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "open", layer: { ...PANEL, name: "Cookie notice" }, handle: "t4" })).toBeDefined();
  });
});
