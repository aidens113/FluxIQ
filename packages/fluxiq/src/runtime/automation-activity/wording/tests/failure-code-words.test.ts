// t1093: an unsuccessful HTTP status is the provider answering, so it is never "could not be reached"; with the
// failure's refusal record it is said with the provider's own sentence. A call that got no answer still is.
import { describe, expect, it } from "vitest";
import { automationStudioActivityFailureCodeWords } from "../index.ts";

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";

describe("a build's failure code in words", () => {
  it("says a provider's 400 as the refusal it was, with the provider's sentence", () => {
    expect(automationStudioActivityFailureCodeWords("flow_bootstrap.provider_http_error", { status: 400, error: { type: "invalid_request_error", message: GRAMMAR } }))
      .toBe(`the model provider refused the request: ${GRAMMAR.replace(/\.$/u, "")}`);
    expect(automationStudioActivityFailureCodeWords("llm.provider_http_error", { status: 400, error: { type: "invalid_request_error", message: GRAMMAR } })).toMatch(/^the model provider refused the request: The compiled grammar/u);
  });

  it("never says an HTTP error could not be reached, even without its record", () => {
    expect(automationStudioActivityFailureCodeWords("flow_bootstrap.provider_http_error")).toBe("the model provider answered the request with an error");
  });

  it("keeps could not be reached for a call that got no answer", () => {
    expect(automationStudioActivityFailureCodeWords("llm.provider_network_error")).toBe("the model could not be reached");
    expect(automationStudioActivityFailureCodeWords("flow_bootstrap.provider_request_failed")).toBe("the model could not be reached");
    expect(automationStudioActivityFailureCodeWords("llm.provider_redirect_rejected")).not.toContain("could not be reached");
  });
});
