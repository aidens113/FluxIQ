// The handler Core proposes for a layer the client's defence closed (t516),
// with no model: wait for the layer by its name before the step it was met at,
// press its way out, check it is gone, and resume.

import { describe, expect, it } from "vitest";
import type { AutomationStudioClearedLayer } from "../../../executor/index.ts";
import { automationStudioInterruptionHandlerPatch } from "../interruption-handler.ts";
import { inRunRepairGraph } from "./in-run-repair-fixture.ts";

const OFFER: AutomationStudioClearedLayer = { kind: "dialog", control: "Maybe later", name: "Join the reading club", controlName: "Maybe later, thanks", wayOut: "way-out.0a1b", wayOutDefinitionId: "test.output.press" };

describe("the handler proposed for a closed layer", () => {
  it("waits for the layer by its name before the step, presses its way out by its handle, checks it is gone, and resumes", () => {
    const patch = automationStudioInterruptionHandlerPatch({ graph: inRunRepairGraph(), nodeId: "read", layer: OFFER, handle: "t7" });
    expect(patch).toMatchObject({
      kind: "add_handler",
      event: "before",
      scope: { kind: "nodes", nodeIds: ["read"] },
      when: [{ fact: "dialog", op: "visible", value: "Join the reading club" }],
      completionCheck: [{ fact: "dialog", op: "absent", value: "Join the reading club" }],
      steps: [{ definitionId: "test.output.press", parameters: { target: { handle: "t7" } } }],
      then: { kind: "resume" },
      consequences: []
    });
    expect(patch?.reason).toContain("Join the reading club");
    expect(patch?.reason).toContain("Maybe later, thanks");
  });

  it("proposes nothing for a layer with no name or no pressing definition", () => {
    const { name: _name, ...unnamed } = OFFER;
    const { wayOutDefinitionId: _definition, ...unpressable } = OFFER;
    for (const layer of [unnamed, unpressable]) {
      expect(automationStudioInterruptionHandlerPatch({ graph: inRunRepairGraph(), nodeId: "read", layer, handle: "t7" })).toBeUndefined();
    }
  });

  it("proposes nothing when the step already has a handler waiting for that layer", () => {
    const graph = inRunRepairGraph();
    graph.nodes.push({ id: "h.offer", definitionId: "builtin.control.handler", parameterValues: { event: "before", scope: { kind: "nodes", nodeIds: ["read"] }, when: [{ fact: "dialog", op: "visible", value: "Join the reading club" }] } });
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "read", layer: OFFER, handle: "t7" })).toBeUndefined();
    // Another step's handler, or one for another layer, is no reason to hold back.
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "open", layer: OFFER, handle: "t7" })).toBeDefined();
    expect(automationStudioInterruptionHandlerPatch({ graph, nodeId: "read", layer: { ...OFFER, name: "Turn on notifications" }, handle: "t7" })).toBeDefined();
  });
});
