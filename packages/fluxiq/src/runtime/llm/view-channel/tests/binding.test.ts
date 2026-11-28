// `core.full_page` (page-diff D5): offered from the first decision whenever the
// domain can capture a page whole, answering a capture under the declared
// member, a part request without capturing, and a failed capture as
// unavailable -- never an ending.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioActionPermissionDenied, type AutomationStudioActionPermissionCheck } from "../../../action-permission-requests/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../evidence-loop.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_FULL_PAGE_DESCRIPTION, AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, automationStudioLlmPageChannelBinding } from "../index.ts";

const act = { toolId: "web.act", description: "Act.", inputSchema: { type: "object" }, effect: "mutate" as const };
type Call = { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal; permission?: AutomationStudioActionPermissionCheck };
const context = { projectId: "p", flowId: "f" };

function loop() {
  const executeTool = vi.fn(async (_input: Call): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> => ({ ok: true }));
  return { tools: [act], executeTool };
}

describe("the page channel binding", () => {
  it("is the loop itself when nothing is declared, and carries the member and budget for the window when declared", () => {
    const given = loop();
    expect(automationStudioLlmPageChannelBinding(given, undefined, context)).toBe(given);
    const bound = automationStudioLlmPageChannelBinding(given, { member: "pageView", budgetChars: 500 }, context);
    expect(bound.pageChannel).toEqual({ member: "pageView", budgetChars: 500 });
    expect(bound.tools.map((tool) => tool.toolId)).toEqual(["web.act"]);
  });

  it("refuses a member or budget that is not one, when bound", () => {
    expect(() => automationStudioLlmPageChannelBinding(loop(), { member: "page.view" }, context)).toThrow(/member is invalid/u);
    expect(() => automationStudioLlmPageChannelBinding(loop(), { member: "pageView", budgetChars: 0 }, context)).toThrow(/budget is invalid/u);
  });

  it("offers core.full_page after the loop's tools whenever a full capture is declared, as a tool the loop accepts", () => {
    const bound = automationStudioLlmPageChannelBinding(loop(), { member: "pageView", fullPage: async () => undefined }, context);
    expect(bound.tools.map((tool) => tool.toolId)).toEqual(["web.act", AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID]);
    expect(bound.tools[1]!.effect).toBe("observe");
    expect(automationStudioLlmEvidenceValidTools(bound.tools)).toBe(true);
    expect(AUTOMATION_STUDIO_LLM_FULL_PAGE_DESCRIPTION.length).toBeLessThanOrEqual(2_000);
  });

  it("captures the page under the member, passes the call's permission and signal, and never calls the domain's executor", async () => {
    const view = { key: "~/", lines: [{ key: "t1", text: "t1 a" }, { key: "t2", text: "t2 hidden", extra: true }] };
    const fullPage = vi.fn(async (_input: { callId: string }) => view as unknown as JsonObject);
    const given = loop();
    const bound = automationStudioLlmPageChannelBinding(given, { member: "pageView", fullPage }, context);
    const signal = new AbortController().signal;
    const permission: AutomationStudioActionPermissionCheck = async (declaration) => await automationStudioActionPermissionDenied(declaration);
    const answered = await bound.executeTool({ callId: "c9", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: {}, signal, permission });
    expect(answered).toEqual({ kind: "llm_evidence_tool_execution", evidence: { pageView: view }, effectApplied: false, resultCode: "core.full_page.captured" });
    expect(fullPage).toHaveBeenCalledWith({ projectId: "p", flowId: "f", callId: "c9", permission, signal });
    expect(given.executeTool).not.toHaveBeenCalled();
  });

  // t1042: the web domain's hook answers with the result its tools answer with, the view under the member.
  it("reads a capture that holds the view under the member, and shows the view alone", async () => {
    const view = { key: "~/", lines: [{ key: "t1", text: "t1 a" }] };
    const bound = automationStudioLlmPageChannelBinding(loop(), { member: "pageView", fullPage: async () => ({ schemaVersion: "page.v4", location: "https://example.test/", pageView: view }) as unknown as JsonObject }, context);
    const answered = await bound.executeTool({ callId: "c9", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: {} });
    expect(answered).toEqual({ kind: "llm_evidence_tool_execution", evidence: { pageView: view }, effectApplied: false, resultCode: "core.full_page.captured" });
  });

  it("returns a part request without capturing, and a capture the domain could not take as unavailable", async () => {
    const fullPage = vi.fn(async () => ({ not: "a view" }) as JsonObject);
    const bound = automationStudioLlmPageChannelBinding(loop(), { member: "pageView", fullPage }, context);
    expect(await bound.executeTool({ callId: "c1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: { part: 2 } })).toEqual({ kind: "llm_evidence_tool_execution", evidence: { part: 2 }, effectApplied: false, resultCode: "core.full_page.part" });
    expect(fullPage).not.toHaveBeenCalled();
    const unavailable = await bound.executeTool({ callId: "c2", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: {} }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(unavailable.resultCode).toBe("core.full_page.unavailable");
  });

  it("passes every other call to the loop's own executor", async () => {
    const given = loop();
    const bound = automationStudioLlmPageChannelBinding(given, { member: "pageView", fullPage: async () => undefined }, context);
    expect(await bound.executeTool({ callId: "c1", toolId: "web.act", value: {} })).toEqual({ ok: true });
    expect(given.executeTool).toHaveBeenCalledOnce();
  });

  it("answers a capture it could not take as a refusal that says what is true, and the identical retry captures", async () => {
    const view = { key: "~/", lines: [{ key: "t1", text: "t1 a" }] };
    const fullPage = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(view as unknown as JsonObject);
    const bound = automationStudioLlmPageChannelBinding(loop(), { member: "pageView", fullPage }, context);
    const none = await bound.executeTool({ callId: "c1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: {} }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(none.evidence).toMatchObject({ ok: false, code: "core.full_page.unavailable" });
    expect(JSON.stringify(none.evidence)).toContain("No page is held");
    expect(JSON.stringify(none.evidence)).not.toContain("still current");
    const seen = automationStudioLlmPageChannelBinding({ tools: [act], executeTool: vi.fn(async (_input: Call): Promise<JsonValue> => ({ ok: true, pageView: { key: "~/shop", lines: [] } })) }, { member: "pageView", fullPage: async () => undefined }, context);
    await seen.executeTool({ callId: "c0", toolId: "web.act", value: {} });
    const named = await seen.executeTool({ callId: "c1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, value: {} }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(JSON.stringify(named.evidence)).toContain("~/shop");
  });

  it("runs the identical capture again after an unavailable one, rather than answering it from memory", async () => {
    const view = { key: "~/", lines: [{ key: "t1", text: "t1 a" }] };
    const fullPage = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(view as unknown as JsonObject);
    const bound = automationStudioLlmPageChannelBinding(loop(), { member: "pageView", fullPage }, context);
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.2", toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executed: string[] = [];
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: bound.tools, decide, completionSchema: { type: "object" }, pageChannel: bound.pageChannel,
      executeTool: async (input) => {
        executed.push(input.toolId);
        return await bound.executeTool(input);
      },
      budget: { maxTotalTokens: 50_000, maxTokensPerDecision: 5_000 }
    });
    expect(result).toMatchObject({ ok: true });
    expect(fullPage).toHaveBeenCalledTimes(2);
    expect(executed).toEqual([AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID, AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID]);
  });
});
