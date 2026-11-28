// t1093: why a chat's model call failed, in the thread's words. A provider that refused the request is said to have
// refused it, with its own screened sentence; "could not be reached" is kept for a call that got no answer.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError } from "../../../models/failures/index.ts";
import { automationStudioConversationModelProblem } from "../index.ts";

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";
const refused = (status: number, message: string | null) => new AutomationStudioLlmProviderError("llm.provider_http_error", "Anthropic refused the request.", status >= 500, status, undefined, undefined, { status, contentType: "application/json", bodyBytes: 200, error: { code: null, type: "invalid_request_error", param: null, message }, withheld: [], request: null });

describe("a chat model call's failure in words", () => {
  it("says a 400 as the provider's refusal, in its own words", () => {
    expect(automationStudioConversationModelProblem(refused(400, GRAMMAR))).toBe(`the model provider refused the request: ${GRAMMAR.replace(/\.$/u, "")}`);
  });

  it("never says an HTTP error could not be reached, whatever the record holds", () => {
    expect(automationStudioConversationModelProblem(refused(400, null))).toBe("the model provider refused the request (invalid_request_error)");
    expect(automationStudioConversationModelProblem(Object.assign(new Error("x"), { code: "llm.provider_http_error" }))).toBe("the model provider answered the request with an error");
  });

  it("reads a refusal only from a real failure of this process, never a look-alike's claim", () => {
    const lookAlike = Object.assign(new Error("x"), { code: "llm.provider_http_error", refusal: { status: 400, error: { message: "anything at all" } } });
    expect(automationStudioConversationModelProblem(lookAlike)).not.toContain("anything at all");
  });

  it("keeps could not be reached for a network failure", () => {
    expect(automationStudioConversationModelProblem(new AutomationStudioLlmProviderError("llm.provider_network_error", "Anthropic request failed at the network boundary.", true))).toBe("the model could not be reached");
  });
});
