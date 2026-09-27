// What a provider said when it refused a request, from the bytes it answered
// with to the stored record a caller reads back.
//
// The chain has been built three times from three ends and never joined: the
// adapter screened the answer, the harness carried it typed, and nothing stored
// it. These tests hold the join -- and the two properties that make storing it
// safe, which are that a refusal only ever travels through the parse the reader
// uses, and that a refusal a reader cannot vouch for is refused rather than
// republished as Core's own.
//
// The generation-failure barrel is imported first deliberately. It and
// `runtime/llm/` are a module cycle (the DeepSeek adapter reads this directory's
// output schema; this directory reads the refusal's parse), so this file enters
// it from the side that evaluates last in production, and a top-level read added
// anywhere in that graph fails here.
import { describe, expect, it } from "vitest";

import {
  flowBootstrapHarnessFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  type AutomationStudioFlowBootstrapFailureDiagnostic
} from "../index.ts";
import {
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
// The adapter's own barrel: reading and screening a refusal belongs to the
// adapter that got the answer, and `runtime/llm/` does not republish it.
import {
  automationStudioDeepSeekRefusalText,
  automationStudioDeepSeekRequestShape,
  readAutomationStudioDeepSeekRefusal
} from "../../../llm/deepseek/index.ts";

const INSTRUCTION = "Collect every product on the sale page and save the ones under twenty pounds";
const CREDENTIAL = "sk-live-credential-must-never-travel";
const LOCATOR = '[data-testid="cart-total"]';

/** A request shaped like the one a build sends, so the refusal's request shape is the real one. */
const TASK_REQUEST = {
  requestId: "request.refused",
  idempotencyKey: "idempotency.refused",
  taskKind: "flow_bootstrap",
  promptVersion: "automation-studio.flow-bootstrap.v1",
  expectedOutput: "flow_bootstrap",
  context: {
    schemaVersion: "0.1",
    taskKind: "flow_bootstrap",
    promptVersion: "automation-studio.flow-bootstrap.v1",
    projectId: "project.one",
    flowId: "flow.one",
    instructions: { instructionIds: ["instruction.one"], instructions: [INSTRUCTION], diagnostics: [], tokenBudget: 384, estimatedTokens: 24 }
  },
  tokenLimits: { maxInputTokens: 2_000, maxOutputTokens: 512, maxTotalTokens: 3_000 },
  estimatedInputTokens: 1_996,
  maxEstimatedCostUsd: 0.25,
  timeoutMs: 20_000
} as unknown as AutomationStudioLlmTaskRequest;

const PROVIDER = { provider: "deepseek", model: "deepseek-flash" };

/** The refusal as it reaches a caller: read from the provider's own bytes, screened, then typed. */
async function refusalOfAnswer(body: string, status = 400, contentType = "application/json") {
  const refusal = await readAutomationStudioDeepSeekRefusal({
    response: new Response(body, { status, headers: { "content-type": contentType } }),
    maxResponseBytes: 64_000,
    request: automationStudioDeepSeekRequestShape({ request: TASK_REQUEST, model: "deepseek-flash", body: '{"model":"deepseek-flash"}' }),
    credential: CREDENTIAL
  });
  // Exactly what the adapter throws, and exactly what the harness reads off it.
  const failure = normalizedAutomationStudioLlmProviderFailure(new AutomationStudioLlmProviderError(
    "llm.provider_http_error",
    "DeepSeek returned an unsuccessful HTTP status.",
    false,
    status,
    undefined,
    automationStudioDeepSeekRefusalText(refusal)
  ));
  return failure;
}

/** The stored diagnostic, as a reader gets it: through JSON, then through the parser. */
function storedAndParsed(diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic) {
  const stored: unknown = JSON.parse(JSON.stringify(diagnostic));
  return { stored, parsed: parseAutomationStudioFlowBootstrapFailureDiagnostic(stored) };
}

describe("a provider's refusal in a stored Flow Bootstrap failure", () => {
  it("carries the status, what the provider objected to, and every omission it named", async () => {
    const failure = await refusalOfAnswer(JSON.stringify({
      error: {
        code: "invalid_value",
        type: "invalid_request_error",
        param: "messages[1].content",
        message: `Rejected: the value near ${LOCATOR} exceeds max_tokens`
      }
    }));
    expect(failure.refusal).toBeDefined();

    const { diagnostic } = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: failure.code, message: failure.message, metadata: { retryable: failure.retryable, ...(failure.status === undefined ? {} : { providerStatus: failure.status }) } }],
      request: TASK_REQUEST,
      provider: PROVIDER,
      ...(failure.refusal ? { providerRefusal: failure.refusal } : {})
    });
    const { parsed } = storedAndParsed(diagnostic);

    // The record survives storage and the parser unchanged: this is the hop that
    // did not exist, and its whole value is that a reader gets the refusal back.
    expect(parsed).toEqual(diagnostic);
    expect(parsed?.code).toBe("flow_bootstrap.provider_http_error");
    const refusal = parsed?.accounting?.providerRefusal;
    expect(refusal?.status).toBe(400);
    expect(refusal?.error?.code).toBe("invalid_value");
    expect(refusal?.error?.type).toBe("invalid_request_error");
    // The field path is the reason a 400 is actionable at all.
    expect(refusal?.error?.param).toBe("messages[1].content");

    // Every omission named, and the locator the provider quoted back gone with
    // its name on it rather than silently.
    expect(refusal?.withheld).toContain("message_locator_shaped");
    expect(refusal?.error?.message).not.toContain("data-testid");
    expect(refusal?.error?.message).toContain("max_tokens");

    // The request's shape reaches the record whole: the producer's shape is
    // publishable by the central bounds, so nothing is lost to them.
    expect(refusal?.withheld).not.toContain("request_unpublishable");
    expect(refusal?.request).toMatchObject({ model: "deepseek-flash", taskKind: "flow_bootstrap" });

    const published = JSON.stringify(parsed);
    expect(published).not.toContain("cart-total");
    expect(published).not.toContain(CREDENTIAL);
    expect(published).not.toContain(INSTRUCTION);
  });

  it("says the provider sent nothing readable rather than saying nothing", async () => {
    const failure = await refusalOfAnswer("<html><body>Bad Gateway</body></html>", 502, "text/html; charset=utf-8");
    const { diagnostic } = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: failure.code, message: failure.message, metadata: { retryable: failure.retryable, ...(failure.status === undefined ? {} : { providerStatus: failure.status }) } }],
      request: TASK_REQUEST,
      provider: PROVIDER,
      ...(failure.refusal ? { providerRefusal: failure.refusal } : {})
    });
    const { parsed } = storedAndParsed(diagnostic);
    expect(parsed).toEqual(diagnostic);
    const refusal = parsed?.accounting?.providerRefusal;
    expect(refusal?.status).toBe(502);
    // An interposed proxy's error page: its media type and its size, its prose
    // named as withheld, and none of it carried.
    expect(refusal?.withheld).toContain("body_not_json");
    expect(refusal?.contentType).toBe("text/html; charset=utf-8");
    expect(refusal?.error).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain("Bad Gateway");
    // A 5xx is worth another attempt, and the status is what says so.
    expect(parsed?.retryable).toBe(true);
  });

  it("keeps a refusal out of the record of a call that was never made", async () => {
    const failure = await refusalOfAnswer(JSON.stringify({ error: { code: "invalid_value", param: "max_tokens" } }));
    // A refused run-budget reservation, arriving with provider metadata as it
    // did before the harness stopped sending any. Nothing about a provider may
    // be claimed for it: not the provider, not the model, and not an answer it
    // never gave.
    const { diagnostic } = flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code: "llm_budget.run_cost_limit", message: "private budget detail" }],
      request: TASK_REQUEST,
      provider: PROVIDER,
      ...(failure.refusal ? { providerRefusal: failure.refusal } : {})
    });
    expect(diagnostic).toEqual({
      code: "flow_bootstrap.run_budget_cost_exhausted",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      accounting: { requestId: "request.refused", estimatedInputTokens: 1_996 }
    });
    expect(storedAndParsed(diagnostic).parsed).toEqual(diagnostic);
  });

  it("publishes the harness code it could not name, on either catch-all arm", () => {
    const provider = flowBootstrapHarnessFailure({
      providerInvocation: "unknown",
      diagnostics: [{ severity: "error", code: "llm.something_core_has_never_seen", message: "private detail" }],
      request: TASK_REQUEST,
      provider: PROVIDER
    }).diagnostic;
    expect(provider).toMatchObject({
      code: "flow_bootstrap.provider_transport_unknown",
      stage: "provider_request",
      issueCodes: ["llm.something_core_has_never_seen"]
    });
    expect(storedAndParsed(provider).parsed).toEqual(provider);

    const preProvider = flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code: "llm_budget.something_else_new", message: "private detail" }],
      request: TASK_REQUEST
    }).diagnostic;
    expect(preProvider).toMatchObject({
      code: "flow_bootstrap.harness_preflight_failed",
      stage: "pre_provider_validation",
      issueCodes: ["llm_budget.something_else_new"]
    });
    expect(storedAndParsed(preProvider).parsed).toEqual(preProvider);

    // A recognised refusal says what it is and needs no second word for it.
    expect(flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_rate_limited", message: "private detail" }],
      request: TASK_REQUEST,
      provider: PROVIDER
    }).diagnostic).not.toHaveProperty("issueCodes");
  });

  describe("a record the reader cannot vouch for", () => {
    const base = {
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request" as const,
      retryable: false,
      providerInvocation: "attempted" as const,
      providerResponse: "received" as const,
      accounting: { requestId: "request.stored", estimatedInputTokens: 100, provider: "deepseek", model: "deepseek-flash", providerStatus: 400 }
    };
    const withRefusal = (providerRefusal: unknown) => ({ ...base, accounting: { ...base.accounting, providerRefusal } });
    const READABLE = { status: 400, contentType: "application/json", bodyBytes: 90, error: null, request: null, withheld: [] };

    it("reads the record Core publishes", () => {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(withRefusal(READABLE))).toEqual(withRefusal(READABLE));
    });

    it.each([
      ["a refusal with no status", { ...READABLE, status: undefined }],
      ["a status no provider could answer with", { ...READABLE, status: 42 }],
      ["an account of its omissions that is not a vocabulary", { ...READABLE, withheld: ["the provider objected to the max_tokens field"] }],
      ["more omissions than a vocabulary has", { ...READABLE, withheld: Array.from({ length: 33 }, (_entry, index) => `withheld_${index}`) }],
      ["a refusal that is not a record", [READABLE]],
      ["a refusal that is a number", 400],
      // The older carriage: one JSON string on the thrown failure. It would
      // read, and what read back would not be what was stored.
      ["a refusal carried as JSON text", JSON.stringify(READABLE)]
    ])("refuses %s, and the whole failure with it", (_name, providerRefusal) => {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(withRefusal(providerRefusal))).toBeNull();
    });

    // The other level of the rule: a *field* the bounds will not carry is
    // dropped and named, because a record that says what it left out is not
    // silent -- and refusing the failure over it would erase a true account of
    // the rest.
    it("names a field it will not carry instead of refusing the record", () => {
      const parsed = parseAutomationStudioFlowBootstrapFailureDiagnostic(withRefusal({
        ...READABLE,
        request: { model: "deepseek-flash", instruction: "Collect every product on the sale page" }
      }));
      expect(parsed?.accounting?.providerRefusal?.request).toBeNull();
      expect(parsed?.accounting?.providerRefusal?.withheld).toContain("request_unpublishable");
      expect(JSON.stringify(parsed)).not.toContain("sale page");
    });

    // The producer and the reader share the parse, so this cannot drift: a
    // record the reader would refuse is one the producer does not store, and an
    // erased diagnostic is what this directory exists to prevent.
    it("stores nothing the reader would refuse", () => {
      const { diagnostic } = flowBootstrapHarnessFailure({
        providerInvocation: "attempted",
        diagnostics: [{ severity: "error", code: "llm.provider_http_error", message: "private", metadata: { retryable: false, providerStatus: 400 } }],
        request: TASK_REQUEST,
        provider: PROVIDER,
        // A record an adapter could hand over typed, which `provider-contract.ts`
        // does not bound on that path: no status, so not a refusal at all.
        providerRefusal: { contentType: "application/json", bodyBytes: 12, error: null, request: null, withheld: [] } as never
      });
      expect(diagnostic.accounting).not.toHaveProperty("providerRefusal");
      expect(storedAndParsed(diagnostic).parsed).toEqual(diagnostic);
    });
  });
});
