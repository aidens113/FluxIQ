import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS,
  automationStudioLlmProviderErrorSpendsCall,
  automationStudioLlmProviderFailureSpendsCall
} from "../failure-disposition.ts";
import {
  AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES,
  AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES,
  AutomationStudioLlmProviderError,
  type AutomationStudioLlmProviderErrorCode
} from "../provider-contract.ts";

// The table that decides whether a failed call ends its grant. Its contract:
// every provider code has exactly one entry, a new code cannot fall into either
// side by omission, and anything that is not a typed provider failure ends the
// grant.

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
// Fails the type check if a code is added to the contract without an entry, or
// an entry names a code the contract does not have.
const tableKeysAreTheCodes: Equal<keyof typeof AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS, AutomationStudioLlmProviderErrorCode> = true;

/** The failures that are only a spent call: the model's reply, or the network. */
const SPENT_CALL_CODES = [
  "llm.provider_timeout",
  "llm.provider_network_error",
  "llm.provider_rate_limited",
  "llm.provider_malformed_response",
  "llm.provider_output_invalid",
  "llm.provider_output_truncated",
  "llm.provider_output_padding_truncated",
  "llm.provider_response_oversize",
  "llm.provider_usage_invalid"
];

describe("the provider failure disposition table", () => {
  it("has exactly one entry for every provider failure code, and no other", () => {
    expect(tableKeysAreTheCodes).toBe(true);
    expect(Object.keys(AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS).sort()).toEqual(
      [...AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES, ...AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES].sort()
    );
    expect(Object.isFrozen(AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS)).toBe(true);
  });

  // A request Core refused to build will be refused again, so none of the
  // seventeen is ever a spent call.
  it("ends the grant on every one of the seventeen pre-send refusals", () => {
    expect(AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES).toHaveLength(17);
    for (const code of AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES) {
      expect(AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS[code]).toBe("end_grant");
      expect(automationStudioLlmProviderFailureSpendsCall({ code })).toBe(false);
    }
  });

  it("keeps the grant only for the model's reply and the network, and ends it for everything about the authorization", () => {
    const spent = AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES.filter((code) => automationStudioLlmProviderFailureSpendsCall({ code }));
    expect([...spent].sort()).toEqual([...SPENT_CALL_CODES].sort());
    for (const code of ["llm.provider_auth_failed", "llm.provider_redirect_rejected", "llm.provider_secret_unavailable", "llm.provider_aborted", "llm.provider_usage_limit_exceeded"]) {
      expect(AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS[code as AutomationStudioLlmProviderErrorCode]).toBe("end_grant");
    }
  });

  // An HTTP failure is the network only when the provider says it is.
  it("treats an HTTP failure as a spent call only for a 5xx status", () => {
    for (const status of [500, 502, 503, 599]) expect(automationStudioLlmProviderFailureSpendsCall({ code: "llm.provider_http_error", status })).toBe(true);
    for (const status of [400, 402, 404, 422, 499, 600, undefined, 500.5]) expect(automationStudioLlmProviderFailureSpendsCall({ code: "llm.provider_http_error", status })).toBe(false);
  });

  // Fail closed: no code, an unknown code, or a key that only an object's
  // prototype has, all end the grant.
  it("ends the grant for anything that is not a provider code in the table", () => {
    for (const code of ["llm.provider_request_failed", "llm.provider_configuration_invalid", "llm_output.invalid_kind", "", "toString", "constructor", "__proto__"]) {
      expect(automationStudioLlmProviderFailureSpendsCall({ code })).toBe(false);
    }
  });

  it("reads a thrown error by its code and status, never by its message", () => {
    expect(automationStudioLlmProviderErrorSpendsCall(new AutomationStudioLlmProviderError("llm.provider_malformed_response", "LLM execution grant is unavailable."))).toBe(true);
    expect(automationStudioLlmProviderErrorSpendsCall(new AutomationStudioLlmProviderError("llm.provider_http_error", "x", true, 503))).toBe(true);
    expect(automationStudioLlmProviderErrorSpendsCall(new AutomationStudioLlmProviderError("llm.provider_http_error", "x", false, 400))).toBe(false);
    expect(automationStudioLlmProviderErrorSpendsCall(new AutomationStudioLlmProviderError("llm.provider_auth_failed", "timed out"))).toBe(false);
    // An untyped error whose message sounds like a spent call is still untyped.
    expect(automationStudioLlmProviderErrorSpendsCall(new Error("llm.provider_timeout"))).toBe(false);
    // Something shaped like a provider error, that the provider did not throw.
    expect(automationStudioLlmProviderErrorSpendsCall({ code: "llm.provider_timeout", retryable: true })).toBe(false);
    expect(automationStudioLlmProviderErrorSpendsCall(undefined)).toBe(false);
  });
});
