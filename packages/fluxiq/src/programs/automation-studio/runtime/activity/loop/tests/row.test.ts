// The row a list loop's pass is on, carried by the step that pass runs (t378,
// lane D, `run-mv0fuual-f9e6f089`): each pass read "Click · Confirm", so a
// refused press and its retry could not be told from the next row's.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityStep } from "../../step/index.ts";
import { automationStudioActivityLoopWords } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const edge = (source: string, port: string, target: string) => ({ sourceNodeId: source, sourcePortId: port, targetNodeId: target });
/** read -> each; each.body -> confirm (each.item -> confirm); confirm.success -> each; each.done -> after. */
const flow = {
  nodes: [
    { id: "read", definitionId: "web.output.dom-extract_list" }, { id: "each", definitionId: "builtin.control.for-each" },
    { id: "confirm", definitionId: "web.output.dom-click" }, { id: "after", definitionId: "web.output.dom-click" }
  ],
  edges: [edge("read", "success", "each"), edge("each", "body", "confirm"), edge("each", "item", "confirm"), edge("confirm", "success", "each"), edge("each", "done", "after")]
};
const pass = (index: number, item: unknown) => ({ nodeId: "each", status: "succeeded", route: "body", outputs: { item, index, count: 8 } });
const JONAS = { url: "https://circleway.test/u/jonas", name: "Jonas Weber", mutual: "Aisha Khan and 4 other mutual friends" };

describe("the row a list loop's pass is on", () => {
  const words = automationStudioActivityLoopWords(flow);

  it("is the row's first field a person reads, never its address", () => {
    expect(words.passOf("confirm", [pass(3, JONAS)])).toEqual({ repeatId: "each", pass: 4, unit: "row", row: "Jonas Weber" });
    expect(words.passOf("confirm", [pass(0, "“Freya Holm”")])?.row).toBe("Freya Holm");
  });

  it("is nothing for a step outside the loop, before its first pass, or for a row with no name", () => {
    expect(words.passOf("after", [pass(3, JONAS)])).toBeUndefined();
    expect(words.passOf("confirm", [])).toBeUndefined();
    expect(words.passOf("confirm", [pass(0, { url: "https://circleway.test/u/x", count: 4 })])).toBeUndefined();
  });

  it("is carried on the step's event, and the step's sentence is unchanged", async () => {
    await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, async () => {
      emitAutomationStudioActivityStep({ index: 8, count: 9, nodeId: "confirm", definitionId: "web.output.dom-click", pass: words.passOf("confirm", [pass(3, JONAS)]) });
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.step).toEqual({ index: 8, count: 9, nodeId: "confirm", row: "Jonas Weber" });
    // No pass number of its own: the row is the card's to say.
    expect(seen[0]!.label).toBe("Running step 8 of 9: Clicking on the page");
  });
});
