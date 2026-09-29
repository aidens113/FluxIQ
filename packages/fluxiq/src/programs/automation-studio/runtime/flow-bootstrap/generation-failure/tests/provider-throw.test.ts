// What a stored Flow Bootstrap failure says about an untyped provider throw,
// from the throw to the record a caller reads back.
//
// `run-mun5e1ie-5aeefbbd` ended on `flow_bootstrap.provider_transport_unknown`
// with invocation and response `unknown` and nothing else, so a reset socket, a
// connect timeout and a bug in an adapter were one record. These tests hold the
// chain -- normalizer, harness diagnostic, projection, parse -- and the rules
// that make storing it safe: only beside that code, only through the reader's
// parse, and never a malformed one.
//
// The generation-failure barrel is imported first, as in
// `provider-refusal.test.ts`, so the module cycle with `runtime/llm/` is entered
// from the side that evaluates last in production.
import { describe, expect, it } from "vitest";

import {
  flowBootstrapHarnessFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError,
  parseAutomationStudioFlowBootstrapProviderThrow
} from "../index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";

const REQUEST = { requestId: "request.throw", estimatedInputTokens: 10 } as unknown as AutomationStudioLlmTaskRequest;
const PROVIDER = { provider: "deepseek", model: "deepseek-flash" };

async function projectedThrow(thrown: unknown) {
  const result = await runAutomationStudioLlmHarness({
    taskKind: "runtime_diagnosis",
    projectId: "project.llm",
    flowId: "flow.checkout",
    runId: "run.throw",
    requestId: "request.throw",
    instructions: [],
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.1,
    provider: { metadata: PROVIDER, runTask: async () => { throw thrown; } }
  });
  return flowBootstrapHarnessFailure(result);
}

describe("a stored failure's account of an untyped provider throw", () => {
  it("publishes the class, the cause's code and the message of a failed fetch, and reads it back", async () => {
    const failure = await projectedThrow(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));

    expect(failure.diagnostic).toMatchObject({
      code: "flow_bootstrap.provider_transport_unknown",
      stage: "provider_request",
      providerInvocation: "unknown",
      providerResponse: "unknown",
      providerThrow: { errorClass: "TypeError", causeCode: "ECONNRESET", message: "fetch failed" }
    });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure.diagnostic)).toEqual(failure.diagnostic);
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
    // Survives the store: what the Lab reads is the JSON, not the object.
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(JSON.parse(JSON.stringify(failure.diagnostic)))).toEqual(failure.diagnostic);
  });

  it.each([
    ["an authorization header", "request failed: Authorization: Bearer x"],
    ["a configured-looking key", "rejected sk-live0123456789abcdefghij"]
  ])("keeps the codes and drops a message carrying %s", async (_label, message) => {
    const failure = await projectedThrow(new TypeError(message, { cause: { code: "ECONNRESET" } }));

    expect(failure.diagnostic.providerThrow).toEqual({ errorClass: "TypeError", causeCode: "ECONNRESET", withheld: ["message_credential_shaped"] });
    expect(JSON.stringify(failure.diagnostic)).not.toMatch(/Bearer|sk-live/u);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure.diagnostic)).toEqual(failure.diagnostic);
  });

  it("carries a throw on the default arm too, beside the harness code it could not name", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "unknown",
      diagnostics: [{ severity: "error", code: "llm.something_core_has_never_seen", message: "private", metadata: { providerThrow: { errorClass: "Error", errorCode: "EPIPE" } } }],
      request: REQUEST,
      provider: PROVIDER
    });
    expect(failure.diagnostic).toMatchObject({ issueCodes: ["llm.something_core_has_never_seen"], providerThrow: { errorClass: "Error", errorCode: "EPIPE" } });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure.diagnostic)).toEqual(failure.diagnostic);
  });

  it("stores no throw it would refuse to read, and keeps the failure", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "unknown",
      diagnostics: [{ severity: "error", code: "llm.provider_request_failed", message: "m", metadata: { providerThrow: { errorClass: "has a space", headers: "x" } } }],
      request: REQUEST,
      provider: PROVIDER
    });
    expect(failure.diagnostic.code).toBe("flow_bootstrap.provider_transport_unknown");
    expect(failure.diagnostic).not.toHaveProperty("providerThrow");
  });

  it("never carries a throw beside a typed failure", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_network_error", message: "m", metadata: { retryable: true, providerThrow: { errorClass: "TypeError" } } }],
      request: REQUEST,
      provider: PROVIDER
    });
    expect(failure.diagnostic.code).toBe("flow_bootstrap.provider_network_error");
    expect(failure.diagnostic).not.toHaveProperty("providerThrow");
  });
});

describe("reading a stored provider throw", () => {
  const stored = {
    code: "flow_bootstrap.provider_transport_unknown",
    stage: "provider_request",
    retryable: false,
    providerInvocation: "unknown",
    providerResponse: "unknown",
    accounting: { requestId: "request.throw", estimatedInputTokens: 10, provider: "deepseek", model: "deepseek-flash" }
  };

  it("reads every field the producer writes", () => {
    const providerThrow = { errorClass: "TypeError", errorCode: "E1", causeClass: "SocketError", causeCode: "UND_ERR_SOCKET", message: "other side closed", withheld: ["message_locator_shaped", "message_truncated"] };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...stored, providerThrow })).toEqual({ ...stored, providerThrow });
  });

  it.each([
    ["an unknown field", { errorClass: "TypeError", headers: "authorization" }],
    ["an empty record", {}],
    ["a class with whitespace", { errorClass: "Type Error" }],
    ["a numeric code", { causeCode: 104 }],
    ["an empty message", { message: "" }],
    ["a message over its bound", { message: "x".repeat(241) }],
    ["a message over two lines", { message: "a\nb" }],
    ["an unknown withheld reason", { withheld: ["message_leaked"] }],
    ["a repeated withheld reason", { withheld: ["message_truncated", "message_truncated"] }],
    ["an empty withheld list", { withheld: [] }],
    ["a string", "fetch failed"]
  ])("refuses %s", (_label, providerThrow) => {
    expect(parseAutomationStudioFlowBootstrapProviderThrow(providerThrow)).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...stored, providerThrow })).toBeNull();
  });

  it("refuses a throw beside any other code", () => {
    const timeout = { ...stored, code: "flow_bootstrap.provider_timeout", retryable: true, providerResponse: "not_received" };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(timeout)).not.toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...timeout, providerThrow: { errorClass: "TypeError" } })).toBeNull();
  });
});
