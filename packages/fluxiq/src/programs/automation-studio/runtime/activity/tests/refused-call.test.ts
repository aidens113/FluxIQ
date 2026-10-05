import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { activityActionOf } from "../../../../../ui/index.ts";
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
const decideRequest = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };

function loopInput(overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [],
    decide: async () => ({ kind: "secret model output" }),
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { observed: "target content" }, effectApplied: false, resultCode: "tool.ok" }),
    ...overrides
  };
}

// Live run `run-musp4h2f-72e8ed99` (t193 1003, C13): a call refused as a repeat before it ran left its
// decision's heading with no card. Core's answer is now its card: the call's own kind and control, "Not done".
describe("a call refused as a repeat", () => {
  const press = automationStudioActivityDecisionReason.attach(
    { kind: "tool_call", callId: "c9", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Add to cart" } } } },
    "Pressing Add to cart for the 250 Count pack."
  );
  const repeatCheck = (iteration: number, outcome = "changed_nothing") => ({ callId: `core.repeat_check.${iteration}`, toolId: "core.repeat_check", value: { ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome } } as never });
  const toolRows = () => seen.filter((event) => event.detail?.kind === "tool");

  it("is a card under its decision, saying it was not done and why", async () => {
    let next: unknown = press;
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next as never }));
    await inScope(async () => {
      await observed.decide({ ...decideRequest, iteration: 7 });
      next = { kind: "complete", result: {} };
      await observed.decide({ ...decideRequest, iteration: 8, evidence: [repeatCheck(7)] });
    });
    expect(toolRows()).toHaveLength(1);
    expect(toolRows()[0]).toMatchObject({ phase: "exploring", label: "Clicking “Add to cart” — not done", detail: { title: "Clicking “Add to cart”", status: "failed", ref: "core.run_node" } });
    expect(toolRows()[0]!.detail?.text).toBe("Result: llm_evidence_loop.repeat_refused · Reason: changed_nothing · Node: web.output.dom-click");
    expect(activityActionOf(toolRows()[0]!)).toMatchObject({ kind: "click", target: "Add to cart", outcome: "failed", refused: { all: true, because: "it was already tried exactly this way and changed nothing" } });
    const order = seen.map((event) => event.detail?.kind === "tool" ? "card" : event.detail?.status === "started" ? "deciding" : "decision");
    expect(order).toEqual(["deciding", "decision", "card", "deciding"]);
  });

  it("says nothing more of a call that ran, or of another decision's refusal", async () => {
    let next: unknown = press;
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next as never }));
    await inScope(async () => {
      await observed.decide({ ...decideRequest, iteration: 7 });
      next = { kind: "complete", result: {} };
      await observed.decide({ ...decideRequest, iteration: 8, evidence: [repeatCheck(6)] });
      await observed.decide({ ...decideRequest, iteration: 9, evidence: [repeatCheck(7)] });
    });
    expect(toolRows()).toEqual([]);

    seen = [];
    next = press;
    const ran = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next as never }));
    await inScope(async () => {
      await ran.decide({ ...decideRequest, iteration: 7 });
      await ran.executeTool({ callId: "c9", toolId: "core.run_node", value: (press as { input: Record<string, unknown> }).input as never });
      next = { kind: "complete", result: {} };
      await ran.decide({ ...decideRequest, iteration: 8, evidence: [repeatCheck(7)] });
    });
    expect(toolRows().map((event) => event.detail?.status)).toEqual(["started", "succeeded"]);
  });

  it("is said from the stalled round's record when the refusal ends the round", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => press as never, unusableDecisions: { stalled: () => new Error("stalled") } }));
    await inScope(async () => {
      await observed.decide({ ...decideRequest, iteration: 12 });
      observed.unusableDecisions!.stalled({
        issueCodes: ["llm_evidence_loop.repeat_refused"],
        trace: [{ iteration: 12, decision: "tool_call", toolId: "core.run_node", resultCode: "llm_evidence_loop.repeat_refused", resultReason: "failed" }] as never,
        accounting: {} as never,
        steps: []
      });
    });
    expect(activityActionOf(toolRows()[0]!)).toMatchObject({ kind: "click", outcome: "failed", refused: { all: true, because: "it was already tried exactly this way and did not work" } });
  });
});
