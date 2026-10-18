// Through the harness's parse and run: a key of a tool's input written beside
// a tool call's `input` is moved into it before the call is checked
// (`../../tool-call-keys/folded.ts`), and every other key there is refused with a
// closed field correction (run-mvcwp3wh-bcea2115: every plan put the plan
// tool's `reason` beside `input` and was refused with no path).

import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmProviderResult, runAutomationStudioLlmHarness, type AutomationStudioLlmDiagnostic } from "../index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop.ts";
import { automationStudioLlmUnusableDecisionError } from "../../unusable-decision.ts";

const planTool = {
  toolId: "catalog.write_note", description: "Write one note.", effect: "observe" as const,
  inputSchema: { type: "object", properties: { title: { type: "string" }, reason: { type: "string" } }, required: ["title", "reason"], additionalProperties: false }
};
const nodeTool = {
  toolId: "catalog.run", description: "Run one thing.", effect: "mutate" as const,
  inputSchema: { type: "object", properties: { thing: { type: "string" }, write: { type: "boolean" } } }
};
const variantTool = {
  toolId: "catalog.pick", description: "Pick one.", effect: "observe" as const,
  inputSchema: { oneOf: [{ type: "object", properties: { shelf: { type: "string" } } }, { type: "object", properties: { aisle: { type: "string" } } }] }
};
const tools = [planTool, nodeTool, variantTool];

const call = (extra: Record<string, unknown>, input: Record<string, unknown> = { title: "Inventory" }, toolId = planTool.toolId) =>
  ({ kind: "tool_call", callId: "call.1", toolId, input, ...extra });

const parsed = (decision: Record<string, unknown>, offered: typeof tools | undefined = tools) => parseAutomationStudioLlmProviderResult(
  { response: { kind: "evidence_tool_decision", summary: "Write the note.", decision } }, "evidence_tool_decision", undefined, offered
);

/** A decision as the provider sent it, through the real harness, which passes the offered tools to the parse. */
const harnessed = (decision: Record<string, unknown>) => runAutomationStudioLlmHarness({
  taskKind: "evidence_tool_decision", projectId: "project.fold", flowId: "flow.fold", instructions: [], deniedEvidenceKeys: [],
  evidenceLoop: { tools, evidence: [], iteration: 1, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }), completionSchema: { type: "object" }, canComplete: true },
  tokenLimits: { maxInputTokens: 100_000, maxOutputTokens: 2_000, maxTotalTokens: 102_000 },
  provider: { metadata: { provider: "fixture", model: "fixture" }, runTask: async () => ({ response: { kind: "evidence_tool_decision", summary: "Write the note.", decision } }) }
});

const errorCodes = (diagnostics: readonly AutomationStudioLlmDiagnostic[]) => diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.code);

describe("a tool's input key written beside the tool call's input", () => {
  it("is moved into input when the tool's schema declares it and input lacks it, with an info diagnostic", () => {
    const result = parsed(call({ reason: "One note covers it." }));
    expect(errorCodes(result.diagnostics)).toEqual([]);
    expect(result.response).toMatchObject({ decision: { kind: "tool_call", toolId: planTool.toolId, input: { title: "Inventory", reason: "One note covers it." } } });
    expect((result.response as { decision: Record<string, unknown> }).decision).not.toHaveProperty("reason");
    const moved = result.diagnostics.find((diagnostic) => diagnostic.code === "llm_output.key_moved_into_input");
    expect(moved).toEqual(expect.objectContaining({ severity: "info", path: "response.decision", metadata: { toolId: planTool.toolId, movedKeys: ["reason"] } }));
    expect(JSON.stringify(moved)).not.toContain("One note covers it.");
  });

  it("keeps add, act and place beside input and moves only the input key", () => {
    const result = parsed(call({ add: true, act: "a1", reason: "Because." }));
    expect(errorCodes(result.diagnostics)).toEqual([]);
    expect(result.response).toMatchObject({ decision: { add: true, act: "a1", input: { reason: "Because." } } });
  });

  it("reads a property a top-level variant of the schema declares", () => {
    const result = parsed(call({ aisle: "a3" }, {}, variantTool.toolId));
    expect(errorCodes(result.diagnostics)).toEqual([]);
    expect(result.response).toMatchObject({ decision: { input: { aisle: "a3" } } });
  });

  it("is refused, never overwriting, when input already holds the key", () => {
    const result = parsed(call({ reason: "Second." }, { title: "Inventory", reason: "First." }));
    expect(result.response).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "llm_output.unexpected_field", path: "response.decision", metadata: { expectedPath: "response.decision.input" } }));
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.key_moved_into_input");
  });

  it("is refused with the closed input correction when the schema does not declare it, naming no provider key", () => {
    const result = parsed(call({ PRIVATE_FIELD_NAME: "PRIVATE_FIELD_VALUE" }));
    expect(result.response).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "llm_output.unexpected_field", path: "response.decision", metadata: { expectedPath: "response.decision.input" } }));
    expect(JSON.stringify(result.diagnostics)).not.toMatch(/PRIVATE_FIELD_NAME|PRIVATE_FIELD_VALUE/);
  });

  it("never moves write, which keeps its explicit correction even when the schema declares it", () => {
    const result = parsed(call({ write: true }, { thing: "x" }, nodeTool.toolId));
    expect(result.response).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "llm_output.unexpected_field", path: "response.decision.write" }));
    expect(result.diagnostics.find((diagnostic) => diagnostic.path === "response.decision.write")).not.toHaveProperty("metadata");
  });

  it("moves nothing for a tool that was not offered, or when no tools are known", () => {
    const withoutTools = parseAutomationStudioLlmProviderResult({ response: { kind: "evidence_tool_decision", summary: "Write the note.", decision: call({ reason: "x" }) } }, "evidence_tool_decision");
    for (const result of [parsed(call({ reason: "x" }, {}, "catalog.unoffered")), parsed(call({ reason: "x" }), []), withoutTools]) {
      expect(result.response).toBeUndefined();
      expect(errorCodes(result.diagnostics)).toContain("llm_output.unexpected_field");
    }
  });

  it("is moved through the harness itself, which passes the offered tools to the parse", async () => {
    const result = await harnessed(call({ reason: "One note covers it." }));
    expect(result.ok).toBe(true);
    expect(result.response).toMatchObject({ decision: { input: { title: "Inventory", reason: "One note covers it." } } });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "info", code: "llm_output.key_moved_into_input" }));
  });

  it("gives the closed input correction to the unusable decision a refused key makes", async () => {
    const result = await harnessed(call({ notes: "x" }));
    expect(result.ok).toBe(false);
    const error = automationStudioLlmUnusableDecisionError(result)!;
    expect(error.fieldIssues).toEqual([{ code: "llm_output.unexpected_field", path: "response.decision", expectedPath: "response.decision.input" }]);
  });
});
