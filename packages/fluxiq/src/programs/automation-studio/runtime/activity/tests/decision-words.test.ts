// What the chat says of a decision and of an edit to the draft (t174-w116).
//
// Run `run-musq0b1m-0472cfa0` (deepseek-v4-pro, t174-w111): "Clicking “×” —
// tool_call core.run_node" (D15); "Checking the Flow is finished — …all
// requested acts are done and steps are in the draft." (D3); three "Updating
// the draft Flow — Repair the unreproducible steps…" headings, two identical,
// none saying what came of it (D18); and "— didn't work the same way again" as
// a test step's status (D21).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDraftEditWords } from "../decision-answer/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const request = (iteration: number, evidence: Array<{ callId: string; toolId: string; value: never }> = []) => ({ iteration, tools: [], evidence, decisionSchema: {}, canComplete: true });
const thoughts = () => seen.filter((event) => event.detail?.kind === "thought" && event.detail.status !== "started").map((event) => [event.detail?.title, event.detail?.text, event.detail?.status]);
const loop = (decide: AutomationStudioLlmEvidenceLoopInput["decide"], executeTool?: AutomationStudioLlmEvidenceLoopInput["executeTool"]) => observeAutomationStudioEvidenceLoop({
  tools: [], decide, executeTool: executeTool ?? (async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "web.action.succeeded" }))
});
const click = { kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "×" } } } };

describe("a decision's heading", () => {
  it("ends at the action when the model gave no reason and Core wrote its own code line (D15)", async () => {
    const observed = loop(async () => automationStudioActivityDecisionReason.attach({ ...click }, "tool_call core.run_node") as never);
    await inScope(() => observed.decide(request(1)));
    expect(thoughts()).toEqual([]);
    expect(JSON.stringify(seen)).not.toContain("tool_call");
  });

  it("leaves the draft's mechanics and act ids out of the reason it shows (D3)", async () => {
    const complete = automationStudioActivityDecisionReason.attach({ kind: "complete", result: {} }, "All acts are done and added to the Flow; completing with a one-sentence description.");
    const pressing = automationStudioActivityDecisionReason.attach({ ...click }, "Close the coupon popup so the page can be used. That completes act a1.");
    let next: unknown = complete;
    const observed = loop(async () => next as never);
    await inScope(async () => {
      await observed.decide(request(1));
      next = pressing;
      await observed.decide(request(2));
    });
    expect(thoughts()).toEqual([["Clicking “×”", "Close the coupon popup so the page can be used.", "succeeded"]]);
    expect(JSON.stringify(seen)).not.toMatch(/\bacts?\b|a1/u);
  });
});

// t264: lane B's F6 (t193 C13/C14) already answers every edit with a card of
// Core's own -- "Editing the Flow — done / partly done / not done" -- under the
// decision, so D18's "Changed the Flow" line is not ported. What D18 still asks
// of the decision's own heading is ported: "Changing the Flow", never "draft
// Flow", and an edit whose reason is screened out is still said, by its card.
describe("an edit to the draft (D18)", () => {
  const amend = (reason: string) => automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments: [{ step: 3, change: "move", to: 5 }] }, reason);
  const REORDER = "Move the quantity step after the colour, so the cart gets three.";
  const cards = () => seen.filter((event) => event.detail?.kind === "tool" && event.detail.ref === AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID).map((event) => [event.label, event.detail?.status]);

  it("says an edit that landed as changing the Flow, with its reason, and a card saying it was done", async () => {
    let next: unknown = amend(REORDER);
    const observed = loop(async () => next as never);
    await inScope(async () => {
      await observed.decide(request(1));
      next = { kind: "complete", result: {} };
      await observed.decide(request(2));
    });
    expect(thoughts()).toEqual([["Changing the Flow", REORDER, "succeeded"]]);
    expect(cards()).toEqual([["Editing the Flow — done", "succeeded"]]);
    expect(JSON.stringify(seen)).not.toContain("draft Flow");
  });

  it("says an edit that landed with no reason it may show by its card, never as nothing", async () => {
    let next: unknown = amend("Repair the unreproducible steps by reordering them, then retest.");
    const observed = loop(async () => next as never);
    await inScope(async () => {
      await observed.decide(request(1));
      next = { kind: "complete", result: {} };
      await observed.decide(request(2));
    });
    expect(thoughts()).toEqual([]);
    expect(cards()).toEqual([["Editing the Flow — done", "succeeded"]]);
    expect(JSON.stringify(seen)).not.toMatch(/unreproducible|retest/u);
  });

  it("answers each edit, an identical one included, with its own card, so no line is said twice with no result", async () => {
    let next: unknown = amend(REORDER);
    const observed = loop(async () => next as never);
    await inScope(async () => {
      await observed.decide(request(1));
      await observed.decide(request(2));
      next = { kind: "complete", result: {} };
      await observed.decide(request(3));
    });
    expect(seen.filter((event) => event.detail?.status !== "started").map((event) => event.label)).toEqual([
      "Changing the Flow", "Editing the Flow — done", "Changing the Flow", "Editing the Flow — done"
    ]);
  });
});

describe("a test step that did not hold (D21)", () => {
  it("says it once, plainly, in the status row", async () => {
    const observed = loop(async () => ({}) as never, async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "core.replay.unreproducible" }));
    await inScope(() => observed.executeTool({ callId: "dryrun.1.3", toolId: "core.run_node", value: { replay: "step", node: "web.output.dom-click", parameters: { element: { accessibleName: "7-in-1" } } } }));
    expect(seen[1]!.label).toBe("Trying the Flow from the start: clicking “7-in-1” — didn't work when tried again");
  });
});

// read-list S3: a do-while amendment (`while`, never `over`) repeats its span
// while the span's last step works; "repeat over" the step before it named a
// list the loop never walks.
describe("an edit that makes a span repeat while its last step works", () => {
  const shown = [{ callId: "core.flow_draft", toolId: "core.flow_draft", value: { steps: [
    { step: 1, actionId: "web.output.dom-type", does: { target: "Search" } },
    { step: 2, actionId: "web.output.dom-extract_list" },
    { step: 3, actionId: "web.output.dom-click", does: { target: "Next" } }
  ] } }];

  it("says the span repeats through its last step while that step works, and over no step", () => {
    expect(automationStudioActivityDraftEditWords({ amendments: [{ step: 2, change: "repeat", through: 3, while: 3 }], shown }).words)
      .toBe('made "reading the list" through "Next" repeat while "Next" works');
    expect(automationStudioActivityDraftEditWords({ amendments: [{ step: 2, change: "repeat", while: 3, most: 20 }], shown }).words)
      .toBe('made "reading the list" through "Next" repeat while "Next" works, at most 20 times');
    expect(automationStudioActivityDraftEditWords({ amendments: [{ step: 3, change: "repeat", while: 3 }], shown }).words)
      .toBe('made "Next" repeat while it works');
  });

  it("still says a repeat over a list as before", () => {
    expect(automationStudioActivityDraftEditWords({ amendments: [{ step: 3, change: "repeat", over: 2 }], shown }).words)
      .toBe('made "Next" repeat over "reading the list"');
  });
});
