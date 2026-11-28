// t1093: a provider that refused a request is said to have refused it, with its own screened sentence; never that it
// could not be reached.
import { describe, expect, it } from "vitest";
import { automationStudioLlmProviderRefusalWords } from "../index.ts";

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";

describe("a provider's refusal in words", () => {
  it("says a 4xx as a refusal with the provider's own sentence", () => {
    expect(automationStudioLlmProviderRefusalWords({ status: 400, error: { type: "invalid_request_error", message: GRAMMAR } }))
      .toBe("the model provider refused the request: The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools");
  });

  it("names the error type where the sentence was withheld, and says only the refusal where neither came", () => {
    expect(automationStudioLlmProviderRefusalWords({ status: 400, error: { type: "invalid_request_error", message: null } })).toBe("the model provider refused the request (invalid_request_error)");
    expect(automationStudioLlmProviderRefusalWords({ status: 404, error: null })).toBe("the model provider refused the request");
  });

  it("says a 5xx as a server error", () => {
    expect(automationStudioLlmProviderRefusalWords({ status: 529, error: { type: "overloaded_error", message: "Overloaded" } })).toBe("the model provider answered with a server error: Overloaded");
  });

  it("says nothing for what is no refusal record", () => {
    expect(automationStudioLlmProviderRefusalWords(undefined)).toBeUndefined();
    expect(automationStudioLlmProviderRefusalWords({ status: 200, error: null })).toBeUndefined();
    expect(automationStudioLlmProviderRefusalWords({ status: "400", error: { message: GRAMMAR } })).toBeUndefined();
  });
});
