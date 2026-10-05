import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { emitAutomationStudioActivityStep } from "../step/index.ts";

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

  // t193 (`run-muqiojz4-04a7a8fc`, `S/0090`): a press refused for naming no
  // handle read "it wasn't on the page", because the reason never reached the card.
  it("carry a refusal's own reason in the raw record, and only a code-shaped one", async () => {
    const refusedWith = (resultReason: string) => observeAutomationStudioEvidenceLoop({
      tools: [],
      decide: async () => ({}),
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", resultReason })
    });
    await inBuild(() => refusedWith("target_not_a_handle").executeTool(call("fix.add", { node: CLICK, parameters: { element: QUOTE } })));
    expect(seen[1]!.detail?.text).toBe(`Result: web.action.rejected.target_unobserved · Reason: target_not_a_handle · Node: ${CLICK}`);
    seen = [];
    await inBuild(() => refusedWith("the page said: card 4111 declined").executeTool(call("fix.add", { node: CLICK, parameters: { element: QUOTE } })));
    expect(seen[1]!.detail?.text).toBe(`Result: web.action.rejected.target_unobserved · Node: ${CLICK}`);
  });

  // Live run `run-muqiojz4-04a7a8fc`: "Set as my store" was gone because the site remembered the store.
  // Live run `run-murzln6g-11debe1d` (C10): six steps the test did not press all read "done".
  it("say a dry run step the site remembered, or whose effect was already there, as already done, and one only checked as not pressed", async () => {
    for (const [code, said] of [["core.replay.remembered", "already done on the site"], ["core.replay.present", "already done on the site"], ["core.replay.verified", "checked, not pressed"], ["core.replay.replayed", "done"]] as const) {
      seen = [];
      await inBuild(() => observed(code).executeTool(call("dryrun.1.5", { replay: "step", node: CLICK, parameters: { element: QUOTE } })));
      expect(seen[1]!.label).toBe(`Trying the Flow from the start: clicking “Get a free quote” — ${said}`);
    }
  });

  // Live run `run-murzln6g-11debe1d` (C10): the drawer's "×" the host marked an
  // interruption failed, the Flow passes over it, and the card said "Didn't
  // work: it didn't work the same way again".
  it("say a dry run step the Flow passes over as skipped, and record why for the card, without passing the mark on", async () => {
    const sent: unknown[] = [];
    const loop = observeAutomationStudioEvidenceLoop({
      tools: [],
      decide: async () => ({}),
      executeTool: async (input) => { sent.push(input); return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "core.replay.failed" }; }
    });
    await inBuild(() => loop.executeTool({ ...call("dryrun.1.15", { replay: "step", node: CLICK, parameters: { element: QUOTE } }), excusable: "interruption" } as never));
    expect(seen[1]!.label).toBe("Trying the Flow from the start: clicking “Get a free quote” — skipped: not there, optional");
    expect(seen[1]!.detail?.text).toBe(`Result: core.replay.failed · Excused: interruption · Node: ${CLICK}`);
    expect(sent[0]).not.toHaveProperty("excusable");
    // A step that held is not excused, whatever the call said it would be.
    seen = [];
    await inBuild(() => observed("core.replay.replayed").executeTool({ ...call("dryrun.1.15", { replay: "step", node: CLICK, parameters: { element: QUOTE } }), excusable: "interruption" } as never));
    expect(seen[1]!.detail?.text).toBe(`Result: core.replay.replayed · Node: ${CLICK}`);
  });

  it("say a dry run step that did not repeat, as verifying", async () => {
    await inBuild(() => observed("core.replay.unreproducible").executeTool(call("dryrun.1.3", { replay: "step", node: CLICK, parameters: { element: QUOTE } })));
    expect(seen.map((event) => event.phase)).toEqual(["verifying", "verifying"]);
    expect(seen[1]!.label).toBe("Trying the Flow from the start: clicking “Get a free quote” — didn't work when tried again");
  });

  it("say a passed completion check without claiming the Flow works", async () => {
    const loop = observeAutomationStudioEvidenceLoop({ tools: [], decide: async () => ({}), executeTool: async () => ({}), checkCompletion: async () => ({ ok: true }) });
    await inBuild(async () => await loop.checkCompletion!({}, { steps: [] }));
    expect(seen.map((event) => event.label)).toEqual(["Checking the proposed Flow", "The proposed Flow’s plan checks out; it still has to run cleanly"]);
    expect(seen[1]!.label).not.toMatch(/passed/u);
    // The label says the test is still to come; the row is a note with no words of its own, so it makes
    // no card (t174-w88 D4, which lane B's C9 "Ready check" card was merged into on 2026-10-03).
    expect(seen[1]!.detail?.kind).toBe("note");
    expect(seen[1]!.detail?.text).toBeUndefined();
  });

  // D4, `run-murwd8le-79e735a8` (00008, 00011, 00014): both test runs opened
  // with a card "Test run · Passed" before any step ran. The completion check
  // reads the plan, runs nothing, and settles before the dry run starts, so it
  // is no check row (a test card) at all: a note, which a chat shows on the
  // live line, or as a plain message when it says why the Flow went back.
  it("say a completion check as a note, never as a check row that settles before the test runs", async () => {
    const passing = observeAutomationStudioEvidenceLoop({ tools: [], decide: async () => ({}), executeTool: async () => ({}), checkCompletion: async () => ({ ok: true }) });
    await inBuild(async () => await passing.checkCompletion!({}, { steps: [] }));
    const refused = observeAutomationStudioEvidenceLoop({ tools: [], decide: async () => ({}), executeTool: async () => ({}), checkCompletion: async () => ({ ok: false, issueCodes: ["bootstrap.instructed_act_missing"], feedback: {} }) });
    await inBuild(async () => await refused.checkCompletion!({}, { steps: [] }));

    expect(seen.map((event) => event.detail?.kind)).toEqual(["note", "note", "note", "note"]);
    expect(seen.map((event) => event.detail?.title)).toEqual(["Completion check", "Completion check", "Completion check", "Completion check"]);
    expect(seen[1]!.detail).not.toHaveProperty("text");
    expect(seen[3]!.detail?.text).toBe("It needs changes before it can be used, and it goes back to be fixed. One thing needs fixing.");
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
