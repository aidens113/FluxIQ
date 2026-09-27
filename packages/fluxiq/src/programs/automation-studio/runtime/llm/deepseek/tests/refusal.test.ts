import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import { createAutomationStudioDeepSeekProvider } from "../provider.ts";
import { estimateAutomationStudioDeepSeekInputTokens } from "../request-body.ts";
import { automationStudioDeepSeekRequestShape } from "../request-shape.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH,
  type AutomationStudioDeepSeekRefusal
} from "../refusal.ts";

/**
 * A refusal is only worth reading if it says something, so every case here
 * asserts both halves: what the record carries, and what it names as withheld.
 *
 * The two live runs this was written for -- `run-muhs8hx3-6fd929e6` and
 * `run-muhtuizo-c458e49c` -- died with a status and nothing else, and the adapter
 * threw one line after the provider's answer was in hand.
 */
describe("Automation Studio DeepSeek refusal", () => {
  it("names what a JSON error body said, and withholds nothing when there is nothing to withhold", async () => {
    const refusal = await refusalFrom(jsonRefusal(400, {
      error: { message: "Invalid value for 'max_tokens': must be at most 8192", type: "invalid_request_error", param: "max_tokens", code: "invalid_value" }
    }));

    expect(refusal.failure.code).toBe("llm.provider_http_error");
    expect(refusal.failure.status).toBe(400);
    expect(refusal.failure.retryable).toBe(false);
    expect(refusal.record).toMatchObject({
      status: 400,
      contentType: "application/json",
      error: {
        code: "invalid_value",
        type: "invalid_request_error",
        param: "max_tokens",
        message: "Invalid value for 'max_tokens': must be at most 8192"
      },
      withheld: []
    });
    expect(refusal.record.bodyBytes).toBeGreaterThan(0);
  });

  it("carries the shape of the request the provider refused, and never its content", async () => {
    const refusal = await refusalFrom(jsonRefusal(400, { error: { message: "Bad request.", code: "invalid_request" } }));

    // Counts, bounds and Core's own ids. The request-id pair is the only place a
    // retried or duplicated call is visible at all.
    expect(refusal.record.request).toMatchObject({
      model: "deepseek-flash",
      taskKind: "runtime_diagnosis",
      expectedOutput: "diagnosis",
      requestId: "request.one",
      idempotencyKey: "idempotency.one",
      responseFormat: "json_object",
      timeoutMs: 20_000,
      tokens: { maxInput: 8000, maxOutput: 2000, maxTotal: 10_000 },
      outputSchema: { offered: true },
      toolIds: null,
      evidence: null,
      catalog: null,
      exploredPackets: null,
      malformed: []
    });
    expect(refusal.record.request.bodyBytes).toBeGreaterThan(0);
    expect(refusal.record.request.tokens.inputHeadroom).toBe(8000 - refusal.record.request.tokens.measuredInput);
    expect(refusal.record.request.tokens.totalHeadroom).toBe(10_000 - (refusal.record.request.tokens.measuredInput + 2000));
    // Two messages, each measured, neither quoted. The key list is the guarantee:
    // a later edit that adds message text fails here.
    expect(refusal.record.request.messages.map((message) => Object.keys(message).sort())).toEqual([
      ["bytes", "empty", "role"],
      ["bytes", "empty", "role"]
    ]);
    expect(refusal.record.request.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(refusal.record.request.messages.every((message) => message.bytes > 0 && message.empty === false)).toBe(true);
    // The instruction the request carried is a person's text and is in the body
    // that was sent. None of it is in the record.
    expect(refusal.text).not.toContain(INSTRUCTION_MARKER);
    expect(refusal.text).not.toContain(refusal.outboundUserMessage);
  });

  it("names a non-JSON body as withheld rather than quoting it", async () => {
    const body = `<html><body>Bad Request: ${INSTRUCTION_MARKER}</body></html>`;
    const refusal = await refusalFrom(() => new Response(body, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }));

    expect(refusal.failure.code).toBe("llm.provider_http_error");
    expect(refusal.record).toMatchObject({
      status: 400,
      contentType: "text/html; charset=utf-8",
      bodyBytes: Buffer.byteLength(body, "utf8"),
      error: null,
      withheld: ["body_not_json"]
    });
    expect(refusal.text).not.toContain("Bad Request");
    expect(refusal.text).not.toContain(INSTRUCTION_MARKER);
  });

  it("says why a rate limit was refused, which the status alone never did", async () => {
    const refusal = await refusalFrom(jsonRefusal(429, {
      error: { message: "Rate limit reached for deepseek-flash: 60 requests per minute", type: "rate_limit_error", code: "rate_limit_exceeded" }
    }));

    expect(refusal.failure.code).toBe("llm.provider_rate_limited");
    expect(refusal.failure.status).toBe(429);
    expect(refusal.failure.retryable).toBe(true);
    expect(refusal.record).toMatchObject({
      status: 429,
      error: { code: "rate_limit_exceeded", type: "rate_limit_error", message: "Rate limit reached for deepseek-flash: 60 requests per minute", param: null },
      withheld: []
    });
  });

  it("says why a credential was rejected, and keeps its code", async () => {
    const refusal = await refusalFrom(jsonRefusal(401, { error: { message: "Authentication Fails, Your api key is invalid", code: "invalid_request_error" } }));

    expect(refusal.failure.code).toBe("llm.provider_auth_failed");
    expect(refusal.failure.status).toBe(401);
    expect(refusal.failure.retryable).toBe(false);
    expect(refusal.record.error?.message).toBe("Authentication Fails, Your api key is invalid");
  });

  it("replaces a locator the provider quoted back, and names that it did", async () => {
    const refusal = await refusalFrom(jsonRefusal(400, {
      error: { message: 'Invalid content near [data-testid="cart-total"]', param: "messages[1].content", code: "invalid_value" }
    }));

    expect(refusal.record.withheld).toContain("message_locator_shaped");
    expect(refusal.record.error?.message).toContain("[locator withheld]");
    expect(refusal.record.error?.param).toBe("messages[1].content");
    expect(refusal.text).not.toContain("data-testid");
    expect(refusal.text).not.toContain("cart-total");
  });

  it("drops a message that echoes the configured credential, whole", async () => {
    const refusal = await refusalFrom(jsonRefusal(400, { error: { message: `Bad authorization: Bearer ${PROVIDER_SECRET}`, code: "invalid_request_error" } }));

    expect(refusal.record.withheld).toContain("message_credential_shaped");
    expect(refusal.record.error).toMatchObject({ code: "invalid_request_error", message: null });
    expect(refusal.text).not.toContain(PROVIDER_SECRET);
  });

  it("cuts a message over the length bound and names the cut", async () => {
    const message = `${"a".repeat(AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH)}TAIL`;
    const refusal = await refusalFrom(jsonRefusal(400, { error: { message, code: "invalid_value" } }));

    expect(refusal.record.withheld).toContain("message_truncated");
    expect(refusal.record.error?.message).toHaveLength(AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH);
    expect(refusal.text).not.toContain("TAIL");
  });

  it("names a JSON body that carries no error, and an error field that is not a name", async () => {
    const noError = await refusalFrom(jsonRefusal(400, { ok: false }));
    expect(noError.record).toMatchObject({ error: null, withheld: ["error_object_absent"] });

    const unnamed = await refusalFrom(jsonRefusal(400, { error: { message: "Bad request.", code: { nested: true }, param: 'button[aria-label="Buy"]' } }));
    expect(unnamed.record.withheld).toContain("error_fields_unnamed");
    expect(unnamed.record.error).toMatchObject({ code: null, param: null, message: "Bad request." });
    expect(unnamed.text).not.toContain("aria-label");
  });

  it("names an empty body rather than reading it as a provider that said nothing was wrong", async () => {
    const refusal = await refusalFrom(() => new Response(null, { status: 400 }));
    expect(refusal.record).toMatchObject({ bodyBytes: 0, error: null, withheld: ["body_empty"] });
  });

  it("keeps the status's own failure when the refusal body is too large to hold", async () => {
    const refusal = await refusalFrom(jsonRefusal(400, { error: { message: "x".repeat(4_000), code: "invalid_value" } }), { maxResponseBytes: 512 });

    // The read's own refusal must not become the failure reported: a ceiling on
    // how much of a refusal is held says nothing about why the request failed.
    expect(refusal.failure.code).toBe("llm.provider_http_error");
    expect(refusal.record).toMatchObject({ bodyBytes: null, error: null, withheld: ["body_over_limit"] });
    expect(refusal.record.request.requestId).toBe("request.one");
  });

  it("names the tool schemas an exploration was offered, by id", () => {
    const shape = automationStudioDeepSeekRequestShape({
      request: explorationRequest(),
      model: "deepseek-flash",
      body: "{}"
    });

    expect(shape.toolIds).toEqual(["web.navigate", "web.read"]);
    expect(shape.evidence).toEqual({ calls: 1, iteration: 4 });
    expect(shape.taskKind).toBe("evidence_tool_decision");
  });

  it("names a request field that arrived empty or disagreed with itself", () => {
    const base = requestWithMeasuredTokens();
    const shape = automationStudioDeepSeekRequestShape({
      request: { ...base, estimatedInputTokens: base.estimatedInputTokens + 1, context: { ...base.context, instructions: undefined as unknown as AutomationStudioLlmTaskRequest["context"]["instructions"] } },
      model: "deepseek-flash",
      body: "{}"
    });

    expect(shape.malformed).toEqual(["context.instructions", "estimatedInputTokens"]);
  });
});

const PROVIDER_SECRET = "test-secret-value";
const INSTRUCTION_MARKER = "ONLY_IN_THE_REQUEST_BODY";

function jsonRefusal(status: number, payload: unknown): () => Response {
  return () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

/** The failure the adapter throws for a reply, with the refusal read off it. */
async function refusalFrom(
  response: () => Response,
  options: { maxResponseBytes?: number } = {}
): Promise<{
  failure: { code: string; status: number | undefined; retryable: boolean };
  record: AutomationStudioDeepSeekRefusal;
  text: string;
  outboundUserMessage: string;
}> {
  let outboundBody = "";
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (input) => { outboundBody = input.outboundBody; return PROVIDER_SECRET; },
    fetchImpl: (async () => response()) as typeof fetch,
    ...(options.maxResponseBytes === undefined ? {} : { maxResponseBytes: options.maxResponseBytes })
  });
  try {
    await provider.runTask(requestWithMeasuredTokens());
    throw new Error("Expected the provider request to be refused.");
  } catch (error) {
    expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
    const failure = error as AutomationStudioLlmProviderError;
    expect(failure.responseBody).toBeTypeOf("string");
    const outbound = JSON.parse(outboundBody) as { messages: Array<{ role: string; content: string }> };
    return {
      failure: { code: failure.code, status: failure.status, retryable: failure.retryable },
      record: JSON.parse(failure.responseBody!) as AutomationStudioDeepSeekRefusal,
      text: failure.responseBody!,
      outboundUserMessage: outbound.messages.find((message) => message.role === "user")!.content
    };
  }
}

/**
 * A request whose declared input estimate agrees with what this adapter measures,
 * so `malformed` is empty unless a test makes it otherwise.
 */
function requestWithMeasuredTokens(): AutomationStudioLlmTaskRequest {
  const base = request();
  return { ...base, estimatedInputTokens: estimateAutomationStudioDeepSeekInputTokens(base, "deepseek-flash") };
}

function request(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: {
        instructions: [{ instructionId: "instruction.one", scopeKind: "flow", title: "What to do", body: `Buy the cheapest item. ${INSTRUCTION_MARKER}`, priority: 1, requirement: "required", tags: [] }],
        instructionIds: ["instruction.one"],
        diagnostics: [],
        tokenBudget: 8000,
        estimatedTokens: 12
      }
    }
  };
}

/** A decision request, for the shape's own account of what an exploration was offered. */
function explorationRequest(): AutomationStudioLlmTaskRequest {
  const base = request();
  return {
    ...base,
    taskKind: "evidence_tool_decision",
    expectedOutput: "evidence_tool_decision",
    context: {
      ...base.context,
      taskKind: "evidence_tool_decision",
      evidenceLoop: {
        iteration: 4,
        tools: [
          { toolId: "web.navigate", description: "Go to an address.", inputSchema: { type: "object" }, effect: "mutate" },
          { toolId: "web.read", description: "Read the page.", inputSchema: { type: "object" }, effect: "observe" }
        ],
        evidence: [{ callId: "call.one", toolId: "web.read", value: { rows: 2 } }],
        decisionSchema: { type: "object" },
        completionSchema: { type: "object" },
        canComplete: false
      }
    }
  };
}
