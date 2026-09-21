import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";

const tools: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "test.inspect", description: "Show initial evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
  { toolId: "test.reveal", description: "Reveal hidden evidence.", inputSchema: { type: "object" }, effect: "observe" },
  { toolId: "test.press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" },
  { toolId: "test.after", description: "Must not run after a request.", inputSchema: { type: "object" }, effect: "observe" }
];

describe("Flow Bootstrap evidence visibility", () => {
  it.each([
    ["withholds a name found only in hidden intermediate batch evidence", "Hidden refund", null],
    ["retains a name from evidence shown before the batch", "Visible refund", "Visible refund"]
  ])("%s", async (_name, requestedName, expectedName) => {
    const executed: string[] = [];
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: ["instruction.one"],
      executeTool: async (call) => {
        executed.push(call.toolId);
        if (call.toolId === "test.inspect") return { kind: "llm_evidence_tool_execution", evidence: { control: "Visible refund" }, effectApplied: true };
        if (call.toolId === "test.reveal") return { kind: "llm_evidence_tool_execution", evidence: { control: "Hidden refund" }, effectApplied: true };
        if (call.toolId === "test.press") {
          if (!call.permission) throw new Error("permission check was not bound");
          const verdict = await call.permission({ consequences: ["move_money"], control: { name: requestedName, kind: "button" }, verb: "press" });
          return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: verdict.permitted ? "unexpected" : "permission_required" }, effectApplied: false };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { ran: true }, effectApplied: true };
      },
      now: () => 1_000,
      newRequestId: () => "permission.1"
    });

    const loop = await runAutomationStudioLlmEvidenceLoop({
      tools,
      maxActionsPerDecision: 3,
      signal: permissions.signal,
      decide: async () => ({
        kind: "tool_calls",
        calls: [
          { toolId: "test.reveal", input: {} },
          { toolId: "test.press", input: {} },
          { toolId: "test.after", input: {} }
        ]
      }),
      executeTool: permissions.executeTool
    });
    const ended = permissions.endedOnRequest(loop);

    expect(executed).toEqual(["test.inspect", "test.reveal", "test.press"]);
    expect(loop).toMatchObject({ ok: false, code: "llm_evidence_loop.cancelled" });
    expect(ended?.diagnostic).toMatchObject({
      code: "flow_bootstrap.permission_required",
      permissionRequest: {
        action: { kind: "exploration_step", id: "test.press", ref: "batch.1.2" },
        control: { name: expectedName, kind: "button" }
      }
    });
  });
});
