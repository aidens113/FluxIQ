// t1093: a builder the model provider refused hands back the provider's refusal record beside its reason, for the
// person's return card alone; the reason the supervisor reads never carries the provider's sentence. On the
// dispatcher's garden catalogue.
import { describe, expect, it } from "vitest";
import { AutomationStudioFlowBootstrapGenerationError } from "../../../flow-authoring/bootstrap/generation-failure/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderRefusal } from "../../../models/failures/index.ts";
import { automationStudioProjectBuilderReturn } from "../../contracts/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "../ending.ts";
import { gardenBrief } from "./dispatch-fixture.ts";

const brief = gardenBrief("b-read", "list_seeds");
const spend = { allowance: undefined, trials: [] };
const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";
const REFUSAL: AutomationStudioLlmProviderRefusal = { status: 400, contentType: "application/json", bodyBytes: 210, error: { code: null, type: "invalid_request_error", param: null, message: GRAMMAR }, withheld: [], request: null };

/** The build failure a builder throws when its decision's provider refused the request, as the harness projects it. */
const buildFailure = () => new AutomationStudioFlowBootstrapGenerationError({
  code: "flow_bootstrap.provider_http_error", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "received",
  accounting: { requestId: "request.1", estimatedInputTokens: 100, provider: "anthropic", model: "claude-haiku-5-5", providerStatus: 400, providerRefusal: REFUSAL }
});

describe("a builder the model provider refused", () => {
  it("hands back the refusal record from its build failure, kept by the record's parse, with none of it in the reason", () => {
    const returned = ending.thrown(brief, buildFailure(), false, spend);
    expect(returned).toMatchObject({ outcome: "blocked", reason: "The builder failed: Flow Bootstrap generation failed (flow_bootstrap.provider_http_error).", providerRefusal: { status: 400, error: { message: GRAMMAR } } });
    expect(returned.reason).not.toContain("grammar");
    // Read back as the dispatch tool and the build record read it.
    const read = automationStudioProjectBuilderReturn.parse(JSON.parse(JSON.stringify(returned)));
    expect(read).toMatchObject({ status: "valid", value: { providerRefusal: { error: { type: "invalid_request_error", message: GRAMMAR } } } });
  });

  it("hands back the refusal record of a provider failure thrown as it stood, its message saying nothing of it", () => {
    const returned = ending.thrown(brief, new AutomationStudioLlmProviderError("llm.provider_http_error", "Anthropic refused the request.", false, 400, undefined, undefined, REFUSAL), false, spend);
    expect(returned.providerRefusal).toMatchObject({ status: 400, error: { message: GRAMMAR } });
    expect(returned.reason).not.toContain("grammar");
  });

  it("hands back none for any other throw, a stop, or a record that is no refusal record", () => {
    expect(ending.thrown(brief, new Error("something else"), false, spend)).not.toHaveProperty("providerRefusal");
    expect(ending.thrown(brief, buildFailure(), true, spend)).not.toHaveProperty("providerRefusal");
    const unbounded = new AutomationStudioLlmProviderError("llm.provider_http_error", "Anthropic refused the request.", false, 400, undefined, undefined, { ...REFUSAL, status: "400" } as unknown as AutomationStudioLlmProviderRefusal);
    expect(ending.thrown(brief, unbounded, false, spend)).not.toHaveProperty("providerRefusal");
  });
});
