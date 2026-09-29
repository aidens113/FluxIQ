// run-mulxk0ro-36bf090d: the wrong-answer repair extends the Flow that ran, the
// Flow's nodes become the draft the model is shown, and a web click, type or
// keypress step carries its resolved locator under `selector` -- a key the web
// domain denies. The first decision of the repair was refused while it was
// being built, before any provider call, and the run recorded only
// `flow_bootstrap.unexpected_error`.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioFlowDraftEntry } from "../../../flow-draft/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import { automationStudioFlowDraftSeedFromFlow } from "../../node-tools/index.ts";
import {
  AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE,
  AutomationStudioLlmRequestRefusedError,
  packAutomationStudioLlmContext,
  screenAutomationStudioLlmEvidence,
  type AutomationStudioLlmHarnessInput
} from "../index.ts";

const WEB_DENIED_EVIDENCE_KEYS = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"] as const;
const LOCATOR = "#kf-search > input.q";

function node(id: string, definitionId: string, parameterValues: Record<string, JsonValue>): AutomationStudioFlowNode {
  return { id, definitionId, parameterValues } as unknown as AutomationStudioFlowNode;
}

// The shape of the Flow the repair was asked to extend: a click and a type
// whose element carries its resolved locator, the way a built web step does.
const nodes = [
  node("n1", "web.output.browser-navigate", { url: "http://127.0.0.1:54319", newTab: false }),
  node("n2", "web.output.dom-click", { selector: "button.decline", element: { tagName: "div", role: "button", accessibleName: "Decline optional cookies", selector: "button.decline" }, timeoutMs: 10_000 }),
  node("n3", "web.output.dom-type", { text: "dining table", selector: LOCATOR, element: { tagName: "input", accessibleName: "Search Marketplace", selector: LOCATOR }, timeoutMs: 10_000 })
];
const edges = [
  { sourceNodeId: "n1", targetNodeId: "n2" },
  { sourceNodeId: "n2", targetNodeId: "n3" }
] as unknown as AutomationStudioFlowEdge[];

function draftEntry() {
  const seed = automationStudioFlowDraftSeedFromFlow({ nodes, edges });
  const entry = automationStudioFlowDraftEntry({ steps: seed.steps, maxBytes: 16_000 });
  if (!entry) throw new Error("the seeded Flow produced no draft entry");
  return entry;
}

function decision(evidence: Array<{ callId: string; toolId: string; value: JsonValue }>): AutomationStudioLlmHarnessInput {
  const tools = [{ toolId: "web.recovery.inspect", description: "Look at the page as it is now.", inputSchema: { type: "object" } }];
  const completionSchema = { type: "object" };
  return {
    taskKind: "evidence_tool_decision", projectId: "project.one", flowId: "flow.one", runId: "run.one", instructions: [],
    deniedEvidenceKeys: WEB_DENIED_EVIDENCE_KEYS,
    evidenceLoop: { iteration: evidence.length + 1, tools, evidence, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true), completionSchema, canComplete: true }
  };
}

describe("the draft a repair shows its model", () => {
  it("is what refused the repair: a seeded web step carries a denied key", () => {
    // The precondition of the defect, checked against the real seed and entry
    // rather than assumed: were the draft screened as gathered evidence is, it
    // would be refused whole.
    expect(screenAutomationStudioLlmEvidence(draftEntry().value, WEB_DENIED_EVIDENCE_KEYS).deniedKey).toBe(true);
  });

  it("is packed with the denied keys withheld and says so, so the first repair decision is built", () => {
    const packed = packAutomationStudioLlmContext(decision([draftEntry()]));
    const shown = packed.evidenceLoop?.evidence[0]?.value;
    expect(screenAutomationStudioLlmEvidence(shown, WEB_DENIED_EVIDENCE_KEYS).deniedKey).toBe(false);
    expect(JSON.stringify(shown)).not.toContain(LOCATOR);
    // What the model needs to amend the step is still there.
    expect(JSON.stringify(shown)).toContain("Search Marketplace");
    expect((shown as Record<string, JsonValue>).withheld).toBe(AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE);
  });

  it("leaves the loop's own draft untouched, so a kept step keeps its locator", () => {
    const entry = draftEntry();
    packAutomationStudioLlmContext(decision([entry]));
    expect(JSON.stringify(entry.value)).toContain(LOCATOR);
  });

  it("still refuses gathered page evidence carrying a denied key, and names the guard", () => {
    const refused = decision([draftEntry(), { callId: "call.2", toolId: "web.recovery.inspect", value: { page: { selector: LOCATOR } } }]);
    let caught: unknown;
    try { packAutomationStudioLlmContext(refused); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AutomationStudioLlmRequestRefusedError);
    expect((caught as AutomationStudioLlmRequestRefusedError).code).toBe("llm.request.evidence_denied_key");
  });
});
