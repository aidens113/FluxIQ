import { describe, expect, it } from "vitest";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_NO_REPAIR_REASONS, parseAutomationStudioLlmProviderResult, type AutomationStudioLlmTaskRequest } from "../harness.ts";

// What a model may answer when there is nothing to repair.
//
// Under a `diagnose_and_adapt` grant the patch schema was one target override
// with at least one handle and no other shape, so a model asked to repair a
// deleted item, a locked record or a retired page had no schema-valid way to
// say so: every refusal task in the 2026-09-17 live campaign came back with a
// control that was merely pressable. Declining is now an answer, with a reason
// from a closed list, and Core records it as a refusal that proposes nothing.
describe("a runtime patch the model declines", () => {
  it("offers a no_repair answer beside the one target override a proposal grant buys", async () => {
    const outbound = await outboundRequest();

    const schema = outbound.userPayload.outputSchema as { oneOf?: Array<Record<string, JsonLike>> };
    expect(schema.oneOf).toHaveLength(2);
    const [patch, declined] = schema.oneOf!;
    expect(patch).toMatchObject({ properties: { kind: { const: "runtime_patch" } } });
    expect(declined).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["kind", "summary", "reason"],
      properties: { kind: { const: "no_repair" }, reason: { enum: Object.keys(AUTOMATION_STUDIO_NO_REPAIR_REASONS) } }
    });
  });

  it("tells the model, in the patch prompt, when to decline and that declining is allowed", async () => {
    const outbound = await outboundRequest();

    expect(outbound.systemPrompt).toContain("Answer no_repair");
    expect(outbound.systemPrompt).toMatch(/gone|refuses|tells them apart/u);
  });

  it("tells the model, in the diagnosis prompt, that not repairable is an answer", async () => {
    const outbound = await outboundRequest({
      taskKind: "runtime_diagnosis",
      expectedOutput: "diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      context: {
        schemaVersion: "0.1",
        taskKind: "runtime_diagnosis",
        promptVersion: "automation-studio.runtime-diagnosis.v1",
        projectId: "project.one",
        flowId: "flow.one",
        instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
      }
    });

    expect(outbound.systemPrompt).toContain("stillAchievable no");
  });

  it("reads a declined answer back, with its reason, where a runtime patch was expected", () => {
    for (const reason of Object.keys(AUTOMATION_STUDIO_NO_REPAIR_REASONS)) {
      const parsed = parseAutomationStudioLlmProviderResult({ response: { kind: "no_repair", summary: "The record was deleted.", reason } }, "runtime_patch");

      expect(parsed.response, reason).toEqual({ kind: "no_repair", summary: "The record was deleted.", reason });
      expect(parsed.diagnostics.filter((diagnostic: { severity: string }) => diagnostic.severity === "error"), reason).toEqual([]);
    }
  });

  it("refuses a reason outside the closed list, and a decline with no reason at all", () => {
    for (const response of [
      { kind: "no_repair", summary: "No.", reason: "because I say so" },
      { kind: "no_repair", summary: "No." },
      { kind: "no_repair", summary: "No.", reason: "control_gone", patches: [] }
    ]) {
      const parsed = parseAutomationStudioLlmProviderResult({ response }, "runtime_patch");

      expect(parsed.response, JSON.stringify(response)).toBeUndefined();
      expect(parsed.diagnostics.some((diagnostic: { severity: string }) => diagnostic.severity === "error"), JSON.stringify(response)).toBe(true);
    }
  });

  // Every word in the list is one of the reasons a live refusal task had, said
  // in the words a person reading the run would use.
  it("names a reason for each way a page says no", () => {
    expect(Object.keys(AUTOMATION_STUDIO_NO_REPAIR_REASONS)).toEqual(["control_gone", "control_refused", "several_alike", "destination_gone", "person_required"]);
    for (const description of Object.values(AUTOMATION_STUDIO_NO_REPAIR_REASONS)) expect(description.length).toBeGreaterThan(20);
  });
});

type JsonLike = unknown;

/** The request a proposal-grant patch call sends, read off the stubbed transport. */
async function outboundRequest(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): Promise<{ systemPrompt: string; userPayload: Record<string, unknown> }> {
  let captured: RequestInit | undefined;
  const answer = overrides.expectedOutput === "diagnosis"
    ? { kind: "diagnosis", summary: "The control is gone.", diagnosis: { stillAchievable: "no", patchNeeded: false } }
    : { kind: "no_repair", summary: "Nothing here replaces it.", reason: "control_gone" };
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
      }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
    }) as typeof fetch
  });

  await provider.runTask(patchRequest(overrides));
  const body = JSON.parse(String(captured?.body)) as { messages: Array<{ role: string; content: string }> };
  return {
    systemPrompt: body.messages.find((message) => message.role === "system")!.content,
    userPayload: JSON.parse(body.messages.find((message) => message.role === "user")!.content) as Record<string, unknown>
  };
}

function patchRequest(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_patch",
    promptVersion: "automation-studio.runtime-patch.v1",
    expectedOutput: "runtime_patch",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
    maxEstimatedCostUsd: 0.25,
    metadata: { executionPurpose: "diagnose_and_adapt" },
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_patch",
      promptVersion: "automation-studio.runtime-patch.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    },
    ...overrides
  };
}
