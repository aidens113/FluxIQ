import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { automationStudioActivityFoldedReason } from "../folded-reason.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const click = { kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Next" } } } };
const request = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
const thoughts = () => seen.filter((event) => event.detail?.kind === "thought" && event.detail.status !== "started").map((event) => event.detail?.text);

describe("automationStudioActivityFoldedReason", () => {
  it("writes one plain sentence", () => {
    expect(automationStudioActivityFoldedReason({ did: "Chose the first matching button", because: "Only one button matched." })).toBe("Core chose the first matching button because only one button matched.");
  });

  it("screens ids and says nothing when a part is empty", () => {
    const said = automationStudioActivityFoldedReason({ did: "Used core.run_node", because: "the step was derived" });
    expect(said ?? "").not.toContain("core.run_node");
    expect(automationStudioActivityFoldedReason({ did: " ", because: "x" })).toBeUndefined();
    expect(automationStudioActivityFoldedReason({ did: "Chose it", because: "" })).toBeUndefined();
  });
});

describe("a Core-written line beside a decision", () => {
  it("is returned as a reason and marked as Core's, and a model reason is not", () => {
    const folded = automationStudioActivityDecisionReason.core({ ...click }, "Core did it.");
    expect(automationStudioActivityDecisionReason.of(folded)).toBe("Core did it.");
    expect(automationStudioActivityDecisionReason.isCoreWritten(folded)).toBe(true);
    const model = automationStudioActivityDecisionReason.attach({ ...click }, "The model's reason.");
    expect(automationStudioActivityDecisionReason.isCoreWritten(model)).toBe(false);
    expect(automationStudioActivityDecisionReason.isCoreWritten(automationStudioActivityDecisionReason.attach(folded, "Own words."))).toBe(false);
  });

  it("shows in the chat with its reason when it is the only reason a decision has", async () => {
    const line = automationStudioActivityFoldedReason({ did: "Chose the Next button", because: "it was the only way forward" });
    const observed = observeAutomationStudioEvidenceLoop({
      tools: [],
      decide: (async () => automationStudioActivityDecisionReason.core({ ...click }, line)) as AutomationStudioLlmEvidenceLoopInput["decide"],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "web.action.succeeded" })
    });
    await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => observed.decide(request));
    expect(thoughts()).toEqual(["Core chose the Next button because it was the only way forward."]);
  });
});
