import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { emitAutomationStudioActivityStep } from "../step.ts";

/** A dotted id such as `core.run_node`: never in a sentence a person reads. */
const RAW_ID = /\b[a-z]+\.[a-z_]+/iu;

const CLICK = "web.output.dom-click";
const NAVIGATE = "web.output.browser-navigate";
const SNAPSHOT = "web.output.dom-capture_snapshot";
const QUOTE = { tagName: "button", role: "button", accessibleName: "  Get a   free quote " };

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inBuild = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const inRun = <T>(fn: () => T) => runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, fn);
const call = (callId: string, value: Record<string, unknown>, toolId = "core.run_node") => ({ callId, toolId, value: value as never, maxEvidenceBytes: 1_000 });

function observed(resultCode: string): AutomationStudioLlmEvidenceLoopInput {
  return observeAutomationStudioEvidenceLoop({
    tools: [],
    decide: async () => ({}),
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { observed: "Sale price 12.99" }, effectApplied: true, resultCode })
  });
}

describe("observed tool calls", () => {
  it("say the action in the label and title, keep ids in ref and text, and never the evidence", async () => {
    await inBuild(() => observed("web.action.succeeded").executeTool(call("click.quote", { node: CLICK, parameters: { element: QUOTE }, consequences: [] })));
    expect(seen.map((event) => event.label)).toEqual(["Clicking “Get a free quote”", "Clicking “Get a free quote” — done"]);
    expect(seen[1]!.detail).toEqual({ kind: "tool", title: "Clicking “Get a free quote”", status: "succeeded", ref: "core.run_node", text: `Result: web.action.succeeded · Node: ${CLICK}` });
    for (const event of seen) expect(`${event.label} ${event.detail?.title}`).not.toMatch(RAW_ID);
    expect(JSON.stringify(seen)).not.toContain("12.99");
  });

  it("say a refused action didn't work", async () => {
    await inBuild(() => observed("web.action.rejected.target_unobserved").executeTool(call("click.x", { node: CLICK, parameters: {} })));
    expect(seen[1]!.label).toBe("Clicking on the page — didn't work");
  });

  it("say a dry run step that did not repeat, as verifying", async () => {
    await inBuild(() => observed("core.replay.unreproducible").executeTool(call("dryrun.1.3", { replay: "step", node: CLICK, parameters: { element: QUOTE } })));
    expect(seen.map((event) => event.phase)).toEqual(["verifying", "verifying"]);
    expect(seen[1]!.label).toBe("Trying the Flow from the start: clicking “Get a free quote” — didn't work the same way again");
  });

  it("say a passed completion check without claiming the Flow works", async () => {
    const loop = observeAutomationStudioEvidenceLoop({ tools: [], decide: async () => ({}), executeTool: async () => ({}), checkCompletion: async () => ({ ok: true }) });
    await inBuild(async () => await loop.checkCompletion!({}, { steps: [] }));
    expect(seen.map((event) => event.label)).toEqual(["Checking the proposed Flow", "The proposed Flow’s plan checks out; it still has to run cleanly"]);
    expect(seen[1]!.label).not.toMatch(/passed/u);
  });
});

describe("run steps", () => {
  it("say the action, never a node id, and step N of M plainly without one", () => {
    inRun(() => {
      emitAutomationStudioActivityStep({ index: 1, count: 7, nodeId: "node.bootstrap.a.click", label: "node.bootstrap.a.click", definitionId: CLICK, parameters: { element: QUOTE } });
      emitAutomationStudioActivityStep({ index: 2, count: 7, nodeId: "node.bootstrap.a.go", definitionId: NAVIGATE });
      emitAutomationStudioActivityStep({ index: 3, count: 7, nodeId: "node.bootstrap.a.z", definitionId: "vendor.frobnicate" });
    });
    expect(seen.map((event) => event.label)).toEqual(["Running step 1 of 7: Clicking “Get a free quote”", "Running step 2 of 7: Opening a page", "Running step 3 of 7"]);
    expect(seen.map((event) => event.detail?.title)).toEqual(["Clicking “Get a free quote”", "Opening a page", "Step 3 of 7"]);
    expect(seen[0]!.step).toEqual({ index: 1, count: 7, nodeId: "node.bootstrap.a.click" });
    expect(seen[0]!.detail?.ref).toBe("node.bootstrap.a.click");
  });
});
