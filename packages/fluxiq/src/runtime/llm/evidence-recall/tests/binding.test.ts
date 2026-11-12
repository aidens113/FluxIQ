// `core.recall_result` (t194 w48): offered only beside a held view, answered
// from the results the loop already got, never refused and never run again.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceCurrentView } from "../../decision-context/index.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION, AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, automationStudioLlmEvidenceRecallBinding } from "../index.ts";

const inspect = { toolId: "web.inspect", description: "Read the list.", inputSchema: { type: "object" }, effect: "observe" as const };
const readValue: JsonObject = { ok: true, page: "the page", read: { extracted: [{ name: "a" }, { name: "b" }], rejectedRows: { fields: ["name"] }, extraction: { recordCount: 2 } } };
type Call = { callId: string; toolId: string; value: JsonObject };

function loop(observedStateKeys?: readonly string[]) {
  const executeTool = vi.fn(async (_input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> =>
    ({ kind: "llm_evidence_tool_execution", evidence: readValue, effectApplied: false }));
  return { tools: [inspect], ...(observedStateKeys ? { observedStateKeys } : {}), executeTool };
}

describe("the recall tool", () => {
  it("is offered after the loop's own tools where a held view is declared, as a tool the loop accepts", () => {
    const bound = automationStudioLlmEvidenceRecallBinding(loop(["page", "read.extracted"]));
    expect(bound.tools.map((tool) => tool.toolId)).toEqual(["web.inspect", AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID]);
    expect(bound.tools[1]!.effect).toBe("observe");
    expect(automationStudioLlmEvidenceValidTools(bound.tools)).toBe(true);
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION.length).toBeLessThanOrEqual(2_000);
  });

  it("is not offered where only the page is declared, or nothing, or no tool is offered", () => {
    for (const keys of [undefined, [], ["page"]]) {
      const given = loop(keys);
      expect(automationStudioLlmEvidenceRecallBinding(given), JSON.stringify(keys)).toBe(given);
    }
    const none = { ...loop(["read.extracted"]), tools: [] };
    expect(automationStudioLlmEvidenceRecallBinding(none)).toBe(none);
  });

  it("gives back an earlier result's held views whole, from what came back, without calling anything", async () => {
    const given = loop(["page", "read.extracted", "read.rejectedRows"]);
    const bound = automationStudioLlmEvidenceRecallBinding(given);
    await bound.executeTool({ callId: "read.1", toolId: "web.inspect", value: {} });
    expect(given.executeTool).toHaveBeenCalledTimes(1);
    const answer = await bound.executeTool({ callId: "recall.2", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "read.1" } });
    expect(given.executeTool).toHaveBeenCalledTimes(1);
    expect(answer).toEqual({
      kind: "llm_evidence_tool_execution",
      evidence: { recalled: "read.1", restored: { page: "the page", read: { extracted: [{ name: "a" }, { name: "b" }], rejectedRows: { fields: ["name"] } } } },
      effectApplied: false,
      resultCode: "core.recall.restored"
    });
  });

  it("answers an id no result carried as not found, never as a refusal", async () => {
    const bound = automationStudioLlmEvidenceRecallBinding(loop(["read.extracted"]));
    const answer = await bound.executeTool({ callId: "recall.1", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "read.9" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(answer.evidence).toEqual({ recalled: "read.9", found: false });
    expect(answer.resultCode).toBe("core.recall.not_found");
  });

  it("keeps a plain result as it came back", async () => {
    const given = { ...loop(["read.extracted"]), executeTool: vi.fn(async (_input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> => readValue) };
    const bound = automationStudioLlmEvidenceRecallBinding(given);
    await bound.executeTool({ callId: "read.1", toolId: "web.inspect", value: {} });
    const answer = await bound.executeTool({ callId: "recall.2", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "read.1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(answer.evidence).toEqual({ recalled: "read.1", restored: { read: { extracted: [{ name: "a" }, { name: "b" }] } } });
  });

  // run-mwc6ut8u-52e3c1b3 (R6): a press's page was gone from the window once the work moved on, and recall gave back only reads.
  it("gives back the page a press ended on, as that call's page, beside the current one and never in its place", async () => {
    const keys = ["page", "read.extracted"];
    const pages: Record<string, string> = { "press.1": "the page the first press ended on", "press.2": "the page the second press ended on" };
    const given = { ...loop(keys), executeTool: vi.fn(async (input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> =>
      ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: pages[input.callId] ?? "" }, effectApplied: true })) };
    const bound = automationStudioLlmEvidenceRecallBinding(given);
    await bound.executeTool({ callId: "press.1", toolId: "web.inspect", value: {} });
    await bound.executeTool({ callId: "press.2", toolId: "web.inspect", value: {} });
    const answer = await bound.executeTool({ callId: "recall.3", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "press.1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(given.executeTool).toHaveBeenCalledTimes(2);
    expect(answer.evidence).toEqual({ recalled: "press.1", restored: { page: "the page the first press ended on" } });
    const view = automationStudioLlmEvidenceCurrentView([
      { callId: "press.1", toolId: "web.inspect", value: { ok: true, page: pages["press.1"]! } },
      { callId: "press.2", toolId: "web.inspect", value: { ok: true, page: pages["press.2"]! } },
      { callId: "recall.3", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: answer.evidence }
    ], keys);
    const groups = (view.currentView!.value as { groups: Array<{ group: string; callId: string; value: JsonObject }> }).groups;
    expect(groups.find((group) => group.group === "top")).toMatchObject({ callId: "press.2", value: { page: "the page the second press ended on" } });
    expect(groups.find((group) => group.group.endsWith(":restored"))).toMatchObject({ callId: "recall.3", value: { restored: { page: "the page the first press ended on" } } });
  });

  it("gives a top-level view that holds a declared group back whole, once", async () => {
    const value: JsonObject = { read: { extracted: [{ name: "a" }], meta: 1 } };
    const given = { ...loop(["read", "read.extracted"]), executeTool: vi.fn(async (_input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> => value) };
    const bound = automationStudioLlmEvidenceRecallBinding(given);
    await bound.executeTool({ callId: "read.1", toolId: "web.inspect", value: {} });
    const answer = await bound.executeTool({ callId: "recall.2", toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID, value: { callId: "read.1" } }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(answer.evidence).toEqual({ recalled: "read.1", restored: { read: { extracted: [{ name: "a" }], meta: 1 } } });
  });
});
